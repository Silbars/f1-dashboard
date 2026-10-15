import type { PublicUser } from '@f1/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { inputClass } from './LoginPage';

export default function RegisterPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const register = useMutation({
    mutationFn: () => api.post<{ user: PublicUser }>('/auth/register', form),
    onSuccess: async ({ data }) => {
      qc.setQueryData(['me'], data.user);
      await qc.invalidateQueries({ queryKey: ['/home'] });
      navigate('/profile');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate();
  };
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Create an account</h1>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Display name
          <input className={inputClass} required maxLength={40} autoComplete="nickname" value={form.displayName} onChange={set('displayName')} />
        </label>
        <label className="grid gap-1 text-sm">
          Email
          <input className={inputClass} type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="grid gap-1 text-sm">
          Password (at least 8 characters)
          <input className={inputClass} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </label>
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-400">
          {register.error?.message}
        </p>
        <button type="submit" disabled={register.isPending} className="rounded bg-red-600 py-2 font-medium hover:bg-red-500 disabled:opacity-50">
          {register.isPending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        Already have one?{' '}
        <Link to="/login" className="text-red-400 hover:underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
