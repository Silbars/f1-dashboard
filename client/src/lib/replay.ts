import type { ReplaySample } from '@f1/shared';

export const SPEEDS = [1, 2, 4, 8, 16] as const;
/** A car is held at its last position across a gap longer than this, rather than sliding to the next sample. */
export const HOLD_MS = 2000;
const KEEP_MS = 5000;

type SampleBuffer = Map<number, ReplaySample[]>;

/** Appends samples per car, keeping each car's list sorted by t (a seek can deliver older samples). */
export function addSamples(buf: SampleBuffer, samples: ReplaySample[]): void {
  for (const s of samples) {
    const list = buf.get(s[0]) ?? [];
    list.push(s);
    buf.set(s[0], list);
  }
  for (const list of buf.values()) {
    if (list.some((s, i) => i > 0 && s[1] < list[i - 1]![1])) list.sort((a, b) => a[1] - b[1]);
  }
}

/** Drops samples older than t − 5 s, but keeps the last sample at or before t so the car can still be drawn. */
export function pruneBefore(buf: SampleBuffer, t: number): void {
  for (const list of buf.values()) {
    let lastAtOrBefore = -1;
    for (let i = 0; i < list.length && list[i]![1] <= t; i++) lastAtOrBefore = i;
    const firstKept = list.findIndex((s) => s[1] >= t - KEEP_MS);
    const cut = Math.min(firstKept === -1 ? list.length : firstKept, lastAtOrBefore === -1 ? list.length : lastAtOrBefore);
    if (cut > 0) list.splice(0, cut);
  }
}

/** Where a car is at time t: linear between the samples either side, held across long gaps. */
export function positionAt(list: ReplaySample[], t: number): [number, number] | null {
  let lo = 0;
  let hi = list.length - 1;
  let i = -1; // last index with sample.t ≤ t
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]![1] <= t) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (i === -1) {
    // Before the first sample: a car on the grid is shown where its first sample puts it, if that is close.
    const first = list[0];
    return first && first[1] - t <= HOLD_MS ? [first[2], first[3]] : null;
  }
  const [, t0, x0, y0] = list[i]!;
  const next = list[i + 1];
  if (!next || next[1] - t0 > HOLD_MS) return [x0, y0];
  const f = (t - t0) / (next[1] - t0);
  return [x0 + (next[2] - x0) * f, y0 + (next[3] - y0) * f];
}

/** Uniform scale into the canvas minus padding, centred, with y flipped so larger y is higher on screen. */
export function fitToCanvas(outline: [number, number][], w: number, h: number, pad = 24): (x: number, y: number) => [number, number] {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = pad + (w - 2 * pad - spanX * scale) / 2;
  const offY = pad + (h - 2 * pad - spanY * scale) / 2;
  const maxY = minY + spanY;
  return (x, y) => [offX + (x - minX) * scale, offY + (maxY - y) * scale];
}

/** Replay time now, from the last state the server sent (`at` is this tab's performance.now()). */
export function clockAt(s: { t: number; playing: boolean; speed: number; at: number }, now: number, durationMs: number): number {
  if (!s.playing) return s.t;
  return Math.min(s.t + (now - s.at) * s.speed, durationMs);
}

/** h:mm:ss */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
