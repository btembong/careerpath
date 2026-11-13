'use client';
import { useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { AuthShell, AuthTitle, AuthError, AuthSwitch, authButton, authInput } from '@/components/auth/AuthShell';

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  // Our own emails carry ?token=…; links WordPress sent before the switch carry ?login=…&key=…
  const token = searchParams.get('token') ?? '';
  const login = searchParams.get('login') ?? '';
  const key = searchParams.get('key') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const hasParams = !!(token || (login && key));

  const [expired, setExpired] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    setError(''); setLoading(true);
    try { await api.post('/auth/reset-password', token ? { token, newPassword: password } : { login, key, newPassword: password }); setDone(true); }
    catch (err: any) {
      const m: string = err?.response?.data?.message ?? 'That didn’t work. The link may have run out; ask for a new one.';
      setError(m); setExpired(/expired|already used/i.test(m));
    }
    finally { setLoading(false); }
  }

  return (
    <AuthShell back={{ href: '/login', label: 'Back to sign in' }} hero={{ lines: ['A fresh start', 'in one step.'], sub: 'Choose a new password. Use at least 8 characters; a short sentence is easy to remember and hard to guess.', cards: [{ icon: 'lock', title: 'New password', body: 'Saved. Your courses and progress are just as you left them.', pill: 'Done' }] }}>
      {done ? (
        <>
          <AuthTitle>All set.</AuthTitle>
          <p className="text-[15px] text-ink2">Your new password is saved. Sign in with it now.</p>
          <Link href="/login" className={authButton}>Sign in</Link>
        </>
      ) : !hasParams ? (
        <>
          <AuthTitle>This link doesn’t work.</AuthTitle>
          <p className="text-[15px] text-ink2">It may be incomplete or out of date. Ask for a new one; it works for an hour.</p>
          <Link href="/forgot-password" className={authButton}>Send me a new link</Link>
          <AuthSwitch text="Remembered it?" href="/login" link="Back to sign in" />
        </>
      ) : (
        <>
          <AuthTitle>Choose a new password.</AuthTitle>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="flex justify-between text-sm font-semibold text-navy">New password<button type="button" onClick={() => setShow(s => !s)} className="text-[13px] text-[#3F6FE8]">{show ? 'Hide' : 'Show'}</button></span>
              <input type={show ? 'text' : 'password'} required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={authInput} />
              <span className="text-xs text-muted">{password && password.length < 8 ? `${8 - password.length} more characters` : 'At least 8 characters'}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy">Type it again</span>
              <input type={show ? 'text' : 'password'} required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={authInput} />
              {confirm && <span className={`text-xs ${confirm === password ? 'font-semibold text-[#2F57C9]' : 'text-muted'}`}>{confirm === password ? '✓ They match' : 'Doesn’t match yet'}</span>}
            </label>
            <AuthError error={error} />
            {expired && <Link href="/forgot-password" className="text-center text-sm font-semibold text-[#3F6FE8] hover:underline">Send me a new link</Link>}
            <button type="submit" disabled={loading || password.length < 8 || password !== confirm} className={authButton}>{loading ? 'Saving…' : 'Save my new password'}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordInner /></Suspense>;
}
