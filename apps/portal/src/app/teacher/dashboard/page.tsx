'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

interface Cohort { id: string; name: string; _count: { students: number } }
interface Wallet { balance: number; currency: string }
interface Submission {
  id: string;
  submittedAt: string;
  student?: { firstName?: string | null; lastName?: string | null; email?: string };
  assignment?: { title?: string };
}
interface LiveSession { id: string; title: string; scheduledAt: string; status: string }
interface Me {
  bio: string | null;
  avatarUrl: string | null;
  videoIntroUrl: string | null;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [cohorts,      setCohorts]      = useState<Cohort[]>([]);
  const [wallet,       setWallet]       = useState<Wallet | null>(null);
  const [submissions,  setSubmissions]  = useState<Submission[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [me,           setMe]           = useState<Me | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/portals/teacher/cohorts').then(r => setCohorts(r.data)).catch(() => { setLoadError(true); }),
      api.get('/wallets/me/wallet').then(r => setWallet(r.data)).catch(() => {}),
      api.get('/education/submissions/queue').then(r => setSubmissions(r.data ?? [])).catch(() => {}),
      api.get('/live/teacher/upcoming').then(r => setLiveSessions(r.data ?? [])).catch(() => {}),
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-cloud bg-white p-5 space-y-2">
              <div className="h-2.5 w-20 rounded bg-cloud animate-pulse" />
              <div className="h-8 w-14 rounded bg-cloud animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
          <div className="space-y-3">
            {[1,2,3].map(i => <SkeletonCard key={i} lines={1} />)}
          </div>
        </div>
      </div>
    </div>
  );

