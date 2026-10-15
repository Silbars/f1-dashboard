import type { Driver, PublicUser, Team } from '@f1/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router';
import { Loading } from '../components/States';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useMe } from '../lib/useMe';

export default function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const drivers = useApi<Driver[]>('/seasons/current/drivers');
  const teams = useApi<Team[]>('/seasons/current/teams');

  const update = useMutation({
    mutationFn: (patch: Partial<Pick<PublicUser, 'favouriteDriverId' | 'favouriteTeamId'>>) => api.patch<{ user: PublicUser }>('/users/me', patch),
    onSuccess: async ({ data }) => {
      qc.setQueryData(['me'], data.user);
      await qc.invalidateQueries({ queryKey: ['/home'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del('/users/me'),
    onSuccess: async () => {
      qc.setQueryData(['me'], null);
      await qc.invalidateQueries({ queryKey: ['/home'] });
      navigate('/');
    },
  });

  if (me.isPending) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  const user = me.data;
  const selectClass = 'w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2';

  return (
    <section className="mx-auto grid max-w-md gap-6">
      <h1 className="text-2xl font-bold">{user.displayName}</h1>
      <p className="text-sm text-zinc-400">{user.email}</p>

      <label className="grid gap-1 text-sm">
        Favourite driver
        <select
          className={selectClass}
          value={user.favouriteDriverId ?? ''}
          onChange={(e) => update.mutate({ favouriteDriverId: e.target.value || null })}
          disabled={!drivers.data}
        >
          <option value="">None</option>
          {drivers.data?.data.map((d) => (
            <option key={d.driverId} value={d.driverId}>
              {d.givenName} {d.familyName}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        Favourite team
        <select
          className={selectClass}
          value={user.favouriteTeamId ?? ''}
          onChange={(e) => update.mutate({ favouriteTeamId: e.target.value || null })}
          disabled={!teams.data}
        >
          <option value="">None</option>
          {teams.data?.data.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {update.isPending ? 'Saving…' : update.isError ? <span className="text-red-400">{update.error.message}</span> : update.isSuccess ? 'Saved.' : ''}
      </p>

      <div className="border-t border-zinc-800 pt-6">
        <button
          type="button"
          className="rounded border border-red-800 px-3 py-2 text-sm text-red-400 hover:bg-red-950"
          onClick={() => {
            if (confirm('Delete your account? This cannot be undone.')) remove.mutate();
          }}
        >
          Delete my account
        </button>
      </div>
    </section>
  );
}
