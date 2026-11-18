'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { walletMoney } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { HeroPhoto } from '@/components/hero/PageHero';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';

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
interface Yours { t: Teacher; role: string; tag: string; next: string; cta: string; href: string }

// Some older profiles store subject ids instead of names
const realSubjects = (xs: string[]) => xs.filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));
const when = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
const short = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })} ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
const firstName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '');

/** Two subjects, then "+3" for the rest: some profiles list 18 */
function Subjects({ t, className }: { t: Teacher; className?: string }) {
  const s = realSubjects(t.subjectAreas);
  if (!s.length) return null;
  return <span className={className}>{s.slice(0, 2).join(' · ')}{s.length > 2 && <span className="text-[#9AA6C2]"> +{s.length - 2}</span>}</span>;
}

/** When you can meet them: the next free time, or a quiet note */
function Free({ m, className }: { m?: Mentor; className?: string }) {
  return m?.nextAt
    ? <span className={clsx('font-bold text-[#17703A]', className)}><span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[#17703A] align-[1px]" />Free {short(m.nextAt)}</span>
    : <span className={clsx('text-muted', className)}>{m ? 'No free times this week' : 'Not taking bookings'}</span>;
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
  const [videoOnly, setVideoOnly] = useState(false);
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
    if (cohort && byId.get(cohort.teacherId)) list.push({ t: byId.get(cohort.teacherId)!, role: `Your class teacher · ${cohort.name}`, tag: 'Your class teacher', next: cohort.next ? `Next class ${when(cohort.next.scheduledAt)} · ${cohort.next.title}` : 'No class scheduled yet', cta: 'Open my class', href: '/student/cohorts' });
    if (booked && byId.get(booked.teacherId)) list.push({ t: byId.get(booked.teacherId)!, role: 'Your mentor', tag: 'Your mentor', next: `Next session ${when(booked.startsAt)}`, cta: 'Open mentorship', href: '/student/mentorship' });
    for (const c of lib) {
      const t = (teachers ?? []).find(x => x.courseIds?.includes(c.id));
      if (!t || list.some(y => y.t.id === t.id && y.role.startsWith('Teaches'))) continue;
      const name = c.title.split(' · ')[0];
      list.push({ t, role: `Teaches your ${name} course`, tag: name.length <= 18 ? `Teaches your ${name}` : 'Teaches your course', next: c.pct >= 100 ? 'Course finished' : c.pct ? `You’re ${c.pct}% through${c.next ? ` · next: ${c.next.title}` : ''}` : c.next ? `Start with: ${c.next.title}` : 'Not started yet', cta: c.pct ? 'Continue the course' : 'Start the course', href: `/student/learn/${c.id}` });
    }
    return list.slice(0, 6);
  }, [teachers, lib, cohort, booked]);
  const tagOf = new Map<string, string>();
  for (const y of yours) if (!tagOf.has(y.t.id)) tagOf.set(y.t.id, y.tag);

  const subjects = useMemo(() => [...new Set((teachers ?? []).flatMap(t => realSubjects(t.subjectAreas)))].sort(), [teachers]);
  // Yours first, then teachers with courses here, then those with a photo, then by rating
  const shown = (teachers ?? []).filter(t => (subject === 'All' || t.subjectAreas.includes(subject)) && (!mentorOnly || mentors.has(t.id)) && (!videoOnly || !!t.videoIntroUrl)
    && (!q.trim() || `${t.name} ${t.subjectAreas.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(tagOf.has(b.id)) - Number(tagOf.has(a.id)) || Number(b.courseCount > 0) - Number(a.courseCount > 0)
      || Number(!!b.avatarUrl) - Number(!!a.avatarUrl) || (b.avgRating ?? 0) - (a.avgRating ?? 0));
  const selected = (teachers ?? []).find(t => t.id === pick) ?? shown[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api.get(`/teachers/${selected.id}`).then(r => setDetail(r.data)).catch(() => {});
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on: boolean) => clsx('h-8 flex-shrink-0 rounded-md border px-3 text-[13px] font-semibold', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line bg-white text-ink2 hover:text-navy');
  const fact = 'inline-flex h-[26px] items-center gap-1 rounded-[5px] bg-subtle px-2 text-xs text-muted';
  const selSubjects = selected ? realSubjects(selected.subjectAreas) : [];

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
            {/* Cards keep their size; with only a few, the rest of the row shows what's coming up. The photo hangs over each card's top edge */}
            <div className="flex min-w-0 flex-[999_1_560px] snap-x gap-3 overflow-x-auto pb-1 pt-1 sm:flex-wrap sm:overflow-visible">
              {yours.map(y => (
                <div key={y.t.id + y.role} className="mt-8 flex w-[270px] flex-shrink-0 snap-start flex-col gap-2.5 rounded-lg bg-[#FFFFFF] px-4 pb-4 sm:mt-11 sm:w-[290px]">
                  <Link href={`/student/teachers/${y.t.id}`} aria-label={y.t.name} className="group -mt-8 self-start sm:-mt-11">
                    <TeacherPhoto src={y.t.avatarUrl} name={y.t.name} size="hero" />
                  </Link>
                  <div className="min-w-0"><p className="truncate text-[15.5px] font-bold">{y.t.name}</p><p className="mt-0.5 line-clamp-2 text-[12.5px] font-semibold text-[#2F57C9]" title={y.role}>{y.role}</p></div>
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
          <button type="button" aria-pressed={mentorOnly} onClick={() => setMentorOnly(v => !v)} className={chip(mentorOnly)}>Takes bookings</button>
          <button type="button" aria-pressed={videoOnly} onClick={() => setVideoOnly(v => !v)} className={chip(videoOnly)}>Has a video</button>
        </div>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{teachers ? `${shown.length} teacher${shown.length === 1 ? '' : 's'}${subject === 'All' ? '' : ` · ${subject}`}` : 'Teachers'}</p>
            {!teachers ? <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">{[0, 1, 2, 3].map(i => <div key={i} className="h-72 animate-pulse rounded-lg border border-line bg-white" />)}</div>
              : !shown.length ? <p className="rounded-lg border border-line bg-white p-10 text-center text-[13px] text-ink2">No teachers match.</p> : (<>
              {/* Phone: a row per teacher; a tap opens their profile */}
              <div className="flex flex-col gap-2 sm:hidden">
                {shown.map(t => (
                  <Link key={t.id} href={`/student/teachers/${t.id}`} className={clsx('group flex items-center gap-3.5 rounded-lg border bg-white p-3 text-navy', tagOf.has(t.id) ? 'border-[#C9D7FB]' : 'border-line')}>
                    <TeacherPhoto src={t.avatarUrl} name={t.name} size="row" video={!!t.videoIntroUrl} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {tagOf.has(t.id) && <span className="self-start rounded-[5px] bg-[#EAF0FF] px-1.5 py-0.5 text-[10.5px] font-extrabold text-[#2F57C9]">{tagOf.get(t.id)}</span>}
                      <span className="line-clamp-2 text-[15px] font-bold leading-tight">{t.name}</span>
                      <span className="truncate text-[12.5px] text-ink2">{[realSubjects(t.subjectAreas).slice(0, 2).join(' · '), t.yearsExperience ? `${t.yearsExperience} yrs` : null].filter(Boolean).join(' · ')}</span>
                      {mentors.get(t.id)?.nextAt ? <Free m={mentors.get(t.id)} className="text-xs" />
                        : <span className="text-xs text-muted">{t.courseCount ? `${t.courseCount} course${t.courseCount === 1 ? '' : 's'}` : 'Courses coming'}{t.avgRating ? ` · ${t.avgRating} ★` : ''}</span>}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="flex-shrink-0 text-muted"><path d="M9 6l6 6-6 6" /></svg>
                  </Link>
                ))}
              </div>
              {/* Wider: cards led by the photo, with a preview beside them */}
              <div className="hidden gap-3.5 sm:grid sm:[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {shown.map(t => {
                  const on = selected?.id === t.id, tag = tagOf.get(t.id);
                  return (
                    <div key={t.id} className={clsx('group relative flex flex-col gap-2.5 rounded-lg bg-white px-4 pb-3.5 pt-[18px] text-navy',
                      on ? 'border-2 border-[#3F6FE8] shadow-[0_12px_26px_rgba(63,111,232,0.16)]' : tag ? 'border-2 border-[#C9D7FB]' : 'border-2 border-line hover:border-[#C9D7FB]')}>
                      <button type="button" onClick={() => setPick(t.id)} aria-pressed={on} aria-label={`Show ${t.name}`} className="absolute inset-0 rounded-lg" />
                      <span className="pointer-events-none flex min-h-[136px] items-start justify-between gap-2">
                        <TeacherPhoto src={t.avatarUrl} name={t.name} video={!!t.videoIntroUrl} straight={on} />
                        {tag && <span className="rounded-[5px] bg-[#EAF0FF] px-2 py-1 text-[11.5px] font-extrabold leading-tight text-[#2F57C9]">{tag}</span>}
                      </span>
                      <span className="pointer-events-none mt-1 line-clamp-2 text-[17px] font-extrabold leading-tight tracking-[-0.01em]">{t.name}</span>
                      <Subjects t={t} className="pointer-events-none text-[13px] leading-snug text-ink2" />
                      <span className="pointer-events-none flex flex-wrap gap-1.5">
                        {t.courseCount ? <span className={fact}><b className="text-[13px] text-navy">{t.courseCount}</b> course{t.courseCount === 1 ? '' : 's'}</span> : <span className={fact}>Courses coming</span>}
                        {!!t.yearsExperience && <span className={fact}><b className="text-[13px] text-navy">{t.yearsExperience}</b> yrs teaching</span>}
                        {t.reviewCount > 0 && t.avgRating != null && <span className={fact}><b className="text-[13px] text-navy">{t.avgRating} ★</b> {t.reviewCount}</span>}
                      </span>
                      <span className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
                        <Free m={mentors.get(t.id)} className="pointer-events-none" />
                        <Link href={`/student/messages?to=${t.id}`} className="relative inline-flex h-7 items-center rounded-md border border-line px-2.5 font-bold text-navy hover:bg-subtle">Message</Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>)}
          </section>

          {selected && (
            <aside className="hidden min-w-0 flex-[1_1_340px] flex-col overflow-hidden rounded-lg border border-line bg-white sm:flex lg:sticky lg:top-6">
              <div className="keep-light flex items-center gap-4 bg-[#3F6FE8] p-5 text-navy">
                <HeroPhoto src={selected.avatarUrl} initials={firstName(selected.name).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()} />
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">{['Teacher', selected.yearsExperience ? `${selected.yearsExperience} years` : null].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em]">{selected.name}.</p>
                  {selSubjects.length > 0 && <p className="mt-1 text-sm font-extrabold text-[#FFFFFF]">{selSubjects.slice(0, 2).join(' and ')}.</p>}
                </div>
              </div>
              <div className="flex flex-col gap-3.5 p-5">
                {selected.videoIntroUrl && (
                  <VideoThumb url={selected.videoIntroUrl} photo={selected.avatarUrl} href={`/student/teachers/${selected.id}`}
                    label={`Meet ${firstName(selected.name)}`} className="h-[170px]" />
                )}
                {selected.bio && <p className="line-clamp-5 text-[13.5px] leading-normal text-ink2">{selected.bio}</p>}
                <dl className="grid grid-cols-3 gap-2">
                  {[['Courses', selected.courseCount], ['Students', detail?.studentCount ?? '…'], ['Free this week', mentors.get(selected.id)?.weekSlots ?? 0]].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-subtle p-2.5"><dt className="text-[11.5px] text-muted">{l}</dt><dd className="mt-0.5 text-lg font-extrabold text-navy">{v}</dd></div>
                  ))}
                </dl>
                {!!detail?.availableSlots?.length && (
                  <div>
                    <p className="mb-1.5 text-[13px] font-bold text-navy">Free times</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {detail.availableSlots.slice(0, 3).map(s => <Link key={s.id} href="/student/mentorship" className="flex h-[30px] items-center justify-center rounded-md border border-line text-xs font-semibold text-navy hover:border-azure">{short(s.startsAt)}</Link>)}
                    </div>
                  </div>
                )}
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
                    ? <Link href="/student/mentorship" className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md bg-azure-strong px-3 text-[13.5px] font-bold text-on-accent">{mentors.get(selected.id)?.nextAt ? `Book · ${short(mentors.get(selected.id)!.nextAt!)}` : 'Book mentorship'}</Link>
                    : <Link href={`/student/teachers/${selected.id}`} className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md bg-azure-strong px-3 text-[13.5px] font-bold text-on-accent">View full profile</Link>}
                  <Link href={`/student/messages?to=${selected.id}`} className="inline-flex h-[38px] items-center rounded-md border border-line px-3.5 text-[13.5px] font-bold text-navy hover:bg-subtle">Message</Link>
                </div>
                {mentors.has(selected.id) && <Link href={`/student/teachers/${selected.id}`} className="text-center text-[13px] font-bold text-azure-strong hover:underline">View full profile →</Link>}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
