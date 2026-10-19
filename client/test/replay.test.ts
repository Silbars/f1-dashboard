import type { ReplaySample } from '@f1/shared';
import { describe, expect, it } from 'vitest';
import { addSamples, clockAt, fitToCanvas, formatClock, positionAt, pruneBefore } from '../src/lib/replay';

describe('positionAt', () => {
  const list: ReplaySample[] = [
    [1, 0, 0, 0],
    [1, 1000, 10, 20],
  ];

  it('interpolates linearly between neighbours', () => {
    expect(positionAt(list, 500)).toEqual([5, 10]);
  });

  it('returns the exact sample on a hit', () => {
    expect(positionAt(list, 1000)).toEqual([10, 20]);
  });

  it('holds the last position across a gap over 2 s', () => {
    expect(positionAt([[1, 0, 0, 0], [1, 3000, 30, 30]], 1500)).toEqual([0, 0]);
  });

  it('holds a car on the grid just before its first sample, and is null well before it', () => {
    expect(positionAt(list, -1)).toEqual([0, 0]);
    expect(positionAt([[1, 5000, 7, 8]], 0)).toBeNull();
  });
});

describe('fitToCanvas', () => {
  const outline: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];

  it('keeps the bounding box inside the padding and flips y', () => {
    const map = fitToCanvas(outline, 400, 300, 20);
    const [x0, y0] = map(0, 0);
    const [x1, y1] = map(100, 50);
    expect(x0).toBeGreaterThanOrEqual(20);
    expect(x1).toBeLessThanOrEqual(380);
    expect(y0).toBeGreaterThanOrEqual(20);
    expect(y1).toBeLessThanOrEqual(280);
    expect(map(0, 50)[1]).toBeLessThan(map(0, 0)[1]); // larger y is higher on screen
  });

  it('scales uniformly', () => {
    const map = fitToCanvas(outline, 400, 300, 20);
    const dx = map(100, 0)[0] - map(0, 0)[0];
    const dy = map(0, 0)[1] - map(0, 50)[1];
    expect(dx / dy).toBeCloseTo(2);
  });
});

describe('clockAt', () => {
  it('returns t while paused', () => {
    expect(clockAt({ t: 5000, playing: false, speed: 4, at: 0 }, 9999, 120_000)).toBe(5000);
  });

  it('advances by wall time × speed while playing, and stops at the duration', () => {
    expect(clockAt({ t: 5000, playing: true, speed: 4, at: 1000 }, 1250, 120_000)).toBe(6000);
    expect(clockAt({ t: 119_000, playing: true, speed: 16, at: 0 }, 60_000, 120_000)).toBe(120_000);
  });
});

describe('buffer', () => {
  it('keeps each car sorted across batches', () => {
    const buf = new Map<number, ReplaySample[]>();
    addSamples(buf, [[1, 0, 0, 0], [1, 500, 5, 0]]);
    addSamples(buf, [[1, 1000, 10, 0]]);
    addSamples(buf, [[1, 250, 2, 0]]);
    expect(buf.get(1)!.map((s) => s[1])).toEqual([0, 250, 500, 1000]);
  });

  it('prunes old samples but keeps the last one at or before t', () => {
    const buf = new Map<number, ReplaySample[]>();
    addSamples(buf, [0, 2000, 4000, 9000, 10_000].map((t): ReplaySample => [1, t, t, 0]));
    pruneBefore(buf, 10_000);
    expect(buf.get(1)!.map((s) => s[1])).toEqual([9000, 10_000]);

    pruneBefore(buf, 100_000); // nothing ≤ t is newer than the last one, so it stays
    expect(buf.get(1)!.map((s) => s[1])).toEqual([10_000]);
  });
});

describe('formatClock', () => {
  it('formats h:mm:ss and clamps negatives', () => {
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock(-5000)).toBe('0:00:00');
  });
});
