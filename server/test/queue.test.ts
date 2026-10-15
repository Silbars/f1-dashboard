import { describe, expect, it, vi } from 'vitest';
import { createQueue, HttpError } from '../src/services/queue.ts';

/** A fake clock: sleep() advances time instantly so tests run fast and deterministically. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe('createQueue', () => {
  it('limits starts per second and per window', async () => {
    const clock = fakeClock();
    const q = createQueue({ perSecond: 3, perWindow: 5, windowMs: 8_000, ...clock });
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 6 }, (_, i) => q.run(`k${i}`, async () => void starts.push(clock.now()))));
    expect(starts.slice(0, 3)).toEqual([0, 0, 0]);
    expect(starts[3]).toBeGreaterThanOrEqual(1000); // 4th waits for the per-second limit
    expect(starts[5]).toBeGreaterThanOrEqual(8_000); // 6th waits for the window
  });

  it('shares one in-flight promise per key', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, ...fakeClock() });
    const task = vi.fn(async () => 42);
    const [a, b] = await Promise.all([q.run('same', task), q.run('same', task)]);
    expect([a, b]).toEqual([42, 42]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs the same key again once the first call has settled', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, ...fakeClock() });
    const task = vi.fn(async () => 1);
    await q.run('k', task);
    await q.run('k', task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 using Retry-After, then succeeds', async () => {
    const clock = fakeClock();
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, ...clock });
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(429, 5000, 'slow down'))
      .mockResolvedValueOnce('ok');
    await expect(q.run('k', task)).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
    expect(clock.now()).toBeGreaterThanOrEqual(5000);
  });

  it('gives up after the retry budget', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, retries: 2, ...fakeClock() });
    const task = vi.fn(async () => {
      throw new HttpError(429, null, 'slow down');
    });
    await expect(q.run('k', task)).rejects.toBeInstanceOf(HttpError);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, ...fakeClock() });
    const task = vi.fn(async () => {
      throw new HttpError(500, null, 'boom');
    });
    await expect(q.run('k', task)).rejects.toThrow('boom');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('fails fast instead of waiting out a long window', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 1, windowMs: 3_600_000, ...fakeClock() });
    await q.run('a', async () => 1);
    const task = vi.fn(async () => 2);
    await expect(q.run('b', task)).rejects.toMatchObject({ status: 429 });
    expect(task).not.toHaveBeenCalled();
  });

  it('does not retry a 429 whose Retry-After exceeds the wait cap', async () => {
    const q = createQueue({ perSecond: 10, perWindow: 100, windowMs: 60_000, ...fakeClock() });
    const task = vi.fn(async () => {
      throw new HttpError(429, 3_600_000, 'x');
    });
    await expect(q.run('k', task)).rejects.toMatchObject({ status: 429 });
    expect(task).toHaveBeenCalledTimes(1);
  });
});
