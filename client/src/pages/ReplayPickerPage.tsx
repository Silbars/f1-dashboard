import type { ReplaySessionSummary } from '@f1/shared';
import { Link } from 'react-router';
import { PageHeader, QueryState } from '../components/States';
import { formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';

/** The server sends newest first, so the order of first appearance keeps the weekends newest first too. */
function byWeekend(sessions: ReplaySessionSummary[]) {
  const weekends = new Map<number, ReplaySessionSummary[]>();
  for (const s of sessions) weekends.set(s.meetingKey, [...(weekends.get(s.meetingKey) ?? []), s]);
  return [...weekends.values()];
}

export default function ReplayPickerPage() {
  const q = useApi<ReplaySessionSummary[]>('/replay/sessions');
  return (
    <section>
      <PageHeader title="Race replays" />
      <QueryState q={q}>
        {(sessions) =>
          sessions.length === 0 ? (
            <p className="text-zinc-400">No replays are stored yet. They are added automatically after each race weekend.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byWeekend(sessions).map((weekend) => (
                <li key={weekend[0]!.meetingKey} className="rounded-lg border border-zinc-800 p-4">
                  <h2 className="font-semibold">{weekend[0]!.meetingName}</h2>
                  <p className="mb-3 text-sm text-zinc-400">{weekend[0]!.countryName}</p>
                  <ul className="space-y-2">
                    {weekend.map((s) => (
                      <li key={s.sessionKey}>
                        <Link to={`/replay/${s.sessionKey}`} className="block rounded border border-zinc-800 p-3 hover:border-accent">
                          <span className="font-medium">{s.sessionType}</span>
                          <span className="block text-sm text-zinc-400">
                            <time dateTime={s.startsAt}>{formatDateTime(s.startsAt)}</time> · {s.totalLaps} laps
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}
