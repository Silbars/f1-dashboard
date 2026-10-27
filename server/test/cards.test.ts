import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDriverCards, buildTeamCards } from '../src/services/cards.ts';
import { type MRData, toDriver, toRaceResults, toTeam } from '../src/services/jolpica.transform.ts';
import { withColour } from '../src/services/teamColours.ts';

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
const drivers = fixture('2025-drivers').DriverTable!.Drivers.map(toDriver);
const races = toRaceResults([fixture('2025-1-results')], 'race');
const teams = fixture('2025-constructors').ConstructorTable!.Constructors.map(toTeam).map(withColour);

describe('buildDriverCards', () => {
  const photos = new Map([['NOR', 'https://img/nor.png']]);
  const cards = buildDriverCards(drivers, races, teams, photos);

  it('puts the round winner first and gives him his team and photo', () => {
    expect(cards[0]).toMatchObject({ driverId: 'norris', teamId: 'mclaren', colour: '#F47600', headshot: 'https://img/nor.png' });
  });

  it('has no photo for a driver OpenF1 did not list', () => {
    expect(cards.find((d) => d.driverId === 'hamilton')?.headshot).toBeNull();
  });

  it('lists a driver who has not raced last, with no team', () => {
    const unraced = buildDriverCards([...drivers, { ...drivers[0]!, driverId: 'newcomer', code: 'NEW', familyName: 'Zed' }], races, teams, photos);
    expect(unraced.at(-1)).toMatchObject({ driverId: 'newcomer', teamId: null, colour: null });
  });
});

describe('buildTeamCards', () => {
  it('lists each team with its drivers, the team of the round winner first', () => {
    const t = buildTeamCards(teams, buildDriverCards(drivers, races, teams, new Map()));
    expect(t[0]?.teamId).toBe('mclaren');
    expect(t[0]?.drivers.map((d) => d.driverId).sort()).toEqual(['norris', 'piastri']);
  });
});
