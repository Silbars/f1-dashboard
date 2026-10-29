import type { OverviewDriver, OverviewRound, SeasonOverview } from '@f1/shared';
import { describe, expect, it } from 'vitest';
import { buildProgress } from '../src/lib/progress';

const round = (n: number): OverviewRound => ({
  round: n, raceName: `GP ${n}`, country: 'X', date: null, hasSprint: false, poleman: null, winner: null, sprintWinner: null,
});

const driver = (id: string, race: OverviewDriver['race'], sprint: OverviewDriver['sprint'] = {}): OverviewDriver => ({
  driverId: id, code: id.toUpperCase(), name: id, colour: null, teamId: 't', teamName: 'T', race, sprint,
});

const overview = (drivers: OverviewDriver[]): SeasonOverview => ({ season: 2026, rounds: [round(1), round(2), round(3)], drivers });

describe('buildProgress', () => {
  it('only includes rounds someone has raced', () => {
    const p = buildProgress(overview([driver('a', { 1: { positionText: '1', points: 25 } })]));
    expect(p.rounds.map((r) => r.round)).toEqual([1]);
  });

  it('accumulates race and sprint points', () => {
    const p = buildProgress(
      overview([driver('a', { 1: { positionText: '1', points: 25 }, 2: { positionText: '2', points: 18 } }, { 2: { positionText: '1', points: 8 } })]),
    );
    expect(p.series[0]!.points).toEqual([25, 51]);
  });

  it('breaks a points tie on wins, and leaves a late starter out until they start', () => {
    const p = buildProgress(
      overview([
        driver('a', { 1: { positionText: '2', points: 18 }, 2: { positionText: '2', points: 7 } }),
        driver('b', { 1: { positionText: '1', points: 7 }, 2: { positionText: '1', points: 18 } }),
        driver('c', { 2: { positionText: '3', points: 15 } }),
      ]),
    );
    const [a, b, c] = p.series;
    expect(a!.points).toEqual([18, 25]);
    expect(b!.points).toEqual([7, 25]);
    expect(b!.position).toEqual([2, 1]); // level on 25, b has the two wins
    expect(a!.position).toEqual([1, 2]);
    expect(c!.points).toEqual([null, 15]);
    expect(c!.position).toEqual([null, 3]);
  });
});
