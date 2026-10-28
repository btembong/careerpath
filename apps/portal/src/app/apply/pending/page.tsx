'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { spring, stagger, staggerItem } from '@/lib/motion';

export default function ApplyPendingPage() {
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
              We're reviewing<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #5889FA 0%, #93ADFC 50%, #c4d5ff 100%)' }}>
                your application.
              </span>
            </h1>
            <p className="text-lg text-white/40 leading-relaxed max-w-md">
              Our team carefully reviews every application to ensure the best experience for students across Africa.
            </p>
          </motion.div>

          {/* What we review — minimal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.gentle, delay: 0.4 }}
            className="space-y-3"
          >
            {[
              'Teaching experience and qualifications',
              'Subject expertise and content quality',
              'Professional profile and references',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-azure/20">
                  <svg className="h-3 w-3 text-azure" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-white/50">{item}</span>
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
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                  <span className="text-[10px] font-black text-white">C</span>
                </div>
                <span className="text-sm font-bold text-white">CareerPath<span className="text-azure">Africa</span></span>
              </div>
              <Link href="/login" className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition">
                Sign in
              </Link>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400 mb-1">Under review</p>
            <h2 className="text-xl font-black text-white tracking-tight">We&apos;re reviewing your application.</h2>
            <p className="text-xs text-white/40 mt-1.5 max-w-[280px] leading-relaxed">Our team reviews every application to ensure the best experience for students.</p>
          </div>
        </div>

        {/* Content — sheet on mobile */}
        <div className="-mt-6 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgba(3,14,48,0.12)] lg:mt-0 lg:rounded-none lg:shadow-none flex flex-1 items-center justify-center px-6 pt-2 pb-10 lg:py-10">
          <div className="w-full max-w-[420px]">
            <div className="flex justify-center pt-1 pb-4 lg:hidden"><div className="w-10 h-1 rounded-full bg-navy/10" /></div>

            {/* Animated clock icon */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.bouncy}
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50"
            >
              <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.smooth, delay: 0.15 }}
              className="text-center mb-8"
            >
              <h1 className="text-2xl font-black text-navy mb-2">Application under review</h1>
              <p className="text-sm text-royal/60 leading-relaxed">
                Your teacher application is being reviewed by our team. This usually takes <strong className="text-navy">1–2 business days</strong>.
              </p>
            </motion.div>

            {/* Timeline */}
            <motion.div
              variants={stagger} initial="hidden" animate="visible"
              className="space-y-0 mb-8"
            >
              {[
                { step: '1', label: 'Application submitted',   done: true,  note: 'We received your details and documents.' },
                { step: '2', label: 'Team review in progress',  done: false, note: 'Our team is verifying your qualifications.', active: true },
                { step: '3', label: 'Decision email sent',      done: false, note: "You'll be notified at your registered email." },
              ].map((item, i) => (
                <motion.div key={item.step} variants={staggerItem} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all
                      ${item.done
                        ? 'bg-azure text-white shadow-md shadow-azure/30'
                        : item.active
                          ? 'bg-amber-100 text-amber-600 ring-4 ring-amber-100/50'
                          : 'bg-cloud text-royal/40'
                      }`}
                    >
                      {item.done ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        item.step
                      )}
                    </div>
                    {i < 2 && <div className={`w-0.5 h-8 mt-1 ${item.done ? 'bg-azure/30' : 'bg-cloud'}`} />}
                  </div>
                  <div className="pt-1 pb-4">
                    <p className={`text-sm font-semibold ${item.done ? 'text-navy' : item.active ? 'text-amber-600' : 'text-royal/40'}`}>
                      {item.label}
                      {item.active && <span className="ml-2 text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md">In progress</span>}
                    </p>
                    <p className="text-xs text-royal/40 mt-0.5">{item.note}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ ...spring.fade, delay: 0.5 }}
              className="space-y-3 border-t border-cloud pt-6"
            >
              <p className="text-xs text-center text-royal/50">
                Questions? Email us at{' '}
                <a href="mailto:support@careerpathafrica.com" className="text-azure font-semibold hover:underline">
                  support@careerpathafrica.com
                </a>
              </p>
              <Link href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-cloud py-3 text-sm font-semibold text-navy hover:bg-cloud transition">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to login
              </Link>
            </motion.div>

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
