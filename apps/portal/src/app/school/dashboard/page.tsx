'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import type { SchoolDashboard } from '@/lib/school';
import api from '@/lib/api';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function SchoolDashboardPage() {
  const [d, setD] = useState<SchoolDashboard | null>(null);
  useEffect(() => { api.get('/org/school').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your school')); }, []);

  const s = d?.stats;
  const withFree = d?.packages.filter(p => p.free > 0) ?? [];
  const first = withFree[0];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title={d?.org.name ?? 'Your school'} subtitle="Your seats, your students and how they’re doing" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        {!d ? <div className="h-[84px] animate-pulse rounded-lg border border-line bg-white" /> : (
          <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-extrabold text-navy">
                {first ? `${plural(first.free, 'seat')} still free on ${first.name}${withFree.length > 1 ? ` and ${withFree.length - 1} other package${withFree.length > 2 ? 's' : ''}` : ''}` : 'Every seat is taken'}
              </p>
              <p className="mt-0.5 text-[13px] text-ink2">{first ? 'Invite students by email, or share your school’s join link.' : 'Ask CareerPath Africa for more seats when you need them.'}</p>
            </div>
            {first && <Link href="/school/invite" className="inline-flex h-9 items-center rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Invite students</Link>}
          </section>
        )}

        <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'Seats', v: s ? String(s.seats) : '—', sub: s ? `${s.used} used · ${Math.max(0, s.seats - s.used)} free` : '' },
            { l: 'Active this week', v: s ? String(s.activeWeek) : '—', sub: s?.joined ? `${Math.round((s.activeWeek / s.joined) * 100)}% of students who joined` : 'nobody has joined yet' },
            { l: 'Lessons done', v: s ? s.lessonsDone.toLocaleString('en-GB') : '—', sub: 'by your students' },
            { l: 'Average quiz', v: s?.avgQuiz != null ? `${s.avgQuiz}%` : '—', sub: s?.avgQuizMonth != null ? `${s.avgQuizMonth}% this month` : 'no quizzes yet' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 text-[12px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-start gap-4">
          <section className="min-w-0 flex-[2_1_480px] rounded-lg border border-line bg-white">
            <h2 className="border-b border-line px-[18px] py-3.5 text-[16px] font-bold text-navy">Packages</h2>
            {!d ? <div className="m-4 h-24 animate-pulse rounded bg-subtle" /> : d.packages.map(p => (
              <div key={p.enrollmentId} className="flex items-center gap-3.5 border-b border-line px-[18px] py-[13px] text-[13.5px] last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy">{p.name}</p>
                  <p className="mt-px text-[12.5px] text-muted">{[plural(p.courses, 'course'), p.liveClasses ? 'live classes' : null, p.mentorship ? 'mentorship' : null, p.validityDays ? `${Math.round(p.validityDays / 30)} months from joining` : null].filter(Boolean).join(' · ')}</p>
                  <span className="mt-[7px] block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${p.seats ? Math.round(((p.joined + p.invited) / p.seats) * 100) : 0}%` }} /></span>
                </div>
                <span className="w-[130px] shrink-0 text-right text-[12.5px] text-muted">{p.joined + p.invited} of {plural(p.seats, 'seat')}{p.invited ? <><br />{p.invited} invited</> : null}</span>
              </div>
            ))}
          </section>
          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Need a nudge</h3>
            {[['Invited, not joined', d?.nudges.invitedNotJoined], ['Joined, not started', d?.nudges.joinedNotStarted], ['No activity for 2 weeks', d?.nudges.quietTwoWeeks]].map(([a, b]) => (
              <p key={a as string} className="flex justify-between text-[13px] text-navy"><span>{a}</span><span className="text-muted">{b ?? '—'}</span></p>
            ))}
            <Link href="/school/students" className="text-[13px] font-semibold text-azure-strong hover:underline">See them</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
