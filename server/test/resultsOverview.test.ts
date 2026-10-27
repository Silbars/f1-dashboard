import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ResultEntry } from '@f1/shared';
import { buildOverview, resultCode } from '../src/services/resultsOverview.ts';
import { type MRData, toRace, toRaceResults, toTeam } from '../src/services/jolpica.transform.ts';
import { withColour } from '../src/services/teamColours.ts';

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
const schedule = fixture('2025-schedule').RaceTable!.Races.map(toRace);
const races = toRaceResults([fixture('2025-1-results')], 'race');
const sprints = toRaceResults([fixture('2025-2-sprint')], 'sprint');
const teams = fixture('2025-constructors').ConstructorTable!.Constructors.map(toTeam).map(withColour);

describe('resultCode', () => {
  const entry = (positionText: string, status: string | null) => ({ positionText, status }) as ResultEntry;

  it('keeps the position of anyone who finished, lapped or not', () => {
    expect(resultCode(entry('7', 'Finished'))).toBe('7');
    expect(resultCode(entry('15', '+2 Laps'))).toBe('15');
    expect(resultCode(entry('12', 'Lapped'))).toBe('12');
  });

  it('turns a numbered retiree into a status letter', () => {
    expect(resultCode(entry('18', 'Collision'))).toBe('R');
    expect(resultCode(entry('19', 'Did not start'))).toBe('W');
    expect(resultCode(entry('20', 'Disqualified'))).toBe('D');
  });

  it('leaves letters the data already gave', () => {
    expect(resultCode(entry('N', 'Retired'))).toBe('N');
  });
});

describe('buildOverview', () => {
  const o = buildOverview(2025, schedule, races, sprints, [], teams);

  it('lists every scheduled round, raced or not', () => {
    expect(o.rounds).toHaveLength(24);
    expect(o.rounds[0]).toMatchObject({ round: 1, winner: { driverId: 'norris', colour: '#F47600' }, poleman: null });
    expect(o.rounds[23]).toMatchObject({ round: 24, winner: null, sprintWinner: null });
  });

  it('flags sprint weekends from the schedule', () => {
    expect(o.rounds.find((r) => r.round === 2)?.hasSprint).toBe(true);
    expect(o.rounds[0]?.hasSprint).toBe(false);
  });

  it('keys each driver result by round, race and sprint apart', () => {
    const norris = o.drivers.find((d) => d.driverId === 'norris')!;
    expect(norris.race[1]).toEqual({ positionText: '1', points: 25 });
    expect(norris.race[2]).toBeUndefined();
    const sprintDriver = o.drivers.find((d) => d.sprint[2]);
    expect(sprintDriver?.sprint[2]?.points).toBeGreaterThanOrEqual(0);
  });

  it('is empty before any session has run', () => {
    expect(buildOverview(2030, schedule, [], [], [], teams).drivers).toEqual([]);
  });
});
