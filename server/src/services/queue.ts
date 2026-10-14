export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null, message: string) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new HttpError(res.status, retryAfter > 0 ? retryAfter * 1000 : null, `${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

export interface QueueOptions {
  perSecond: number;
  perWindow: number;
  windowMs: number;
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createQueue(opts: QueueOptions) {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = opts.retries ?? 3;
  const starts: number[] = []; // start times inside the current window, oldest first
  const inflight = new Map<string, Promise<unknown>>();
  let slotChain: Promise<void> = Promise.resolve();

  async function takeSlot(): Promise<void> {
    for (;;) {
      const t = now();
      while (starts.length > 0 && t - starts[0]! >= opts.windowMs) starts.shift();
      const lastSecond = starts.filter((s) => t - s < 1000);
      if (starts.length < opts.perWindow && lastSecond.length < opts.perSecond) {
        starts.push(t);
        return;
      }
      const waitWindow = starts.length >= opts.perWindow ? starts[0]! + opts.windowMs - t : 0;
      const waitSecond = lastSecond.length >= opts.perSecond ? lastSecond[0]! + 1000 - t : 0;
      await sleep(Math.max(waitWindow, waitSecond, 1));
    }
  }

  // Slots are handed out one at a time so concurrent callers can't overshoot the limits.
  function nextSlot(): Promise<void> {
    const slot = slotChain.then(takeSlot);
    slotChain = slot.catch(() => {});
    return slot;
  }

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = (async () => {
      for (let attempt = 0; ; attempt++) {
        await nextSlot();
        try {
          return await task();
        } catch (err) {
          if (err instanceof HttpError && err.status === 429 && attempt < retries) {
            await sleep(err.retryAfterMs ?? 1000 * 2 ** attempt);
            continue;
          }
          throw err;
        }
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  return { run };
}
