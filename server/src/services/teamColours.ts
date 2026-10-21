import type { Team } from '@f1/shared';

// OpenF1 team_colour per Jolpica constructorId (2026 values; sauber is the 2025 Alfa Romeo livery).
// shortcut: hand-kept list, add a line when a new team joins the grid; unknown teams show the grey fallback.
const COLOURS: Record<string, string> = {
  alpine: '#00A1E8',
  aston_martin: '#229971',
  audi: '#F50537',
  cadillac: '#909090',
  ferrari: '#ED1131',
  haas: '#9C9FA2',
  mclaren: '#F47600',
  mercedes: '#00D7B6',
  rb: '#6C98FF',
  red_bull: '#4781D7',
  sauber: '#C92D4B',
  williams: '#1868DB',
};

export const withColour = (t: Team): Team => ({ ...t, colour: COLOURS[t.teamId] ?? null });
