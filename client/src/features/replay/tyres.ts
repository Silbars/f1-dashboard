/** Tyre compounds use broadcast colours, so they read the same in every livery. */
export const TYRE: Record<string, { letter: string; hex: string; ink: string }> = {
  SOFT: { letter: 'S', hex: '#e10600', ink: '#ffffff' },
  MEDIUM: { letter: 'M', hex: '#ffd400', ink: '#000000' },
  HARD: { letter: 'H', hex: '#f4f4f5', ink: '#000000' },
  INTERMEDIATE: { letter: 'I', hex: '#39b54a', ink: '#000000' },
  WET: { letter: 'W', hex: '#0067ff', ink: '#ffffff' },
};

/** The compound's entry, or a grey fallback for a compound the table does not know. */
export const tyreOf = (compound: string | null) => TYRE[compound?.toUpperCase() ?? ''] ?? { letter: '?', hex: '#52525b', ink: '#ffffff' };
