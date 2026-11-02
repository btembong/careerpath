'use client';
import { useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { spring, stagger, staggerItem, scaleFade } from '@/lib/motion';
import api from '@/lib/api';

function pwStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8)       s++;
  if (pw.length >= 12)      s++;
  if (/[A-Z]/.test(pw))     s++;
  if (/[0-9]/.test(pw))     s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors  = ['', '#ef4444', '#f59e0b', '#5889FA', '#405FAD', '#072061'];
  return { score: s, label: labels[s] ?? '', color: colors[s] ?? '#E6ECFD' };
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const login = searchParams.get('login') ?? '';
  const key   = searchParams.get('key') ?? searchParams.get('token') ?? '';

  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState('');

  const strength    = pwStrength(password);
  const pwMatch     = confirm.length > 0 && password === confirm;
  const pwMismatch  = confirm.length > 0 && password !== confirm;
  const hasParams   = !!(login && key);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!hasParams) { setError('Reset link is missing or invalid.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { login, key, newPassword: password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  // Determine which right-panel content to show
  const view = done ? 'done' : hasParams ? 'form' : 'invalid';

  return (
    <div className="flex min-h-screen overflow-hidden">

      {/* ═══════════ LEFT PANEL ═══════════ */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col overflow-hidden"
        style={{ background: '#3F6FE8' }}>

        {/* Drifting gradient blobs */}

        <div className="relative z-10 flex flex-col justify-between h-full p-12 xl:p-16">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white">
              <span className="text-base font-black text-[#3F6FE8] tracking-tight">C</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              CareerPath<span className="text-white/85">Africa</span>
            </span>
          </motion.div>

          {/* Hero — dominant headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.15 }}
            className="space-y-6"
          >
            <h1 className="text-7xl font-black text-white leading-[1.05] tracking-tight">
              Choose a<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #FFFFFF 0%, #FFFFFF 100%)' }}>
                strong password.
              </span>
            </h1>
            <p className="text-lg text-white/90 leading-relaxed max-w-md">
              A strong password keeps your account, courses, and certificates safe.
            </p>
          </motion.div>

          {/* Password tips — minimal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.4 }}
            className="space-y-3"
          >
            {[
              'Use 12+ characters for best security',
              'Mix uppercase, lowercase, numbers & symbols',
              'Don\'t reuse passwords from other sites',
            ].map((tip, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/25">
                  <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-white/90">{tip}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <div className="flex flex-1 flex-col bg-[#0a2570] lg:bg-white lg:rounded-l-[2.5rem] lg:shadow-[-20px_0_50px_rgba(3,14,48,0.3)]">

        {/* Mobile branded header */}
        <div className="lg:hidden" style={{ background: '#3F6FE8' }}>
          <div className="px-6 pt-8 pb-14">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Link href="/login" className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition">
                  <svg className="h-4 w-4 text-white/90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                </Link>
                <span className="text-sm font-bold text-white">CareerPath<span className="text-white/85">Africa</span></span>
              </div>
              <Link href="/login" className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 transition">
                Sign in
              </Link>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/90 mb-1">Password reset</p>
            <h2 className="text-xl font-black text-white tracking-tight">Choose a strong password.</h2>
            <p className="text-xs text-white/90 mt-1.5 max-w-[280px] leading-relaxed">A strong password keeps your account, courses, and certificates safe.</p>
          </div>
        </div>

        {/* Form area — sheet on mobile */}
        <div className="-mt-6 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgba(3,14,48,0.12)] lg:mt-0 lg:rounded-none lg:shadow-none flex flex-1 items-center justify-center px-6 pt-2 pb-10 lg:py-10 overflow-y-auto">
          <div className="w-full max-w-[420px]">
            <div className="flex justify-center pt-1 pb-4 lg:hidden"><div className="w-10 h-1 rounded-full bg-navy/10" /></div>

            <AnimatePresence mode="wait">

              {/* ── Invalid link ── */}
              {view === 'invalid' && (
                <motion.div key="invalid" variants={scaleFade} initial="hidden" animate="visible" exit="exit" className="text-center">
                  <motion.div
                    initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={spring.bouncy}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100"
                  >
                    <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </motion.div>
                  <h2 className="text-2xl font-black text-navy mb-2">Invalid reset link</h2>
                  <p className="text-sm text-royal/60 mb-6">
                    This link is missing required parameters. Please request a new password reset.
                  </p>
                  <Link
                    href="/forgot-password"
                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white hover:opacity-90 transition"
                    style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
                    Request new link
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </motion.div>
              )}

              {/* ── Success ── */}
              {view === 'done' && (
                <motion.div key="done" variants={scaleFade} initial="hidden" animate="visible" exit="exit" className="text-center">
                  <motion.div
                    initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100"
                  >
                    <svg className="h-8 w-8 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <h2 className="text-2xl font-black text-navy mb-2">Password updated!</h2>
                  <p className="text-sm text-royal/60 leading-relaxed mb-6">
                    Your password has been reset successfully. You can now sign in with your new password.
                  </p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white hover:opacity-90 transition"
                    style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Sign in
                  </Link>
                </motion.div>
              )}

              {/* ── Form ── */}
              {view === 'form' && (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={spring.smooth}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.smooth, delay: 0.15 }}
                    className="mb-8"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-2">Password reset</p>
                    <h2 className="text-3xl font-black text-navy tracking-tight mb-2">Set new password</h2>
                    <p className="text-sm text-royal/50">
                      Choose a strong password — at least 8 characters.
                    </p>
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.div
                        key={error} variants={scaleFade} initial="hidden" animate="visible" exit="exit"
                        className="mb-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3"
                      >
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 mt-0.5">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.form
                    onSubmit={handleSubmit}
                    variants={stagger} initial="hidden" animate="visible"
                    className="space-y-4"
                  >
                    {/* New password */}
                    <motion.div variants={staggerItem} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy/70">New password</label>
                      <div className="group relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          required minLength={8} autoFocus
                          className="w-full rounded-2xl border-2 border-cloud bg-white py-3.5 pl-11 pr-12 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10"
                        />
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-royal/40 hover:text-azure transition-colors">
                          {showPw
                            ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          }
                        </button>
                      </div>
                      {password.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                                style={{ background: i <= strength.score ? strength.color : '#E6ECFD' }} />
                            ))}
                          </div>
                          <p className="text-[10px] font-semibold" style={{ color: strength.color }}>{strength.label}</p>
                        </div>
                      )}
                    </motion.div>

                    {/* Confirm password */}
                    <motion.div variants={staggerItem} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy/70">Confirm password</label>
                      <div className="group relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={confirm}
                          onChange={e => setConfirm(e.target.value)}
                          placeholder="Repeat your password"
                          required
                          className="w-full rounded-2xl border-2 bg-white py-3.5 pl-11 pr-12 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:ring-4 focus:ring-azure/10"
                          style={{ borderColor: pwMismatch ? '#ef4444' : pwMatch ? '#10b981' : '#E6ECFD' }}
                        />
                        {pwMatch && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}
                              className="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </motion.svg>
                          </div>
                        )}
                      </div>
                      {pwMismatch && <p className="text-xs text-red-500">Passwords do not match</p>}
                    </motion.div>

                    {/* Submit */}
                    <motion.div variants={staggerItem}>
                      <button
                        type="submit"
                        disabled={loading || password.length < 8 || password !== confirm}
                        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 mt-1"
                        style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Resetting…
                          </span>
                        ) : 'Reset password'}
                      </button>
                    </motion.div>
                  </motion.form>

                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ ...spring.fade, delay: 0.4 }}
                    className="mt-6 text-center text-xs text-royal/50"
                  >
                    Remember your password?{' '}
                    <Link href="/login" className="font-semibold text-azure hover:text-royal transition">Sign in</Link>
                  </motion.p>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* Desktop trust bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
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

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordInner /></Suspense>;
}
