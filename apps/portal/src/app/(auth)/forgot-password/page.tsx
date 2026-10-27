'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { spring, stagger, staggerItem, scaleFade } from '@/lib/motion';
import api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState('');
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch {
      setSent(true); // always show success to prevent email enumeration
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
    } catch { /* silent */ }
    finally { setResending(false); }
  }

  return (
    <div className="flex min-h-screen overflow-hidden">

      {/* ═══════════ LEFT PANEL ═══════════ */}
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

          {/* Hero — dominant headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.15 }}
            className="space-y-6"
          >
            <h1 className="text-7xl font-black text-white leading-[1.05] tracking-tight">
              We all forget<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #5889FA 0%, #93ADFC 50%, #c4d5ff 100%)' }}>
                sometimes.
              </span>
            </h1>
            <p className="text-lg text-white/40 leading-relaxed max-w-md">
              No worries — we'll send a secure link to your email so you can reset your password in seconds.
            </p>
          </motion.div>

          {/* Trust items — minimal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.4 }}
            className="space-y-3"
          >
            {[
              'Reset link expires in 1 hour',
              'Your data stays private — always',
              'Works with your WordPress account',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-azure/20">
                  <svg className="h-3 w-3 text-azure" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-white/50">{text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <div className="flex flex-1 flex-col bg-[#0a2570] lg:bg-white lg:rounded-l-[2.5rem] lg:shadow-[-20px_0_50px_rgba(3,14,48,0.3)]">

        {/* Mobile branded header */}
        <div className="lg:hidden" style={{ background: 'linear-gradient(145deg, #020a1f 0%, #061a4d 40%, #0a2570 100%)' }}>
          <div className="px-6 pt-8 pb-14">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Link href="/login" className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition">
                  <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                </Link>
                <span className="text-sm font-bold text-white">CareerPath<span className="text-azure">Africa</span></span>
              </div>
              <Link href="/login" className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition">
                Sign in
              </Link>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-1">Account recovery</p>
            <h2 className="text-xl font-black text-white tracking-tight">Reset your password.</h2>
            <p className="text-xs text-white/40 mt-1.5 max-w-[280px] leading-relaxed">We&apos;ll send a secure link to your email so you can reset it in seconds.</p>
          </div>
        </div>

        {/* Form area — sheet on mobile */}
        <div className="-mt-6 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgba(3,14,48,0.12)] lg:mt-0 lg:rounded-none lg:shadow-none flex flex-1 items-center justify-center px-6 pt-2 pb-10 lg:py-10 overflow-y-auto">
          <div className="w-full max-w-[420px]">
            <div className="flex justify-center pt-1 pb-4 lg:hidden"><div className="w-10 h-1 rounded-full bg-navy/10" /></div>

            <AnimatePresence mode="wait">
              {sent ? (
                /* ── Success state ── */
                <motion.div
                  key="sent"
                  variants={scaleFade} initial="hidden" animate="visible" exit="exit"
                  className="text-center"
                >
                  {/* Animated envelope */}
                  <motion.div
                    initial={{ scale: 0.5, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={spring.bouncy}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-azure/10"
                  >
                    <svg className="h-8 w-8 text-azure" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </motion.div>
                  <h2 className="text-2xl font-black text-navy mb-2">Check your inbox</h2>
                  <p className="text-sm text-royal/60 leading-relaxed mb-2">
                    If <span className="font-semibold text-navy">{email}</span> is registered,
                    you'll receive a password reset link shortly.
                  </p>
                  <p className="text-xs text-royal/40 mb-6">Check your spam folder if it doesn't arrive within a few minutes.</p>

                  <div className="flex flex-col gap-3">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white hover:opacity-90 transition"
                      style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Back to sign in
                    </Link>
                    <button
                      onClick={resend}
                      disabled={resending}
                      className="text-xs font-semibold text-azure hover:text-royal transition disabled:opacity-50">
                      {resending ? 'Resending…' : "Didn't get it? Resend email"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* ── Form state ── */
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={spring.smooth}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.smooth, delay: 0.15 }}
                    className="mb-8"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-2">Account recovery</p>
                    <h2 className="text-3xl font-black text-navy tracking-tight mb-2">Forgot password?</h2>
                    <p className="text-sm text-royal/50">
                      Enter the email linked to your account. We'll send a reset link.
                    </p>
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {error && (
                      <motion.div
                        key={error}
                        variants={scaleFade} initial="hidden" animate="visible" exit="exit"
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
                    className="space-y-5"
                  >
                    <motion.div variants={staggerItem} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy/70">Email address</label>
                      <div className="group relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          autoFocus
                          autoComplete="email"
                          className="w-full rounded-2xl border-2 border-cloud bg-white py-3.5 pl-11 pr-4 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10"
                        />
                      </div>
                    </motion.div>

                    <motion.div variants={staggerItem}>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Sending…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            Send reset link
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </span>
                        )}
                      </button>
                    </motion.div>
                  </motion.form>

                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ ...spring.fade, delay: 0.4 }}
                    className="mt-6 text-center text-xs text-royal/50"
                  >
                    Remember your password?{' '}
                    <Link href="/login" className="font-semibold text-azure hover:text-royal transition">
                      Sign in
                    </Link>
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
