import type { HomeData, StandingEntry } from '@f1/shared';
import { Link } from 'react-router';
import { Countdown } from '../components/Countdown';
import { QueryState } from '../components/States';
import { formatDateTime, SESSION_LABEL } from '../lib/format';
import { useApi } from '../lib/useApi';

function Top10({ title, rows, to }: { title: string; rows: StandingEntry[]; to: string }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No standings yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span>
                <span className="inline-block w-6 text-zinc-400">{e.position}</span>
                {e.name}
              </span>
              <span className="font-semibold tabular-nums">{e.points}</span>
            </li>
          ))}
        </ol>
      )}
      <Link to={to} className="mt-3 inline-block text-sm text-red-400 hover:underline">
        Full standings →
      </Link>
    </div>
  );
}

function Favourite({ label, entry }: { label: string; entry: StandingEntry | null }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-semibold">{entry ? `${entry.name}: P${entry.position ?? '—'}, ${entry.points} pts` : 'Not chosen yet'}</p>
    </div>
  );
}

export default function HomePage() {
  const q = useApi<HomeData>('/home');
  return (
    <QueryState q={q}>
      {(h) => (
        <div className="grid gap-6">
          <h1 className="sr-only">Home</h1>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6" aria-labelledby="next-session">
            {h.nextSession ? (
              <>
                <h2 id="next-session" className="text-sm text-zinc-400">
                  Round {h.nextSession.round} · {h.nextSession.raceName} · {SESSION_LABEL[h.nextSession.session.type]}
                </h2>
                <p className="mb-4 text-sm">{formatDateTime(h.nextSession.session.startsAt)}</p>
                <Countdown target={h.nextSession.session.startsAt} />
              </>
            ) : (
              <h2 id="next-session" className="text-lg font-semibold">
                The {h.season} season is complete.
              </h2>
            )}
            <div className="mt-6">
              <p className="mb-1 text-xs text-zinc-400">
                {h.progressPct}% of the {h.season} season completed ({h.completedRounds}/{h.totalRounds} rounds)
              </p>
              <div className="h-2 rounded bg-zinc-800" role="progressbar" aria-valuenow={h.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label="Season progress">
                <div className="h-2 rounded bg-red-600" style={{ width: `${h.progressPct}%` }} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 p-4" aria-labelledby="favourites-heading">
            <h2 id="favourites-heading" className="sr-only">Your favourites</h2>
            {h.favourites ? (
              <div className="flex flex-wrap gap-8">
                <Favourite label="Your driver" entry={h.favourites.driver} />
                <Favourite label="Your team" entry={h.favourites.team} />
                <Link to="/profile" className="self-center text-sm text-red-400 hover:underline">
                  Change
                </Link>
              </div>
            ) : (
              <p className="text-sm">
                <Link to="/login" className="text-red-400 hover:underline">
                  Log in
                </Link>{' '}
                to follow your favourite driver and team.
              </p>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Top10 title={`${h.season} drivers`} rows={h.driverTop10} to="/standings/drivers" />
            <Top10 title={`${h.season} constructors`} rows={h.constructorTop10} to="/standings/constructors" />
          </div>
        </div>
      )}
    </QueryState>
  );
}
