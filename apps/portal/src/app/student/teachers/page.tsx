'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface Teacher {
  id: string; name: string; bio: string | null; subjectAreas: string[]; yearsExperience: number | null;
  avgRating: number | null; reviewCount: number; courseCount: number; cohortCount: number; courseIds: string[]; videoIntroUrl: string | null;
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export default function StudentTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [mentors, setMentors] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('all');
  const [mentorOnly, setMentorOnly] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/teachers', { params: { limit: 100 } }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      api.get('/portals/student/library').then(r => (r.data?.courses ?? []).map((c: { id: string }) => c.id) as string[]).catch(() => [] as string[]),
      api.get('/portals/student/cohort-overview').then(r => r.data?.teacher?.id as string | undefined).catch(() => undefined),
      api.get('/mentorship/mentors').then(r => (r.data ?? []).map((m: { id: string }) => m.id) as string[]).catch(() => [] as string[]),
    ]).then(([t, courseIds, cohortTeacher, mentorIds]) => {
      const owned = new Set(courseIds);
      const mineIds = new Set<string>((t as Teacher[]).filter(x => x.courseIds?.some(id => owned.has(id))).map(x => x.id));
      if (cohortTeacher) mineIds.add(cohortTeacher);
      setTeachers(t); setMine(mineIds); setMentors(new Set(mentorIds));
    });
  }, []);

  const subjects = useMemo(() => [...new Set((teachers ?? []).flatMap(t => t.subjectAreas))].sort(), [teachers]);
  const shown = (teachers ?? []).filter(t => (subject === 'all' || t.subjectAreas.includes(subject)) && (!mentorOnly || mentors.has(t.id))
    && (!q.trim() || `${t.name} ${t.subjectAreas.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const yours = shown.filter(t => mine.has(t.id));
  const others = shown.filter(t => !mine.has(t.id));

  const card = (t: Teacher) => (
    <article key={t.id} className={clsx('flex flex-col gap-2.5 rounded-lg border bg-white p-4', mine.has(t.id) ? 'border-azure' : 'border-line')}>
      <Link href={`/student/teachers/${t.id}`} className="flex items-center gap-3">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-extrabold text-azure-strong">{initials(t.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-navy">{t.name}</span>
          <span className="block truncate text-[12.5px] text-muted">{t.subjectAreas.slice(0, 3).join(', ') || 'Teacher'}{mine.has(t.id) ? ' · your teacher' : ''}</span>
        </span>
        <span className="whitespace-nowrap text-[13px] font-bold text-navy">{t.avgRating ? `${t.avgRating} ★` : 'New'}</span>
      </Link>
      {t.bio && <p className="line-clamp-2 text-[13px] text-ink2">{t.bio}</p>}
      <p className="text-[12.5px] text-muted">
        {[`${t.courseCount} course${t.courseCount === 1 ? '' : 's'}`, t.yearsExperience ? `${t.yearsExperience} years teaching` : null, t.reviewCount ? `${t.reviewCount} rating${t.reviewCount === 1 ? '' : 's'}` : null, mentors.has(t.id) ? 'free times this week' : null].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-auto flex gap-2 border-t border-line pt-2.5">
        {mentors.has(t.id)
          ? <Link href="/student/mentorship" className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-azure-strong text-[13px] font-semibold text-on-accent">Book mentorship</Link>
          : <Link href={`/student/teachers/${t.id}`} className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-line text-[13px] font-semibold text-navy hover:bg-subtle">View profile</Link>}
        <Link href={`/student/messages?to=${t.id}`} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Message</Link>
      </div>
    </article>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Teachers" subtitle="The people who teach your courses and classes" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 min-w-0 flex-[1_1_300px] items-center gap-2 rounded-md border border-line bg-white px-3 focus-within:border-azure">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden className="text-muted"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
            <input type="search" aria-label="Search teachers" value={q} onChange={e => setQ(e.target.value)} placeholder="Search teachers or subjects" className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-muted" />
          </label>
          <select aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className="h-10 rounded-md border border-line bg-white pl-3 pr-8 text-[13.5px] text-navy outline-none">
            <option value="all">Subject: All</option>{subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <button type="button" aria-pressed={mentorOnly} onClick={() => setMentorOnly(v => !v)}
            className={clsx('h-10 rounded-md border px-3 text-[13.5px] font-semibold', mentorOnly ? 'border-azure bg-accent-soft text-navy' : 'border-line bg-white text-ink2')}>Takes mentorship bookings</button>
        </div>
        {!teachers ? <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{[0, 1, 2].map(i => <div key={i} className="h-48 rounded-lg border border-line bg-white animate-pulse" />)}</div> : !shown.length ? (
          <p className="rounded-lg border border-line bg-white p-10 text-center text-[13px] text-ink2">No teachers match.</p>
        ) : <>
          {yours.length > 0 && <>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Your teachers</p>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{yours.map(card)}</div>
          </>}
          {others.length > 0 && <>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{yours.length ? 'More teachers' : 'All teachers'}</p>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">{others.map(card)}</div>
          </>}
        </>}
      </div>
    </div>
  );
}
