import { describe, expect, it } from 'vitest';
import { countdownParts } from '../src/lib/countdown';

describe('countdownParts', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');

  it('splits the remaining time', () => {
    expect(countdownParts('2026-10-17T13:04:05Z', now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  });

  it('reports done once the target has passed', () => {
    expect(countdownParts('2026-10-15T09:59:59Z', now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it('reports done with all zeros when now equals target', () => {
    expect(countdownParts('2026-10-15T10:00:00Z', now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it('reports all zeros but not done 500ms before target', () => {
    expect(countdownParts('2026-10-15T10:00:00.500Z', now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: false });
  });
});
