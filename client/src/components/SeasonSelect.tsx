import { THIS_YEAR } from '../lib/useSeason';

const SEASONS = Array.from({ length: THIS_YEAR - 1949 }, (_, i) => THIS_YEAR - i);

export function SeasonSelect({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      Season
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
      >
        {SEASONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
