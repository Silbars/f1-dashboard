import { describe, expect, it } from 'vitest';
import { stintSpan } from '../src/lib/replay';

describe('stintSpan', () => {
  it('starts lap 1 at the left edge and covers its laps inclusively', () => {
    expect(stintSpan(1, 10, 50)).toEqual({ left: 0, width: 20 });
  });

  it('places a later stint after the earlier laps', () => {
    expect(stintSpan(11, 50, 50)).toEqual({ left: 20, width: 80 });
  });

  it('covers a one-lap stint with one lap of width', () => {
    expect(stintSpan(25, 25, 50)).toEqual({ left: 48, width: 2 });
  });

  it('does not divide by zero when the race length is unknown', () => {
    expect(stintSpan(1, 1, 0)).toEqual({ left: 0, width: 100 });
  });
});
