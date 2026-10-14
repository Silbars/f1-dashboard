import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type MRData,
  toDriver,
  toRace,
  toRaceResults,
  toStandings,
  toTeam,
} from '../src/services/jolpica.transform.ts';

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;

describe('toRace', () => {
  const races = fixture('2025-schedule').RaceTable!.Races.map(toRace);

  it('maps the season schedule', () => {
    expect(races).toHaveLength(24);
    expect(races[0]).toMatchObject({
      season: 2025,
      round: 1,
      name: 'Australian Grand Prix',
      circuit: { id: 'albert_park', locality: 'Melbourne', country: 'Australia' },
    });
  });

  it('includes sprint sessions, sorted by time, ending with the race', () => {
    const china = races[1]!;
    expect(china.sessions.map((s) => s.type)).toEqual(['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']);
    expect(china.sessions.find((s) => s.type === 'sprint')?.startsAt).toBe('2025-03-22T03:00:00Z');
  });
});

describe('toRaceResults', () => {
  it('maps race results', () => {
    const [r] = toRaceResults([fixture('2025-1-results')], 'race');
    expect(r).toMatchObject({ season: 2025, round: 1, type: 'race', raceName: 'Australian Grand Prix' });
    expect(r!.entries).toHaveLength(20);
    expect(r!.entries[0]).toMatchObject({
      position: 1,
      driverId: 'norris',
      driverCode: 'NOR',
      driverName: 'Lando Norris',
      teamId: 'mclaren',
      teamName: 'McLaren',
      grid: 1,
      laps: 57,
      points: 25,
      time: '1:42:06.304',
      fastestLap: '1:22.167',
    });
  });

  it('maps qualifying times', () => {
    const [r] = toRaceResults([fixture('2025-1-qualifying')], 'qualifying');
    expect(r!.entries[0]).toMatchObject({ driverId: 'norris', q3: '1:15.096', points: 0 });
  });

  it('maps sprint results', () => {
    const [r] = toRaceResults([fixture('2025-2-sprint')], 'sprint');
    expect(r!.entries[0]).toMatchObject({ driverId: 'hamilton', position: 1, points: 8 });
  });

  it('merges a race split across two pages', () => {
    const full = fixture('2025-1-results');
    const race = full.RaceTable!.Races[0]!;
    const page1: MRData = { ...full, RaceTable: { Races: [{ ...race, Results: race.Results!.slice(0, 12) }] } };
    const page2: MRData = { ...full, RaceTable: { Races: [{ ...race, Results: race.Results!.slice(12) }] } };
    const results = toRaceResults([page1, page2], 'race');
    expect(results).toHaveLength(1);
    expect(results[0]!.entries).toHaveLength(20);
  });
});

describe('toStandings', () => {
  it('maps driver standings', () => {
    const s = toStandings([fixture('2025-driverstandings')], 'driver');
    expect(s).toMatchObject({ season: 2025, afterRound: 24, kind: 'driver' });
    expect(s!.entries[0]).toMatchObject({ position: 1, id: 'norris', name: 'Lando Norris', code: 'NOR', points: 423, wins: 7, teamId: 'mclaren' });
  });

  it('maps constructor standings', () => {
    const s = toStandings([fixture('2025-constructorstandings')], 'constructor');
    expect(s!.entries[0]).toMatchObject({ position: 1, id: 'mclaren', name: 'McLaren', points: 833, wins: 14, code: null });
  });

  it('returns null when there are no standings yet', () => {
    expect(toStandings([{ total: '0', StandingsTable: { StandingsLists: [] } }], 'driver')).toBeNull();
  });
});

describe('toDriver / toTeam', () => {
  it('maps drivers and teams', () => {
    const d = fixture('2025-drivers').DriverTable!.Drivers.map(toDriver);
    expect(d.find((x) => x.driverId === 'albon')).toEqual({
      driverId: 'albon',
      code: 'ALB',
      number: 23,
      givenName: 'Alexander',
      familyName: 'Albon',
      nationality: 'Thai',
      dateOfBirth: '1996-03-23',
    });
    const t = fixture('2025-constructors').ConstructorTable!.Constructors.map(toTeam);
    expect(t.find((x) => x.teamId === 'alpine')).toEqual({ teamId: 'alpine', name: 'Alpine F1 Team', nationality: 'French', colour: null });
  });
});
