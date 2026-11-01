'use client';
import { useState, useEffect, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion';
import api, { setAuthToken } from '@/lib/api';
import { notify } from '@/lib/notify';
import { spring, stagger, staggerItem, scaleFade } from '@/lib/motion';
import { Button } from '@/components/ui/Button';

const ROLE_HOME: Record<string, string> = {
  STUDENT:          '/student/dashboard',
  TEACHER:          '/teacher/dashboard',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
  ORG_ADMIN:        '/school/dashboard',
};

const TESTIMONIALS = [
  { quote: 'CareerPath Africa helped me land my first tech role in 5 months. The live classes and mentorship are world-class.', name: 'Amara Diallo', title: 'Software Engineer · Dakar', initials: 'AD', color: '#5889FA' },
  { quote: 'I went from zero to certified data analyst. The structured curriculum and African context made it click for me.', name: 'Chisom Eze', title: 'Data Analyst · Lagos', initials: 'CE', color: '#405FAD' },
];

function LoginPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextUrl      = searchParams.get('next');
  const [email,       setEmail]       = useState(searchParams.get('email') ?? '');
  const [password,    setPassword]    = useState('');
  // School admins and other accounts without a password sign in with an emailed code
  const [mode,        setMode]        = useState<'password' | 'code'>(searchParams.get('with') === 'code' ? 'code' : 'password');
  const [codeSent,    setCodeSent]    = useState(false);
  const [code,        setCode]        = useState('');
  const [rememberMe,  setRememberMe]  = useState(true);
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [shake,       setShake]       = useState(false);
  const [tIdx,        setTIdx]        = useState(0);
  // Rate limiting: track failed attempts
  const [failCount,   setFailCount]   = useState(0);
  const [lockUntil,   setLockUntil]   = useState(0);

  // Cycle testimonials
  useEffect(() => {
    const t = setInterval(() => setTIdx(i => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Live lockout countdown
  const isLocked = lockUntil > Date.now();
  const [lockSecsLeft, setLockSecsLeft] = useState(0);
  useEffect(() => {
    if (!isLocked) return;
    const t = setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) { setLockUntil(0); setLockSecsLeft(0); clearInterval(t); }
      else setLockSecsLeft(left);
    }, 500);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockUntil]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockUntil > Date.now()) return; // enforce lockout
    setError('');
    setLoading(true);
    if (mode === 'code' && !codeSent) {
      try { await api.post('/auth/login/code', { email }); setCodeSent(true); }
      catch (err: any) { setError(err.response?.data?.message ?? 'Could not send a code'); }
      finally { setLoading(false); }
      return;
    }
    try {
      const { data } = mode === 'code'
        ? await api.post('/auth/login/code/verify', { email, code })
        : await api.post('/auth/login', { email, password });
      await setAuthToken(data.accessToken, rememberMe);
      setFailCount(0);
      setLockUntil(0);
      const decoded = jwtDecode<{ role: string }>(data.accessToken);
      const destination = (nextUrl && decoded.role === 'STUDENT')
        ? nextUrl : (ROLE_HOME[decoded.role] ?? '/student/dashboard');
      router.push(destination);
    } catch (err: any) {
      const msg: string = err.response?.data?.message ?? '';
      if (err.response?.status === 403 && msg.toLowerCase().includes('under review')) {
        router.push('/apply/pending'); return;
      }
      // Rate limiting: lock after 5 failed attempts
      setFailCount(prev => {
        const next = prev + 1;
        if (next >= 5) {
          const lockDuration = Math.min(30 * Math.pow(2, next - 5), 900); // 30s → 60s → 120s … max 15min
          setLockUntil(Date.now() + lockDuration * 1000);
          setLockSecsLeft(lockDuration);
          setError(`Too many failed attempts. Try again in ${lockDuration} seconds.`);
        } else {
          setError(msg || 'Invalid email or password');
        }
        return next;
      });
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally { setLoading(false); }
  }

  const testimonial = TESTIMONIALS[tIdx];

  return (
    <div className="flex min-h-screen overflow-hidden">

      {/* ═══════════════ LEFT PANEL ═══════════════ */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #020a1f 0%, #061a4d 40%, #0a2570 100%)' }}>

        {/* Drifting gradient blobs */}
        <div className="pointer-events-none absolute top-[10%] right-[5%] h-[420px] w-[420px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: 'radial-gradient(circle, #5889FA, transparent 65%)', animation: 'blob-drift-1 20s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute bottom-[5%] left-[0%] h-[380px] w-[380px] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: 'radial-gradient(circle, #405FAD, transparent 65%)', animation: 'blob-drift-2 25s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute top-[40%] left-[30%] h-[300px] w-[300px] rounded-full opacity-[0.08] blur-3xl"
          style={{ background: 'radial-gradient(circle, #3730a3, transparent 65%)', animation: 'blob-drift-3 30s ease-in-out infinite' }} />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 xl:p-16">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-azure shadow-lg shadow-azure/40">
              <span className="text-base font-black text-white tracking-tight">C</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              CareerPath<span className="text-azure">Africa</span>
            </span>
          </motion.div>

          {/* Hero — dominant headline, nothing else competing */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.15 }}
            className="space-y-6"
          >
            <h1 className="text-7xl font-black text-white leading-[1.05] tracking-tight">
              Learn without<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #5889FA 0%, #93ADFC 50%, #c4d5ff 100%)' }}>
                limits.
              </span>
            </h1>
            <p className="text-lg text-white/40 leading-relaxed max-w-md">
              Africa's fastest-growing professional learning platform — courses, live classes, and mentorship built for your career.
            </p>
          </motion.div>

          {/* Testimonial — minimal, no card, no stars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...spring.fade, delay: 0.5 }}
            className="space-y-6"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={tIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={spring.smooth}
              >
                <p className="text-[15px] text-white/55 leading-relaxed italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-0.5 w-6 rounded-full bg-azure/40" />
                  <p className="text-sm text-white/70">
                    <span className="font-semibold text-white/85">{testimonial.name}</span>
                    <span className="text-white/35 mx-1.5">·</span>
                    <span>{testimonial.title}</span>
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="flex items-center gap-1.5">
              {TESTIMONIALS.map((_, i) => (
                <motion.button
                  key={i}
                  onClick={() => setTIdx(i)}
                  animate={{ width: i === tIdx ? 24 : 6, background: i === tIdx ? '#5889FA' : 'rgba(255,255,255,0.15)' }}
                  transition={spring.snappy}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>

            {/* Trusted by — subtle social proof */}
            <div className="flex items-center gap-4 pt-2 border-t border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-widest text-white/20 font-semibold">Trusted by</span>
              {['Safaricom', 'MTN', 'Andela', 'Flutterwave'].map(name => (
                <span key={name} className="text-xs font-bold text-white/20 tracking-wide">{name}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════ RIGHT PANEL ═══════════════ */}
      <div className="flex flex-1 flex-col bg-[#0a2570] lg:bg-white lg:rounded-l-[2.5rem] lg:shadow-[-20px_0_50px_rgba(3,14,48,0.3)]">

        {/* Mobile branded header */}
        <div className="lg:hidden" style={{ background: 'linear-gradient(145deg, #020a1f 0%, #061a4d 40%, #0a2570 100%)' }}>
          <div className="px-6 pt-8 pb-14">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                  <span className="text-[10px] font-black text-white">C</span>
                </div>
                <span className="text-sm font-bold text-white">CareerPath<span className="text-azure">Africa</span></span>
              </div>
              <Link href="/register" className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition">
                Sign up
              </Link>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-1">Welcome back</p>
            <h2 className="text-xl font-black text-white tracking-tight">Sign in to your account.</h2>
            <p className="text-xs text-white/40 mt-1.5 max-w-[280px] leading-relaxed">Africa&apos;s fastest-growing professional learning platform.</p>
          </div>
        </div>

        {/* Form area — sheet on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.smooth, delay: 0.15 }}
          className="-mt-6 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgba(3,14,48,0.12)] lg:mt-0 lg:rounded-none lg:shadow-none flex flex-1 items-center justify-center px-6 pt-2 pb-10 lg:py-10 overflow-y-auto"
        >
          <div className="w-full max-w-[420px]">
            <div className="flex justify-center pt-1 pb-4 lg:hidden"><div className="w-10 h-1 rounded-full bg-navy/10" /></div>

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.smooth, delay: 0.2 }}
              className="mb-8"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-2">Welcome back</p>
              <h2 className="text-3xl font-black text-navy tracking-tight mb-2">Sign in</h2>
              <p className="text-sm text-royal/50">
                New here?{' '}
                <Link href="/register" className="font-semibold text-azure hover:text-royal transition">
                  Create a free account
                </Link>
              </p>
            </motion.div>

            {/* Error banner — spring entrance */}
            <AnimatePresence mode="wait">
              {error && (() => {
                const isPending  = error.toLowerCase().includes('under review') || error.toLowerCase().includes('still under');
                const isRejected = error.toLowerCase().includes('not approved');
                return (
                  <motion.div
                    key={error}
                    variants={scaleFade}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="mb-5"
                  >
                    {isPending ? (
                      <div className="rounded-2xl border border-azure/20 bg-azure/5 px-4 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                          <p className="text-xs font-bold text-navy uppercase tracking-wider">Application under review</p>
                        </div>
                        <p className="text-sm text-royal/70 leading-relaxed">{error}</p>
                        <a href="/apply/success" className="mt-2 inline-block text-xs font-semibold text-azure hover:underline">View application status →</a>
                      </div>
                    ) : isRejected ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <p className="text-xs font-bold text-red-700 mb-1">Application not approved</p>
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    ) : (
                      <motion.div
                        animate={shake ? { x: [-6, 6, -4, 4, -2, 2, 0] } : {}}
                        transition={{ duration: 0.5 }}
                        className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3"
                      >
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 mt-0.5">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Google SSO — coming soon, visually disabled */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.smooth, delay: 0.25 }}
              className="mb-5 relative"
              title="Google sign-in is coming soon"
            >
              <div className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-cloud bg-cloud/40 py-3.5 text-sm font-semibold text-royal/40 cursor-not-allowed select-none">
                <svg className="h-5 w-5 flex-shrink-0 opacity-40" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
                <span className="ml-auto rounded-md bg-cloud border border-cloud px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-royal/50">Soon</span>
              </div>
            </motion.div>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...spring.fade, delay: 0.3 }}
              className="relative mb-5"
            >
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-cloud" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-royal/40 font-medium">or sign in with email</span>
              </div>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {/* Email */}
              <motion.div variants={staggerItem} className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy/70">Email address</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="w-full rounded-2xl border-2 border-cloud bg-white py-3.5 pl-11 pr-4 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10" />
                </div>
              </motion.div>

              {mode === 'code' && codeSent && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-navy/70">Code from your email</label>
                  <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="6 digits" value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required
                    className="w-full rounded-2xl border-2 border-cloud bg-white px-4 py-3.5 text-center text-lg font-semibold tracking-[0.4em] text-navy outline-none transition-all focus:border-azure focus:ring-4 focus:ring-azure/10" />
                  <p className="text-[11px] text-royal/50">Sent to {email}. It works for 10 minutes. <button type="button" onClick={() => { setCodeSent(false); setCode(''); }} className="font-semibold text-azure">Send another</button></p>
                </div>
              )}

              {/* Password */}
              {mode === 'password' && <motion.div variants={staggerItem} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-navy/70">Password</label>
                  <Link href="/forgot-password" className="text-xs font-semibold text-azure hover:text-royal transition">
                    Forgot password?
                  </Link>
                </div>
                <div className="group relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8}
                    className="w-full rounded-2xl border-2 border-cloud bg-white py-3.5 pl-11 pr-12 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10" />
                  <motion.button type="button" onClick={() => setShowPw(v => !v)}
                    whileTap={{ scale: 0.85, transition: spring.snappy }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-royal/40 hover:text-azure transition-colors">
                    {showPw
                      ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </motion.button>
                </div>
                {password.length > 0 && password.length < 8 && (
                  <p className="text-[10px] text-royal/40 mt-1">Password must be at least 8 characters</p>
                )}
              </motion.div>}

              {/* Remember me */}
              <motion.label variants={staggerItem} className="flex items-center gap-2.5 cursor-pointer select-none group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  <div className="h-4 w-4 rounded border-2 border-cloud bg-white transition-all peer-checked:border-azure peer-checked:bg-azure group-hover:border-azure/60" />
                  <svg className="absolute inset-0 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs text-royal/60">Remember me for 7 days</span>
              </motion.label>

              {/* CTA */}
              <motion.div variants={staggerItem}>
                {isLocked ? (
                  <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-cloud py-4 text-sm font-semibold text-royal/60 cursor-not-allowed">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Account locked — try again in {lockSecsLeft}s
                  </div>
                ) : (
                  <Button
                    type="submit"
                    disabled={loading}
                    loading={loading}
                    fullWidth
                    size="lg"
                    className="mt-2 rounded-2xl py-4 text-sm"
                    style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' } as React.CSSProperties}
                  >
                    {!loading && (mode === 'code' ? (codeSent ? 'Sign in' : 'Email me a code') : 'Sign in to your account')}
                    {!loading && (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    )}
                  </Button>
                )}
              </motion.div>
            </motion.form>

            <p className="mt-4 text-center text-xs text-royal/60">
              {mode === 'password'
                ? <>School admin, or no password? <button type="button" onClick={() => { setMode('code'); setError(''); }} className="font-semibold text-azure hover:text-royal">Sign in with an email code</button></>
                : <>Have a password? <button type="button" onClick={() => { setMode('password'); setCodeSent(false); setError(''); }} className="font-semibold text-azure hover:text-royal">Sign in with your password</button></>}
            </p>

            {/* Footer */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...spring.fade, delay: 0.5 }}
              className="mt-8 text-center text-xs text-royal/40 leading-relaxed"
            >
              By signing in you agree to our{' '}
              <a href="#" className="underline hover:text-royal transition">Terms</a>
              {' '}and{' '}
              <a href="#" className="underline hover:text-royal transition">Privacy Policy</a>.
            </motion.p>
          </div>
        </motion.div>

        {/* Desktop trust bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring.fade, delay: 0.6 }}
          className="hidden lg:flex items-center justify-center gap-8 px-8 py-5 border-t border-cloud"
        >
          {[
            { text: 'SSL Secured',   icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
            { text: '50+ Countries', icon: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
            { text: '4.9 / 5 Rating', icon: <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg> },
          ].map(item => (
            <div key={item.text} className="flex items-center gap-1.5 text-xs text-royal/40 font-medium">
              {item.icon}<span>{item.text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginPageInner /></Suspense>;
}
