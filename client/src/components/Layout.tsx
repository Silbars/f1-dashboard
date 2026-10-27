import { useIsFetching, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clapperboard,
  Factory,
  House,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Swords,
  Trophy,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { applyLivery, LIVERIES, liveryById, readStoredLivery, writeStoredLivery } from '../lib/livery';
import { useMe } from '../lib/useMe';
import { Loading, PageErrorBoundary } from './States';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const GROUPS: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Home', icon: House, end: true },
      { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    ],
  },
  {
    heading: 'Championship',
    items: [
      { to: '/standings/drivers', label: 'Drivers’ standings', icon: Trophy },
      { to: '/standings/constructors', label: 'Constructors’ standings', icon: Factory },
    ],
  },
  {
    heading: 'Paddock',
    items: [
      { to: '/drivers', label: 'Drivers', icon: UserRound },
      { to: '/teams', label: 'Teams', icon: Users },
      { to: '/head-to-head', label: 'Head-to-Head', icon: Swords },
    ],
  },
  {
    heading: 'Replays',
    items: [{ to: '/replay', label: 'Race replays', icon: Clapperboard }],
  },
];

const SIDEBAR_KEY = 'f1.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // Private mode: the sidebar state lasts for this visit only.
  }
}

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
      // Leave protected pages before clearing the session, or RequireAuth bounces through /login.
      navigate('/');
      qc.setQueryData(['me'], null);
      await qc.invalidateQueries({ queryKey: ['/home'] });
    },
  });
  if (me.isPending) return null;
  if (!me.data)
    return (
      <Link to="/login" className="block rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-accent-ink hover:bg-accent-hi">
        Log in
      </Link>
    );
  return (
    <div className="grid gap-2 text-sm">
      <Link to="/profile" className="truncate font-medium hover:underline">
        {me.data.displayName}
      </Link>
      <button type="button" className="justify-self-start text-zinc-400 hover:text-white disabled:opacity-50" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </button>
      {logout.isError && (
        <span role="alert" className="text-xs text-red-400">
          {logout.error.message}
        </span>
      )}
    </div>
  );
}

export function Layout({ account }: { account?: ReactNode }) {
  const { pathname } = useLocation();
  const me = useMe();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  // A livery the viewer picked wins; otherwise their favourite team's; otherwise F1 red.
  const [picked, setPicked] = useState<string | null>(readStoredLivery);
  const livery = liveryById(picked ?? me.data?.favouriteTeamId);

  useLayoutEffect(() => applyLivery(livery), [livery]);

  const choose = (id: string) => {
    setPicked(id);
    writeStoredLivery(id);
  };
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  };
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-dvh md:flex">
      <aside
        className={`flex flex-col border-b border-zinc-800 bg-zinc-950 md:sticky md:top-0 md:h-dvh md:shrink-0 md:border-r md:border-b-0 md:transition-[width] ${collapsed ? 'md:w-18' : 'md:w-64'}`}
      >
        <div className="livery-stripe h-1.5 shrink-0" />

        <div className={`flex items-center justify-between gap-2 px-4 py-4 ${collapsed ? 'md:flex-col md:justify-center md:gap-3 md:px-0' : ''}`}>
          <Link to="/" onClick={closeMenu} className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-sm font-black text-accent-ink">F1</span>
            <span className={`truncate text-lg font-black tracking-tight ${collapsed ? 'md:hidden' : ''}`}>Dashboard</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden size-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-white md:grid"
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="sidebar-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="grid size-9 place-items-center rounded-md text-zinc-300 hover:bg-zinc-900 md:hidden"
          >
            {menuOpen ? <X size={20} strokeWidth={1.75} aria-hidden /> : <Menu size={20} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>

        <nav id="sidebar-nav" aria-label="Main" className={`${menuOpen ? '' : 'hidden'} flex-1 overflow-y-auto px-3 pb-4 md:block`}>
          {GROUPS.map((group, gi) => (
            <div key={gi} className="mt-4 first:mt-0">
              {group.heading && <p className={`mb-1 px-3 text-xs text-zinc-500 ${collapsed ? 'md:hidden' : ''}`}>{group.heading}</p>}
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={closeMenu}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${collapsed ? 'md:justify-center' : ''} ${
                          isActive ? 'bg-zinc-800/80 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
                          <Icon aria-hidden size={18} strokeWidth={1.75} className={`shrink-0 ${isActive ? 'text-accent-text' : ''}`} />
                          <span className={collapsed ? 'md:sr-only' : ''}>{label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`space-y-4 border-t border-zinc-800 p-4 ${menuOpen ? '' : 'hidden'} md:block`}>
          <label className={`grid gap-1 text-xs text-zinc-400 ${collapsed ? 'md:hidden' : ''}`}>
            Team livery
            <select
              value={livery.id}
              onChange={(e) => choose(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            >
              {LIVERIES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className={collapsed ? 'md:hidden' : ''}>{account}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <WakingBanner />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-10 md:py-10">
          <PageErrorBoundary key={pathname}>
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </main>
        <footer className="px-4 pb-8 text-center text-xs text-zinc-500">Unofficial fan project. Not associated with Formula 1, the FIA or Formula One Management.</footer>
      </div>
    </div>
  );
}