  if (loadError && cohorts.length === 0 && liveSessions.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cloud">
          <Icon name="wifi" size={24} className="text-royal/40" />
        </div>
        <p className="text-base font-bold text-navy">Unable to load dashboard</p>
        <p className="mt-1 text-sm text-royal/60">Check your connection and try refreshing the page.</p>
        <button onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-azure px-5 py-2.5 text-sm font-semibold text-white hover:bg-royal transition">
          Refresh
        </button>
      </div>
    );
  }

  const firstName = user?.firstName ?? user?.email?.split('@')[0] ?? 'Teacher';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Getting-started step completion derived from real data
  const profileComplete = !!(me?.bio && me?.avatarUrl);
  const hasIntroVideo   = !!me?.videoIntroUrl;
  const hasCohort       = cohorts.length > 0;
  const hasLiveSession  = liveSessions.length > 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title={`${greeting}, ${firstName}`} subtitle="Manage your cohorts, classes and earnings" />

      <div className="flex-1 p-6 pb-28 lg:pb-6 space-y-6">

        {/* Profile completion prompt — shown if bio OR avatar is missing */}
        {me && (!me.bio || !me.avatarUrl) && (
          <div className="flex items-start gap-4 rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <Icon name="user" size={16} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Complete your teacher profile</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {!me.bio && !me.avatarUrl
                  ? 'Add a bio and profile photo so students can find and trust you.'
                  : !me.bio
                    ? 'Add a bio so students know your background and expertise.'
                    : 'Add a profile photo so students can recognise you.'}
              </p>
            </div>
            <Link href="/teacher/profile"
              className="flex-shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 transition px-4 py-2 text-xs font-bold text-white">
              Complete
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'My Cohorts',     value: cohorts.length,
              icon: 'mentorship' as const, sub: 'active groups' },
            { label: 'Total Students', value: cohorts.reduce((s, c) => s + (c._count?.students ?? 0), 0),
              icon: 'graduate' as const, sub: 'enrolled' },
            { label: 'Live Sessions',  value: liveSessions.length,
              icon: 'live' as const, sub: 'upcoming' },
            { label: 'Wallet Balance',
              value: wallet ? `${wallet.currency} ${Number(wallet.balance).toLocaleString()}` : '—',
              icon: 'wallet' as const, sub: 'available earnings' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ...spring.smooth }}
              whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(88,137,250,0.1)' }}
            >
              <Card padding="md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-navy leading-tight">{stat.value}</p>
                    <p className="text-xs text-royal/40 mt-0.5">{stat.sub}</p>
                  </div>
                  <IconBox><Icon name={stat.icon} size={16} /></IconBox>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Getting started (new teacher) */}
        {cohorts.length === 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="bg-gradient-to-r from-navy to-[#0d2f8a] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">Getting started</p>
                  <h2 className="text-base font-black text-white">Your teaching journey starts here</h2>
                  <p className="text-xs text-white/50 mt-1">Follow these steps to set up your teaching profile and start earning</p>
                </div>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/20">
                  <Icon name="graduate" size={20} className="text-azure" />
                </div>
              </div>
            </div>
            <div className="divide-y divide-cloud">
              {([
                { n: 1, done: true,            label: 'Application approved',        sub: 'Your account has been verified and approved',                          href: null,              cta: null },
                { n: 2, done: profileComplete, label: 'Complete your profile',        sub: 'Add your bio, avatar, bank details and intro video',                   href: '/teacher/profile', cta: 'Set up profile' },
                { n: 3, done: hasIntroVideo,   label: 'Add your intro video',         sub: 'A 60–90 second video helps students trust and choose you',             href: '/teacher/profile', cta: 'Add video' },
                { n: 4, done: hasCohort,       label: 'Wait for cohort assignment',   sub: "Admin will assign a student cohort to you — you'll see it here",      href: null,              cta: null },
                { n: 5, done: hasLiveSession,  label: 'Schedule your first live class', sub: 'Set your availability and host live sessions with students',        href: '/teacher/live',   cta: 'View schedule' },
              ] as { n: number; done: boolean; label: string; sub: string; href: string | null; cta: string | null }[]).map(step => (
                <div key={step.n} className="flex items-start gap-4 px-5 py-4">
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black mt-0.5 ${
                    step.done ? 'bg-azure text-white' : 'border-2 border-cloud text-royal/30'
                  }`}>
                    {step.done ? '✓' : step.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${step.done ? 'text-navy' : 'text-navy/70'}`}>{step.label}</p>
                    <p className="text-xs text-royal/50 mt-0.5">{step.sub}</p>
                  </div>
                  {!step.done && step.href && step.cta && (
                    <Link href={step.href}
                      className="flex-shrink-0 rounded-lg border border-azure px-3 py-1.5 text-xs font-semibold text-azure hover:bg-azure hover:text-white transition">
                      {step.cta}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Cohorts + grading queue */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">MY COHORTS</p>
                <h2 className="text-base font-bold text-navy">Active groups</h2>
              </div>
              <Link href="/teacher/cohorts" className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                Manage <Icon name="chevronRight" size={13} />
              </Link>
            </div>

            {cohorts.length === 0 ? (
              <Card padding="lg">
                <div className="flex flex-col items-center py-8 text-center">
                  <IconBox className="h-14 w-14 rounded-2xl mb-3"><Icon name="mentorship" size={24} /></IconBox>
                  <p className="text-sm font-semibold text-navy">No cohorts yet</p>
                  <p className="text-xs text-royal/50 mt-1">Cohorts will appear here once admin assigns students to you</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {cohorts.map(c => (
                  <Link key={c.id} href={`/teacher/cohorts/${c.id}`}>
                    <Card hover padding="md">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cloud flex-shrink-0">
                          <Icon name="mentorship" size={18} className="text-azure" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">{c.name}</p>
                          <p className="text-xs text-royal/50">{c._count?.students ?? 0} students enrolled</p>
                        </div>
                        <Badge variant="active">Active</Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {/* Grading queue */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-1 mt-2">GRADING QUEUE</p>
              <h2 className="text-base font-bold text-navy mb-3">
                {submissions.length} pending submission{submissions.length !== 1 ? 's' : ''}
              </h2>
              {submissions.length === 0 ? (
                <Card padding="sm">
                  <div className="flex items-center gap-3 py-2">
                    <Icon name="check" size={16} className="text-azure" />
                    <p className="text-xs text-royal/50">All submissions graded — you're up to date</p>
                  </div>
                </Card>
              ) : (
                <Card padding="none">
                  {submissions.slice(0, 4).map((s, i, arr) => {
                    const name = s.student?.firstName || s.student?.lastName
                      ? `${s.student.firstName ?? ''} ${s.student.lastName ?? ''}`.trim()
                      : s.student?.email?.split('@')[0] ?? 'Student';
                    return (
                      <div key={s.id}
                        className={`flex items-center gap-3 px-4 py-3${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-azure text-xs font-bold text-white flex-shrink-0">
                          {name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-navy truncate">{name}</p>
                          <p className="text-[10px] text-royal/50 truncate">{s.assignment?.title ?? 'Assignment'}</p>
                        </div>
                        <Link href={`/teacher/grade/${s.id}`}
                          className="rounded-lg bg-azure px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-royal transition flex-shrink-0">
                          Grade
                        </Link>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Upcoming classes */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">SCHEDULE</p>
              <h2 className="text-base font-bold text-navy mb-3">Upcoming classes</h2>
              {liveSessions.length === 0 ? (
                <Card padding="sm">
                  <div className="flex flex-col items-center py-3 text-center">
                    <Icon name="live" size={18} className="text-royal/20 mb-1" />
                    <p className="text-xs text-royal/40">No upcoming live sessions</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {liveSessions.slice(0, 3).map(s => (
                    <Card key={s.id} hover padding="sm">
                      <div className="flex items-center gap-3">
                        <IconBox><Icon name="live" size={15} /></IconBox>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-navy truncate">{s.title}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Icon name="clock" size={10} className="text-royal/40" />
                            <p className="text-[10px] text-royal/50">
                              {new Date(s.scheduledAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {s.status === 'ACTIVE' && <Badge variant="active">Live</Badge>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">QUICK ACCESS</p>
              <h2 className="text-base font-bold text-navy mb-3">Actions</h2>
              <Card padding="none">
                {[
                  { label: 'Grade submissions', icon: 'assignments' as const, href: '/teacher/assignments' },
                  { label: 'Quiz grading',      icon: 'notebook'    as const, href: '/teacher/quiz-grading' },
                  { label: 'Student alerts',    icon: 'bell'        as const, href: '/teacher/alerts' },
                  { label: 'My profile',        icon: 'user'        as const, href: '/teacher/profile' },
                ].map((item, i, arr) => (
                  <Link key={item.label} href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-cloud transition-all${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                    <IconBox className="h-7 w-7 rounded-lg"><Icon name={item.icon} size={15} /></IconBox>
                    <span className="flex-1 text-sm font-medium text-navy">{item.label}</span>
                    <Icon name="chevronRight" size={14} className="text-royal/30" />
                  </Link>
                ))}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
