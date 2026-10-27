import type { Race } from '@f1/shared';
import { CircuitOutlineModel } from '../models/CircuitOutline.ts';
import { type OLap, type OLocation, type OSession, openf1 } from './openf1.ts';
import { outlineLap, toSamples } from './replay/transform.ts';

/** Jolpica circuit id to OpenF1 circuit_key. A circuit missing here gets no thumbnail; add it when a new one joins the calendar. */
export const OPENF1_CIRCUIT_KEY: Record<string, number> = {
  albert_park: 10, shanghai: 49, suzuka: 46, miami: 151, villeneuve: 23, monaco: 22, catalunya: 15, red_bull_ring: 19,
  silverstone: 2, spa: 7, hungaroring: 4, zandvoort: 55, monza: 39, madring: 153, baku: 144, sepang: 12,
  marina_bay: 61, americas: 9, rodriguez: 65, interlagos: 14, vegas: 152, losail: 150, yas_marina: 70,
};

/** A thumbnail is drawn small, so a few hundred points is plenty. */
const MAX_POINTS = 200;
/** Newest finished races tried before a circuit is recorded as having no outline. */
const RACES_TRIED = 3;

/** Keeps at most MAX_POINTS evenly spaced points, rounded to whole units. */
export function thin(points: [number, number][]): [number, number][] {
  const step = Math.max(1, Math.ceil(points.length / MAX_POINTS));
  return points.filter((_, i) => i % step === 0).map(([x, y]) => [Math.round(x), Math.round(y)]);
}

/** The fastest clean lap of the newest finished race that has one. Throws on an OpenF1 failure, so nothing empty is stored for it. */
async function fetchOutline(circuitKey: number): Promise<[number, number][]> {
  const races = (await openf1<OSession>(`sessions?circuit_key=${circuitKey}&session_name=Race`))
    .filter((s) => Date.parse(s.date_end) < Date.now())
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start))
    .slice(0, RACES_TRIED);
  for (const s of races) {
    const lap = outlineLap(await openf1<OLap>(`laps?session_key=${s.session_key}`));
    if (!lap) continue;
    const rows = await openf1<OLocation>(
      `location?session_key=${s.session_key}&driver_number=${lap.n}&date>=${lap.from}&date<${lap.to}`,
    );
    const outline = thin(toSamples(rows, 0).map(([, , x, y]): [number, number] => [x, y]));
    if (outline.length > 0) return outline;
  }
  return [];
}

const filling = new Set<string>();

/** Stores one circuit's outline. A failure is logged and left unstored, so the next schedule request retries it. */
async function fill(circuitId: string, circuitKey: number) {
  try {
    const outline = await fetchOutline(circuitKey);
    await CircuitOutlineModel.updateOne({ circuitId }, { $set: { outline } }, { upsert: true });
  } catch (err) {
    console.error(`Track outline for ${circuitId} failed`, err);
  } finally {
    filling.delete(circuitId);
  }
}

/**
 * Adds stored outlines to the races. Circuits with none yet are fetched in the background, so the schedule
 * answers without waiting on OpenF1 (which is rate limited to one request every 2.1 s).
 */
export async function withOutlines(races: Race[]): Promise<Race[]> {
  const ids = [...new Set(races.map((r) => r.circuit.id))];
  const stored = new Map(
    (await CircuitOutlineModel.find({ circuitId: { $in: ids } }).lean<{ circuitId: string; outline: [number, number][] }[]>()).map(
      (d) => [d.circuitId, d.outline],
    ),
  );
  for (const id of ids) {
    const key = OPENF1_CIRCUIT_KEY[id];
    if (key === undefined || stored.has(id) || filling.has(id)) continue;
    filling.add(id);
    void fill(id, key);
  }
  return races.map((r) => {
    const outline = stored.get(r.circuit.id);
    return outline?.length ? { ...r, circuit: { ...r.circuit, outline } } : r;
  });
}
