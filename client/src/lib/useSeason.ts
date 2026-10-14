import { useSearchParams } from 'react-router';

export const THIS_YEAR = new Date().getUTCFullYear();

export function useSeason(): [number, (s: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('season'));
  const season = Number.isInteger(raw) && raw >= 1950 && raw <= THIS_YEAR ? raw : THIS_YEAR;
  return [season, (s) => setParams((p) => (p.set('season', String(s)), p))];
}
