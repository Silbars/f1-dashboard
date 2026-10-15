import type { PublicUser } from '@f1/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';

export const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2';

export default function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.post<{ user: PublicUser }>('/auth/login', { email, password }),
    onSuccess: async ({ data }) => {
      qc.setQueryData(['me'], data.user);
      await qc.invalidateQueries({ queryKey: ['/home'] });
      navigate('/');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Email
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-400">
          {login.error?.message}
        </p>
        <button type="submit" disabled={login.isPending} className="rounded bg-red-600 py-2 font-medium hover:bg-red-500 disabled:opacity-50">
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        New here?{' '}
        <Link to="/register" className="text-red-400 hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
