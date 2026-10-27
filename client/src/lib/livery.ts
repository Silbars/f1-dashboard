export interface Livery {
  id: string;
  name: string;
  accent: string; // buttons, active states
  accent2: string; // highlights and emphasis
  accent3: string; // data and secondary markers
  ink: string; // text on the accent
}

/**
 * Palettes approximate each team's livery. Ids match server/src/services/teamColours.ts.
 * shortcut: colours are hand-picked approximations, not official brand values; tune them here.
 */
export const LIVERIES: Livery[] = [
  { id: 'default', name: 'F1 red', accent: '#e10600', accent2: '#ffd400', accent3: '#22d3ee', ink: '#ffffff' },
  { id: 'ferrari', name: 'Ferrari', accent: '#dc0000', accent2: '#ffea00', accent3: '#fff3d6', ink: '#ffffff' },
  { id: 'mercedes', name: 'Mercedes', accent: '#00d2be', accent2: '#c4cdd5', accent3: '#ffffff', ink: '#04110f' },
  { id: 'red_bull', name: 'Red Bull', accent: '#1e41ff', accent2: '#ffd500', accent3: '#dc0000', ink: '#ffffff' },
  { id: 'mclaren', name: 'McLaren', accent: '#ff8000', accent2: '#47c7fc', accent3: '#ffffff', ink: '#1a0d00' },
  { id: 'williams', name: 'Williams', accent: '#1868db', accent2: '#00a0de', accent3: '#ffffff', ink: '#ffffff' },
  { id: 'aston_martin', name: 'Aston Martin', accent: '#229971', accent2: '#cedc00', accent3: '#ffffff', ink: '#ffffff' },
  { id: 'alpine', name: 'Alpine', accent: '#0090ff', accent2: '#ff87bc', accent3: '#ffffff', ink: '#ffffff' },
  { id: 'haas', name: 'Haas', accent: '#e6002b', accent2: '#b6babd', accent3: '#ffffff', ink: '#ffffff' },
  { id: 'audi', name: 'Audi', accent: '#f50537', accent2: '#c9ced3', accent3: '#ffffff', ink: '#ffffff' },
  { id: 'cadillac', name: 'Cadillac', accent: '#d7dbe0', accent2: '#c8102e', accent3: '#ffffff', ink: '#0a0a0a' },
  { id: 'rb', name: 'Racing Bulls', accent: '#6692ff', accent2: '#ffffff', accent3: '#1e41ff', ink: '#ffffff' },
  { id: 'sauber', name: 'Kick Sauber', accent: '#52e252', accent2: '#c9d1d9', accent3: '#ffffff', ink: '#04110a' },
];

const KEY = 'f1.livery';

export const liveryById = (id: string | null | undefined): Livery => LIVERIES.find((l) => l.id === id) ?? LIVERIES[0]!;

/** A choice the viewer made; null when they have not picked one. Storage can be blocked, so reads never throw. */
export function readStoredLivery(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeStoredLivery(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}

export function applyLivery(l: Livery): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', l.accent);
  root.style.setProperty('--accent-2', l.accent2);
  root.style.setProperty('--accent-3', l.accent3);
  root.style.setProperty('--accent-ink', l.ink);
  root.style.setProperty('--accent-hi', `color-mix(in oklab, ${l.accent} 80%, white)`);
  root.style.setProperty('--accent-text', `color-mix(in oklab, ${l.accent} 60%, white)`);
  root.dataset.livery = l.id;
}
