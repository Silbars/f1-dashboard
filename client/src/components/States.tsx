import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ApiResult } from '../lib/api';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
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
      <button type="button" onClick={onRetry} className="rounded bg-red-600 px-3 py-1 text-sm font-medium hover:bg-red-500">
        Try again
      </button>
    </div>
  );
}

export function Loading() {
  return (
    <p role="status" className="animate-pulse text-zinc-400">
      Loading…
    </p>
  );
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
