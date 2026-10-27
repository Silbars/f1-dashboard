import { type ODriver, type OSession, openf1 } from './openf1.ts';

const DAY = 86_400_000;
const FAIL_RETRY = 300_000;
const WAIT_MS = 8_000; // OpenF1 calls are queued 2 s apart; a slow lookup must not hold the page up

const cache = new Map<number, { until: number; byCode: Map<string, string> }>();
const inflight = new Map<number, Promise<Map<string, string>>>();

/** OpenF1 lists a headshot per driver per session; the season's last race has everyone who drove. */
async function lookup(year: number): Promise<Map<string, string>> {
  const sessions = await openf1<OSession>(`sessions?year=${year}&session_name=Race`);
  const last = sessions.sort((a, b) => a.date_start.localeCompare(b.date_start)).at(-1);
  if (!last) return new Map();
  const drivers = await openf1<ODriver>(`drivers?session_key=${last.session_key}`);
  // The default 1col crop is soft at card size; 2col is the next size up.
  return new Map(drivers.flatMap((d) => (d.headshot_url ? [[d.name_acronym, d.headshot_url.replace('/1col/', '/2col/')] as const] : [])));
}

/** Headshot URL by driver code. Empty when OpenF1 has none or is slow; the next request tries again. */
// shortcut: in-memory per process, so a restart refetches; move it to Mongo if cold starts get slow.
export async function headshots(year: number): Promise<Map<string, string>> {
  const hit = cache.get(year);
  if (hit && hit.until > Date.now()) return hit.byCode;

  let run = inflight.get(year);
  if (!run) {
    run = lookup(year)
      .then((byCode) => {
        cache.set(year, { until: Date.now() + (byCode.size ? DAY : FAIL_RETRY), byCode });
        return byCode;
      })
      .catch((err: Error) => {
        console.warn('Headshot lookup failed:', err.message);
        cache.set(year, { until: Date.now() + FAIL_RETRY, byCode: new Map() });
        return new Map<string, string>();
      })
      .finally(() => inflight.delete(year));
    inflight.set(year, run);
  }
  return Promise.race([run, new Promise<Map<string, string>>((r) => setTimeout(() => r(new Map()), WAIT_MS).unref())]);
}
