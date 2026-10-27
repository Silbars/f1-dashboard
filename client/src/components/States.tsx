import type { UseQueryResult } from '@tanstack/react-query';
import { Component, type ReactNode } from 'react';
import type { ApiResult } from '../lib/api';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function StaleBadge() {
  return (
    <p role="status" className="mb-4 inline-block rounded bg-amber-900/60 px-2 py-1 text-xs text-amber-200">
      Showing saved data — the live source is unavailable, so this may be out of date.
    </p>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-4">
      <p className="mb-3">{error.message}</p>
      <button type="button" onClick={onRetry} className="rounded bg-accent text-accent-ink px-3 py-1 text-sm font-medium hover:bg-accent-hi">
        Try again
      </button>
    </div>
  );
}

export function Loading() {
  return (
    <div role="status" className="grid gap-3">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-900" />
      ))}
    </div>
  );
}

/** Catches render and lazy-chunk errors so the nav and footer survive (e.g. a stale tab after a redeploy). */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (this.state.error) return <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />;
    return this.props.children;
  }
}

export function QueryState<T>({ q, children }: { q: UseQueryResult<ApiResult<T>, Error>; children: (data: T, stale: boolean) => ReactNode }) {
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      {q.data.stale && <StaleBadge />}
      {children(q.data.data, q.data.stale)}
    </>
  );
}
