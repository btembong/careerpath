'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { walletMoney } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';
import { PersonPhoto } from '@/components/ui/PersonPhoto';
import { VideoThumb } from '@/components/ui/VideoThumb';

interface Teacher {
  id: string; name: string; avatarUrl?: string | null; bio: string | null; subjectAreas: string[]; yearsExperience: number | null;
  avgRating: number | null; reviewCount: number; ratingDist?: number[]; courseCount: number; cohortCount: number; courseIds: string[]; videoIntroUrl: string | null;
}
interface Detail extends Teacher {
  studentCount?: number;
  courses: { id: string; title: string; priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean }[];
  availableSlots: { id: string; startsAt: string }[];
}
interface Mentor { id: string; weekSlots?: number; nextAt?: string | null }
interface LibCourse { id: string; title: string; pct: number; next: { title: string } | null }
interface Yours { t: Teacher; role: string; next: string; cta: string; href: string }

// Some older profiles store subject ids instead of names
const realSubjects = (xs: string[]) => xs.filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));
const when = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
const short = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })} ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

function Avatar({ t, size }: { t: { id: string; name: string; avatarUrl?: string | null }; size: number }) {
  return <PersonPhoto src={t.avatarUrl} name={t.name} id={t.id} size={size} />;
}

export default function StudentTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [lib, setLib] = useState<LibCourse[]>([]);
  const [cohort, setCohort] = useState<{ teacherId: string; name: string; next: { title: string; scheduledAt: string } | null } | null>(null);
  const [mentors, setMentors] = useState<Map<string, Mentor>>(new Map());
  const [booked, setBooked] = useState<{ teacherId: string; startsAt: string } | null>(null);
  const [allow, setAllow] = useState<{ hasPackage: boolean; perMonth: number | null; left: number | null } | null>(null);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('All');
  const [mentorOnly, setMentorOnly] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => { api.get('/mentorship/allowance').then(r => setAllow(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    Promise.all([
      api.get('/teachers', { params: { limit: 100 } }).then(r => (r.data?.data ?? r.data ?? []) as Teacher[]).catch(() => []),
      api.get('/portals/student/library').then(r => (r.data?.courses ?? []) as LibCourse[]).catch(() => []),
      api.get('/portals/student/cohort-overview').then(r => r.data?.teacher ? { teacherId: r.data.teacher.id as string, name: r.data.cohort?.name as string, next: r.data.next ?? null } : null).catch(() => null),
      api.get('/mentorship/mentors').then(r => (r.data ?? []) as Mentor[]).catch(() => []),
      api.get('/mentorship/bookings/mine').then(r => (r.data ?? []).filter((b: any) => b.status === 'CONFIRMED' && new Date(b.slot.endsAt).getTime() > Date.now())
        .sort((a: any, b: any) => +new Date(a.slot.startsAt) - +new Date(b.slot.startsAt))[0]).catch(() => null),
    ]).then(([t, l, c, m, b]) => {
      setTeachers(t); setLib(l); setCohort(c); setMentors(new Map(m.map(x => [x.id, x])));
      setBooked(b ? { teacherId: b.slot.teacher.id, startsAt: b.slot.startsAt } : null);
    });
  }, []);

  // The student's own teachers, each with how they're connected and what's next
  const yours = useMemo(() => {
    const list: Yours[] = [];
    const byId = new Map((teachers ?? []).map(t => [t.id, t]));
    if (cohort && byId.get(cohort.teacherId)) list.push({ t: byId.get(cohort.teacherId)!, role: `Your class teacher · ${cohort.name}`, next: cohort.next ? `Next class ${when(cohort.next.scheduledAt)} · ${cohort.next.title}` : 'No class scheduled yet', cta: 'Open my class', href: '/student/cohorts' });
    if (booked && byId.get(booked.teacherId)) list.push({ t: byId.get(booked.teacherId)!, role: 'Your mentor', next: `Next session ${when(booked.startsAt)}`, cta: 'Open mentorship', href: '/student/mentorship' });
    for (const c of lib) {
      const t = (teachers ?? []).find(x => x.courseIds?.includes(c.id));
      if (!t || list.some(y => y.t.id === t.id && y.role.startsWith('Teaches'))) continue;
      list.push({ t, role: `Teaches your ${c.title.split(' · ')[0]} course`, next: c.pct >= 100 ? 'Course finished' : c.pct ? `You’re ${c.pct}% through${c.next ? ` · next: ${c.next.title}` : ''}` : c.next ? `Start with: ${c.next.title}` : 'Not started yet', cta: c.pct ? 'Continue the course' : 'Start the course', href: `/student/learn/${c.id}` });
    }
    return list.slice(0, 6);
  }, [teachers, lib, cohort, booked]);
  const mine = new Set(yours.map(y => y.t.id));

  const subjects = useMemo(() => [...new Set((teachers ?? []).flatMap(t => realSubjects(t.subjectAreas)))].sort(), [teachers]);
  const shown = (teachers ?? []).filter(t => (subject === 'All' || t.subjectAreas.includes(subject)) && (!mentorOnly || mentors.has(t.id))
    && (!q.trim() || `${t.name} ${t.subjectAreas.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || (b.avgRating ?? 0) - (a.avgRating ?? 0));
  const selected = (teachers ?? []).find(t => t.id === pick) ?? shown[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api.get(`/teachers/${selected.id}`).then(r => setDetail(r.data)).catch(() => {});
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on: boolean) => clsx('h-8 flex-shrink-0 rounded-md border px-3 text-[13px] font-semibold', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line bg-white text-ink2 hover:text-navy');

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Teachers" subtitle="The people who teach your courses, run your class and mentor you" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        {yours.length > 0 && (
          <section className="keep-light flex flex-col gap-4 rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-6">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[34px] font-extrabold leading-none tracking-[-0.03em] sm:text-[44px]">Your <span className="text-[#FFFFFF]">teachers</span></h2>
              <p className="text-sm text-[#0B1F55]">From your courses, your class and your mentor sessions</p>
            </div>
            <div className="flex flex-wrap items-stretch gap-4">
            {/* Cards keep their size; with only a few, the rest of the row shows what's coming up */}
            <div className="flex min-w-0 flex-[999_1_560px] snap-x gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {yours.map(y => (
                <div key={y.t.id + y.role} className="flex w-[280px] flex-shrink-0 snap-start flex-col gap-2.5 rounded-lg bg-[#FFFFFF] p-4">
                  <div className="flex items-center gap-3">
                    <Avatar t={y.t} size={44} />
                    <div className="min-w-0"><p className="truncate text-[15px] font-bold">{y.t.name}</p><p className="mt-px truncate text-[12.5px] font-semibold text-[#2F57C9]">{y.role}</p></div>
                  </div>
                  <p className="rounded-md bg-[#F4F6FB] px-2.5 py-2 text-[12.5px] text-[#3A4A70]">{y.next}</p>
                  <div className="mt-auto flex gap-2">
                    <Link href={y.href} className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-[#2F57C9] text-[12.5px] font-bold text-[#FFFFFF]">{y.cta}</Link>
                    <Link href={`/student/messages?to=${y.t.id}`} className="inline-flex h-8 items-center rounded-md border border-[#E4E9F3] px-3 text-[12.5px] font-bold">Message</Link>
                  </div>
                </div>
              ))}
            </div>
            <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-lg bg-[rgba(255,255,255,0.18)] p-4">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">Coming up with your teachers</p>
              {cohort?.next && (
                <Link href="/student/cohorts" className="flex items-center gap-3 rounded-md bg-[#FFFFFF] px-3 py-2.5">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[#EAF0FF] text-[#2F57C9]"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 10l5-3v10l-5-3M3 6h12v12H3z" /></svg></span>
                  <span className="min-w-0"><span className="block text-[13px] font-bold">Live class · {when(cohort.next.scheduledAt)}</span><span className="block truncate text-xs text-[#637090]">{cohort.next.title}</span></span>
                </Link>
              )}
              <Link href="/student/mentorship" className="flex items-center gap-3 rounded-md bg-[#FFFFFF] px-3 py-2.5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[#EAF0FF] text-[#2F57C9]"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg></span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">{booked ? `Mentor session · ${when(booked.startsAt)}` : allow?.hasPackage ? 'Book a mentor session' : 'Mentorship'}</span>
                  <span className="block truncate text-xs text-[#637090]">{booked ? 'Join opens 10 minutes before' : allow?.perMonth != null ? `${allow.left} of ${allow.perMonth} left this month` : allow?.hasPackage ? '30 minutes with a teacher you choose' : 'Comes with packages'}</span>
                </span>
              </Link>
              <Link href="/student/messages" className="mt-auto inline-flex h-9 items-center justify-center rounded-md bg-[#072061] text-[13px] font-bold text-[#FFFFFF]">Message your teachers</Link>
            </aside>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 min-w-0 flex-[1_1_280px] items-center gap-2 rounded-md border border-line bg-white px-3 focus-within:border-azure">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="text-muted"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
            <input type="search" aria-label="Search teachers" value={q} onChange={e => setQ(e.target.value)} placeholder="Search teachers or subjects" className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-muted" />
          </label>
          <div role="tablist" aria-label="Subject" className="flex max-w-full gap-1.5 overflow-x-auto">
            {['All', ...subjects].map(s => <button key={s} type="button" role="tab" aria-selected={subject === s} onClick={() => setSubject(s)} className={chip(subject === s)}>{s}</button>)}
          </div>
          <button type="button" aria-pressed={mentorOnly} onClick={() => setMentorOnly(v => !v)} className={chip(mentorOnly)}>Takes mentorship bookings</button>
        </div>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{teachers ? `${shown.length} teacher${shown.length === 1 ? '' : 's'}${subject === 'All' ? '' : ` · ${subject}`}` : 'Teachers'}</p>
            {!teachers ? <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">{[0, 1, 2, 3].map(i => <div key={i} className="h-44 animate-pulse rounded-xl border border-line bg-white" />)}</div>
              : !shown.length ? <p className="rounded-xl border border-line bg-white p-10 text-center text-[13px] text-ink2">No teachers match.</p> : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                {shown.map(t => {
                  const m = mentors.get(t.id), on = selected?.id === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setPick(t.id)} aria-pressed={on}
                      className={clsx('flex flex-col gap-2.5 rounded-xl border-2 bg-white p-4 text-left text-navy', on ? 'border-[#3F6FE8] shadow-[0_8px_20px_rgba(63,111,232,0.15)]' : mine.has(t.id) ? 'border-[#C9D7FB]' : 'border-line hover:border-[#C9D7FB]')}>
                      <span className="flex w-full items-center gap-3">
                        <Avatar t={t} size={46} />
                        <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-[15px] font-bold leading-tight">{t.name}</span><span className="block truncate text-[12.5px] text-muted">{[t.yearsExperience ? `${t.yearsExperience} years teaching` : null, mine.has(t.id) ? 'yours' : null].filter(Boolean).join(' · ') || 'Teacher'}</span></span>
                        <span className="text-right"><span className="block text-[15px] font-extrabold">{t.avgRating ? `${t.avgRating} ★` : 'New'}</span><span className="block text-[11px] text-muted">{t.reviewCount ? `${t.reviewCount} rating${t.reviewCount === 1 ? '' : 's'}` : 'no ratings yet'}</span></span>
                      </span>
                      {realSubjects(t.subjectAreas).length > 0 && <span className="flex w-full flex-wrap gap-[5px]">{realSubjects(t.subjectAreas).slice(0, 3).map(s => <span key={s} className="inline-flex h-[22px] items-center rounded bg-subtle px-2 text-xs font-semibold text-ink2">{s}</span>)}</span>}
                      <span className="mt-auto flex w-full justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
                        <span className="text-ink2">{t.courseCount} course{t.courseCount === 1 ? '' : 's'}{t.cohortCount ? ` · ${t.cohortCount} class${t.cohortCount === 1 ? '' : 'es'}` : ''}</span>
                        <strong className={m?.weekSlots ? 'text-[#1F6B47]' : 'text-muted'}>{m?.weekSlots ? `${m.weekSlots} free time${m.weekSlots === 1 ? '' : 's'} this week` : m ? 'Mentoring later' : 'No mentoring'}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {selected && (
            <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 rounded-xl border border-line bg-white p-5 lg:sticky lg:top-6">
              <div className="flex items-center gap-3.5">
                <Avatar t={selected} size={64} />
                <div className="min-w-0"><p className="text-xl font-extrabold text-navy">{selected.name}</p><p className="mt-0.5 text-[13px] text-muted">{[realSubjects(selected.subjectAreas).join(', '), selected.yearsExperience ? `${selected.yearsExperience} years teaching` : null].filter(Boolean).join(' · ')}</p></div>
              </div>
              {selected.videoIntroUrl && (
                <VideoThumb url={selected.videoIntroUrl} photo={selected.avatarUrl} href={`/student/teachers/${selected.id}`}
                  label={`Meet ${selected.name.replace(/\s*\(.*\)\s*$/, '')}`} className="h-[170px]" />
              )}
              {selected.bio && <p className="line-clamp-5 text-[13.5px] leading-normal text-ink2">{selected.bio}</p>}
              <dl className="grid grid-cols-3 gap-2">
                {[['Courses', selected.courseCount], ['Students', detail?.studentCount ?? '…'], ['Free this week', mentors.get(selected.id)?.weekSlots ?? 0]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-subtle p-2.5"><dt className="text-[11.5px] text-muted">{l}</dt><dd className="mt-0.5 text-lg font-extrabold text-navy">{v}</dd></div>
                ))}
              </dl>
              {selected.reviewCount > 0 && selected.ratingDist && (
                <div>
                  <p className="mb-1.5 text-[13px] font-bold text-navy">What students say · {selected.avgRating} ★ from {selected.reviewCount}</p>
                  {[5, 4, 3, 2, 1].map((s, k) => (
                    <div key={s} className="mb-1 flex items-center gap-2 text-xs text-ink2">
                      <span className="w-[18px]">{s}★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-accent-soft"><span className="block h-2 rounded bg-[#3F6FE8]" style={{ width: `${Math.round((selected.ratingDist![k] / selected.reviewCount) * 100)}%` }} /></span>
                      <span className="w-7 text-right">{selected.ratingDist![k]}</span>
                    </div>
                  ))}
                </div>
              )}
              {detail?.courses?.length ? (
                <div>
                  <p className="mb-1.5 text-[13px] font-bold text-navy">Courses</p>
                  {detail.courses.slice(0, 5).map(c => {
                    const have = lib.some(l => l.id === c.id);
                    return (
                      <Link key={c.id} href={`/student/courses/${c.id}`} className="flex justify-between gap-2 border-t border-line py-2 text-[13px] text-navy hover:text-azure-strong">
                        <span className="min-w-0 truncate">{c.title}</span>
                        <strong className={clsx('whitespace-nowrap', have ? 'text-[#1F6B47]' : 'text-navy')}>{have ? 'Yours' : c.isSoldIndividually && c.priceAmount && c.priceCurrency ? walletMoney(c.priceAmount, c.priceCurrency) : 'In a package'}</strong>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex gap-2">
                {mentors.has(selected.id)
                  ? <Link href="/student/mentorship" className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md bg-azure-strong px-3 text-[13.5px] font-bold text-on-accent">{mentors.get(selected.id)?.nextAt ? `Book mentorship · next ${short(mentors.get(selected.id)!.nextAt!)}` : 'Book mentorship'}</Link>
                  : <Link href={`/student/teachers/${selected.id}`} className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md bg-azure-strong px-3 text-[13.5px] font-bold text-on-accent">View full profile</Link>}
                <Link href={`/student/messages?to=${selected.id}`} className="inline-flex h-[38px] items-center rounded-md border border-line px-3.5 text-[13.5px] font-bold text-navy hover:bg-subtle">Message</Link>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
