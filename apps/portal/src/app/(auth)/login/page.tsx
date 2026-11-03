'use client';
import { useState, useEffect, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import api, { setAuthToken } from '@/lib/api';
import { AuthShell, AuthTitle, AuthError, AuthSwitch, CodeBoxes, Divider, authButton, authInput } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';

const ROLE_HOME: Record<string, string> = {
  STUDENT:          '/student/dashboard',
  TEACHER:          '/teacher/dashboard',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
  ORG_ADMIN:        '/school/dashboard',
};

function LoginPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextRaw      = searchParams.get('next');
  const nextUrl      = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;
  const [email,     setEmail]     = useState(searchParams.get('email') ?? '');
  const [password,  setPassword]  = useState('');
  // School admins and anyone without a password sign in with an emailed code (?with=code opens it directly)
  const [mode,      setMode]      = useState<'password' | 'code'>(searchParams.get('with') === 'code' ? 'code' : 'password');
  const [codeSent,  setCodeSent]  = useState(false);
  const [code,      setCode]      = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [google,    setGoogle]    = useState(false);
  // Slow down guessing: after 5 failures, wait 30s, then 60s, 120s… up to 15 minutes
  const [, setFailCount]          = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft,  setLockLeft]  = useState(0);
  const [resendIn,  setResendIn]  = useState(0);

  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) { setLockUntil(0); setLockLeft(0); clearInterval(t); } else setLockLeft(left);
    }, 500);
    return () => clearInterval(t);
  }, [lockUntil]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function signedIn(token: string) {
    await setAuthToken(token, true);
    setFailCount(0); setLockUntil(0);
    const { role } = jwtDecode<{ role: string }>(token);
    router.push(nextUrl && role === 'STUDENT' ? nextUrl : ROLE_HOME[role] ?? '/student/dashboard');
  }

  function failed(err: any) {
    const msg: string = err?.response?.data?.message ?? '';
    if (err?.response?.status === 403 && msg.toLowerCase().includes('under review')) { router.push('/apply/pending'); return; }
    setFailCount(prev => {
      const n = prev + 1;
      if (n >= 5) {
        const wait = Math.min(30 * 2 ** (n - 5), 900);
        setLockUntil(Date.now() + wait * 1000); setLockLeft(wait);
        setError(`Too many tries. Wait ${wait} seconds, then try again.`);
      } else setError(msg || (mode === 'code' ? 'That code isn’t right.' : 'That email and password don’t match.'));
      return n;
    });
  }

  async function sendCode() {
    setError(''); setLoading(true);
    try { await api.post('/auth/login/code', { email: email.trim() }); setCodeSent(true); setCode(''); setResendIn(60); }
    catch (err: any) { setError(err?.response?.data?.message ?? 'Couldn’t send a code. Try again.'); }
    finally { setLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lockUntil > Date.now()) return;
    if (mode === 'code' && !codeSent) { await sendCode(); return; }
    setError(''); setLoading(true);
    try {
      const { data } = mode === 'code'
        ? await api.post('/auth/login/code/verify', { email: email.trim(), code })
        : await api.post('/auth/login', { email: email.trim(), password });
      await signedIn(data.accessToken);
    } catch (err) { failed(err); }
    finally { setLoading(false); }
  }

  async function withGoogle(credential: string) {
    setError(''); setLoading(true);
    try { const { data } = await api.post('/auth/google', { credential }); await signedIn(data.accessToken); }
    catch (err) { failed(err); }
    finally { setLoading(false); }
  }

  const locked = lockUntil > Date.now();
  const registerHref = `/register${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`;
  const codeStep = mode === 'code' && codeSent;
  const toMode = (m: 'password' | 'code') => { setMode(m); setCodeSent(false); setCode(''); setError(''); };

  return (
    <AuthShell hero={mode === 'code'
      ? { lines: ['No password?', 'No problem.'], sub: 'We’ll email you a six-digit code. It works for ten minutes.', cards: [{ icon: '✉', title: 'CareerPath Africa', body: 'Your sign-in code is in your inbox.' }, { icon: 'Y', title: 'You', body: 'In. Straight back to my mock exam.', pill: '10 min' }] }
      : { lines: ['Pick up', 'where you left off.'], sub: 'Your courses, your tests and your progress, right where you left them.', cards: [{ icon: 'Q', title: 'Question 12', body: 'Solve 2x + 3 = 11  →  x = 4  ✓' }, { icon: 'Y', title: 'You', body: 'Practice done: 9 of 10 right.', pill: 'Near ready' }] }}>
      <AuthTitle>{codeStep ? 'Check your email.' : 'Welcome back.'}</AuthTitle>

      {!codeStep && (
        <>
          <GoogleButton onCredential={withGoogle} onReady={setGoogle} />
          {google && <Divider>or, with your email</Divider>}
        </>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {!codeStep && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy">Email address</span>
            <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={authInput} />
          </label>
        )}
        {mode === 'password' && (
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between text-sm font-semibold text-navy">Password<Link href="/forgot-password" className="text-[13px] text-[#3F6FE8]">Forgot it?</Link></span>
            <span className="relative">
              <input type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={`${authInput} pr-16`} />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-navy">{showPw ? 'Hide' : 'Show'}</button>
            </span>
          </label>
        )}
        {codeStep && (
          <>
            <CodeBoxes value={code} onChange={setCode} />
            <p className="text-[13px] text-muted">Sent to {email}. {resendIn > 0 ? `Send a new one in ${resendIn}s.` : <button type="button" onClick={sendCode} className="font-bold text-[#3F6FE8]">Send a new one</button>}</p>
          </>
        )}
        <AuthError error={error} />
        <button type="submit" disabled={loading || locked || (codeStep && code.length < 6)} className={authButton}>
          {locked ? `Wait ${lockLeft}s` : loading ? 'One moment…' : mode === 'code' ? (codeSent ? 'Sign in' : 'Email me a code') : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-[12.5px] text-muted">
        {mode === 'password'
          ? <>No password? <button type="button" onClick={() => toMode('code')} className="font-semibold text-[#3F6FE8]">Email me a code instead</button></>
          : codeStep
            ? <>Can’t find it? Look in spam or promotions. Wrong email? <button type="button" onClick={() => toMode('code')} className="font-semibold text-[#3F6FE8]">Change it</button></>
            : 'School admins and students without a password sign in this way.'}
      </p>
      {mode === 'code'
        ? <><span className="my-1.5 h-px bg-line" /><p className="text-center text-sm text-ink2">Have a password? <button type="button" onClick={() => toMode('password')} className="font-bold text-[#3F6FE8]">Sign in with it</button></p></>
        : <AuthSwitch text="New here?" href={registerHref} link="Create a free account" />}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginPageInner /></Suspense>;
}
