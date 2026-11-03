'use client';
import { useState } from 'react';
import api from '@/lib/api';
import { AuthShell, AuthTitle, AuthError, AuthSwitch, authButton, authInput } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setLoading(true);
    // Always looks the same, so nobody can use this page to find out who has an account
    try { await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() }); } catch { /* same message either way */ }
    finally { setLoading(false); if (sent) setResent(true); setSent(true); }
  }

  return (
    <AuthShell back={{ href: '/login', label: 'Back to sign in' }} hero={{ lines: ['It happens', 'to the best of us.'], white: 3, sub: 'Tell us your email and we’ll send a link to set a new password.', cards: [{ icon: '✉', title: 'CareerPath Africa', body: 'Here’s your link to set a new password.' }, { icon: 'Y', title: 'You', body: 'Sorted. Back to revision.', pill: '30 min link' }] }}>
      {sent ? (
        <>
          <AuthTitle>Check your email.</AuthTitle>
          <p className="text-[15px] leading-relaxed text-ink2">If <strong className="text-navy">{email}</strong> has an account, a link to set a new password is on its way. It works for 30 minutes.</p>
          <p className="text-[13px] text-muted">Nothing after a few minutes? Look in spam or promotions, or <button type="button" onClick={() => send()} disabled={loading} className="font-semibold text-[#3F6FE8]">{resent ? 'sent again' : 'send it again'}</button>.</p>
          <AuthSwitch text="Remembered it?" href="/login" link="Back to sign in" />
        </>
      ) : (
        <>
          <AuthTitle>Forgot your password?</AuthTitle>
          <form onSubmit={send} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy">Email address</span>
              <input type="email" required autoFocus autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={authInput} />
            </label>
            <AuthError error={error} />
            <button type="submit" disabled={loading} className={authButton}>{loading ? 'Sending…' : 'Send me a link'}</button>
          </form>
          <p className="text-center text-[12.5px] text-muted">The link works for 30 minutes. No password at all? <a href="/login?with=code" className="font-semibold text-[#3F6FE8]">Sign in with an email code</a></p>
          <AuthSwitch text="Remembered it?" href="/login" link="Back to sign in" />
        </>
      )}
    </AuthShell>
  );
}
