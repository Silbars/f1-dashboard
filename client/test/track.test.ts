import type { ReplaySample } from '@f1/shared';
import { describe, expect, it } from 'vitest';
import { parkedAt, pathMarks, retiredHidden } from '../src/lib/replay';

const car = (...pts: [t: number, x: number, y: number][]): ReplaySample[] => pts.map(([t, x, y]) => [1, t, x, y]);

describe('parkedAt', () => {
  it('is true when the car has not moved around that time', () => {
    expect(parkedAt(car([9000, 500, 500], [10000, 503, 498], [11000, 501, 502]), 10_000)).toBe(true);
  });

  it('is false when the car is still moving', () => {
    expect(parkedAt(car([9000, 0, 0], [10000, 400, 0], [11000, 800, 0]), 10_000)).toBe(false);
  });

  it('is null with fewer than two samples in the window', () => {
    expect(parkedAt(car([1000, 0, 0], [10000, 5, 5]), 10_000)).toBeNull();
    expect(parkedAt([], 10_000)).toBeNull();
  });

  it('ignores samples outside the window', () => {
    // The car moved long ago and is still now.
    expect(parkedAt(car([1000, 0, 0], [9000, 900, 900], [10000, 901, 900]), 10_000)).toBe(true);
  });
});

describe('retiredHidden', () => {
  const others = (v: boolean) => () => v;

  it('never hides a car before its last lap began', () => {
    expect(retiredHidden(true, 50_000, 60_000, true, others(true))).toBe(false);
  });

  it('hides a parked car and shows a moving one', () => {
    expect(retiredHidden(false, 70_000, 60_000, true, others(false))).toBe(true);
    expect(retiredHidden(true, 70_000, 60_000, false, others(false))).toBe(false);
  });

  it('with no samples of its own, hides the car when other cars have samples and otherwise keeps the last answer', () => {
    expect(retiredHidden(false, 70_000, 60_000, null, others(true))).toBe(true);
    expect(retiredHidden(true, 70_000, 60_000, null, others(false))).toBe(true);
    expect(retiredHidden(false, 70_000, 60_000, null, others(false))).toBe(false);
  });

  it('does not ask about other cars when it already knows', () => {
    const never = () => {
      throw new Error('should not be called');
    };
    expect(retiredHidden(false, 70_000, 60_000, true, never)).toBe(true);
  });
});

describe('pathMarks', () => {
  it('spaces marks along a closed path with the heading of their segment', () => {
    // Out 100 and back: marks at 20, 60, 100 going out and 140, 180 coming back.
    const marks = pathMarks([[0, 0], [100, 0]], 40);
    expect(marks.map((m) => Math.round(m.x))).toEqual([20, 60, 100, 60, 20]);
    expect(marks.map((m) => m.angle)).toEqual([0, 0, 0, Math.PI, Math.PI]);
  });

  it('skips repeated points instead of dividing by zero', () => {
    expect(pathMarks([[0, 0], [0, 0], [30, 0]], 20).length).toBeGreaterThan(0);
  });
});
