import { useIsFetching, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useMe } from '../lib/useMe';
import { Loading } from './States';

const NAV = [
  ['/', 'Home'],
  ['/schedule', 'Schedule'],
  ['/standings/drivers', 'Drivers’ standings'],
  ['/standings/constructors', 'Constructors’ standings'],
  ['/drivers', 'Drivers'],
  ['/teams', 'Teams'],
] as const;

/** Render's free tier sleeps; the first request can take about a minute. */
function WakingBanner() {
  const fetching = useIsFetching() > 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!fetching) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [fetching]);
  if (!slow) return null;
  return (
    <p role="status" className="bg-zinc-800 px-4 py-2 text-center text-sm">
      Waking up the server… this can take up to a minute on the first visit.
    </p>
  );
}

export function AccountMenu() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: async () => {
      qc.setQueryData(['me'], null);
      await qc.invalidateQueries({ queryKey: ['/home'] });
      navigate('/');
    },
  });
  if (me.isPending) return null;
  if (!me.data)
    return (
      <Link to="/login" className="rounded bg-red-600 px-3 py-1 text-sm font-medium hover:bg-red-500">
        Log in
      </Link>
    );
  return (
    <span className="flex items-center gap-3 text-sm">
      <Link to="/profile" className="hover:underline">
        {me.data.displayName}
      </Link>
      <button type="button" className="text-zinc-400 hover:text-white disabled:opacity-50" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </button>
      {logout.isError && (
        <span role="alert" className="text-xs text-red-400">
          {logout.error.message}
        </span>
      )}
    </span>
  );
}

export function Layout({ account }: { account?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <span className="mr-4 font-black tracking-tight text-red-500">F1 DASHBOARD</span>
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `text-sm ${isActive ? 'text-white underline decoration-red-600 underline-offset-8' : 'text-zinc-400 hover:text-white'}`}
            >
              {label}
            </NavLink>
          ))}
          <div className="ml-auto">{account}</div>
        </nav>
      </header>
      <WakingBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-400">
        Unofficial fan project. Not associated with Formula 1, the FIA or Formula One Management.
      </footer>
    </div>
  );
}
