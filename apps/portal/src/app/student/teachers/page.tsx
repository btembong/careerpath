'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { walletMoney } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';
import { Icon } from '@/components/ui/Icon';
import { Flag } from '@/components/ui/Flag';
import { cardTitle } from '@/components/public/course/BigCourseCard';

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
  // The public list: each teacher's country (for flags and the country filter)
  const [pub, setPub] = useState<Map<string, { country: { code: string; name: string } | null }>>(new Map());
  const [country, setCountry] = useState('');
  const [closed, setClosed] = useState(false);

  useEffect(() => { api.get('/mentorship/allowance').then(r => setAllow(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/catalogue/teacher-list').then(r => setPub(new Map(((r.data ?? []) as { id: string; country: { code: string; name: string } | null }[]).map(x => [x.id, x])))).catch(() => {}); }, []);
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
      const name = cardTitle(c.title).title;
      list.push({ t, role: `Teaches your ${name} course`, tag: name.length <= 18 ? `Teaches your ${name}` : 'Teaches your course', next: c.pct >= 100 ? 'Course finished' : c.pct ? `You’re ${c.pct}% through${c.next ? ` · next: ${c.next.title}` : ''}` : c.next ? `Start with: ${c.next.title}` : 'Not started yet', cta: c.pct ? 'Continue the course' : 'Start the course', href: `/student/learn/${c.id}` });
    }
    return list.slice(0, 6);
  }, [teachers, lib, cohort, booked]);
  const tagOf = new Map<string, string>();
  for (const y of yours) if (!tagOf.has(y.t.id)) tagOf.set(y.t.id, y.tag);

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

  // Subjects by how many teachers teach them: the first six as chips, the rest in "More"
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of teachers ?? []) for (const s of realSubjects(t.subjectAreas)) m.set(s, (m.get(s) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [teachers]);
  const countries = useMemo(() => [...new Map([...pub.values()].filter(p => p.country).map(p => [p.country!.code, p.country!])).values()].sort((a, b) => a.name.localeCompare(b.name)), [pub]);
  const visible = shown.filter(t => !country || pub.get(t.id)?.country?.code === country);
  const panelOn = !closed && !!selected;
  // Their progress with a teacher: the courses of theirs this teacher teaches
  const progressWith = (t: Teacher) => {
    const cs = lib.filter(l => t.courseIds?.includes(l.id));
    return cs.length ? Math.round(cs.reduce((n, c) => n + c.pct, 0) / cs.length) : null;
  };
  const selSubjects = selected ? realSubjects(selected.subjectAreas) : [];
  const selCourses = detail?.courses ?? [];
  const selMine = selCourses.filter(c => lib.some(l => l.id === c.id));
  const selOther = selCourses.filter(c => !lib.some(l => l.id === c.id));
  const chip = (on: boolean) => clsx('inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-md px-3 text-[13px] font-bold', on ? 'bg-[#FFFFFF] text-[#072061]' : 'bg-[rgba(255,255,255,0.22)] text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.32)]');
  const toggle = (on: boolean) => clsx('h-9 rounded-lg border px-3 text-[13px] font-bold', on ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-ink2 hover:text-navy');
  const fact = 'inline-flex h-[24px] items-center gap-1 rounded-[6px] border border-line px-1.5 text-[11.5px] text-muted';
  // Computers: a card shows the teacher in the panel; phones: it opens their page
  const choose = (e: React.MouseEvent, id: string) => { if (window.matchMedia('(min-width: 1024px)').matches) { e.preventDefault(); setPick(id); setClosed(false); } };

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Teachers" subtitle="The people who teach your courses, run your class and mentor you" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <section className="keep-light flex flex-col gap-5 overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_50%,#6B8BFF_100%)] p-5 text-[#FFFFFF] sm:p-7">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[#DCE6FF]">Teachers{teachers ? ` · ${teachers.length}` : ''}{countries.length ? ` · ${countries.length} countries` : ''}</p>
              <h1 className="text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] text-[#FFFFFF] sm:text-[42px]">{yours.length ? <>Your teachers,<br /><span className="text-[#072061]">and every teacher here.</span></> : <>Find your teacher,<br /><span className="text-[#072061]">from your exam board.</span></>}</h1>
              <label className="flex h-11 w-full max-w-[560px] items-center gap-2 rounded-lg bg-[#FFFFFF] px-3.5 shadow-[0_10px_24px_rgba(7,32,97,0.18)]">
                <Icon name="search" size={16} className="text-[#637090]" />
                <input type="search" aria-label="Search teachers" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a teacher or subject… e.g. “chemistry”" className="min-w-0 flex-1 bg-transparent text-[14.5px] text-[#072061] outline-none placeholder:text-[#9AA6C2]" />
              </label>
              <div role="tablist" aria-label="Subject" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
                <button type="button" role="tab" aria-selected={subject === 'All'} onClick={() => setSubject('All')} className={chip(subject === 'All')}>All <span className="opacity-65">{teachers?.length ?? ''}</span></button>
                {counts.slice(0, 6).map(([s, n]) => <button key={s} type="button" role="tab" aria-selected={subject === s} onClick={() => setSubject(s)} className={chip(subject === s)}>{s} <span className="opacity-65">{n}</span></button>)}
                {counts.length > 6 && (
                  <select aria-label="More subjects" value={counts.slice(6).some(([s]) => s === subject) ? subject : ''} onChange={e => e.target.value && setSubject(e.target.value)}
                    className={clsx(chip(counts.slice(6).some(([s]) => s === subject)), 'w-[86px] cursor-pointer appearance-none pr-3 outline-none [&>option]:text-[#072061]')}>
                    <option value="">More ▾</option>
                    {counts.slice(6).map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
                  </select>
                )}
              </div>
            </div>
            <aside className="flex flex-col gap-2 rounded-[14px] bg-[rgba(255,255,255,0.14)] p-3 text-[#072061]">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#DCE6FF]">Coming up with your teachers</p>
              {cohort?.next && (
                <Link href="/student/cohorts" className="flex items-center gap-2.5 rounded-[10px] bg-[#FFFFFF] px-3 py-2"><Icon name="live" size={16} className="text-[#2F57C9]" />
                  <span className="min-w-0"><b className="block text-[12.5px]">Live class · {when(cohort.next.scheduledAt)}</b><span className="block truncate text-[11px] text-[#637090]">{cohort.next.title}</span></span></Link>
              )}
              <Link href="/student/mentorship" className="flex items-center gap-2.5 rounded-[10px] bg-[#FFFFFF] px-3 py-2"><Icon name="mentorship" size={16} className="text-[#2F57C9]" />
                <span className="min-w-0"><b className="block text-[12.5px]">{booked ? `Mentor session · ${when(booked.startsAt)}` : allow?.hasPackage ? 'Book a mentor session' : 'Mentorship'}</b>
                  <span className="block truncate text-[11px] text-[#637090]">{booked ? 'Join from Mentorship' : allow?.perMonth != null ? `${allow.left} of ${allow.perMonth} left this month` : allow?.hasPackage ? '30 minutes with a teacher you choose' : 'Comes with packages'}</span></span></Link>
              {lib.find(l => l.pct > 0 && l.pct < 100 && l.next) && (() => { const l = lib.find(x => x.pct > 0 && x.pct < 100 && x.next)!; return (
                <Link href={`/student/learn/${l.id}`} className="flex items-center gap-2.5 rounded-[10px] bg-[#FFFFFF] px-3 py-2"><Icon name="docLine" size={16} className="text-[#2F57C9]" />
                  <span className="min-w-0"><b className="block truncate text-[12.5px]">Next lesson · {l.next!.title}</b><span className="block truncate text-[11px] text-[#637090]">{cardTitle(l.title).title}</span></span></Link>
              ); })()}
              <Link href="/student/messages" className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#072061] text-[13px] font-extrabold text-[#FFFFFF]">Message your teachers</Link>
            </aside>
          </div>

          {yours.length > 0 && <>
            <p className="-mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#DCE6FF]">Your teachers · {new Set(yours.map(y => y.t.id)).size}</p>
            <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-1 pt-9 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3">
              {yours.map(y => (
                <div key={y.t.id + y.role} className="relative flex w-[270px] flex-shrink-0 snap-start flex-col gap-2 rounded-[14px] bg-[#FFFFFF] px-4 pb-4 pt-14 text-[#072061] shadow-[0_14px_30px_rgba(7,32,97,0.25)] sm:w-auto">
                  <Link href={`/student/teachers/${y.t.id}`} aria-label={y.t.name} className="absolute -top-9 left-4 flex h-[84px] w-[84px] -rotate-[4deg] items-center justify-center overflow-hidden rounded-[20px] bg-[#FFFDF8] text-[26px] font-extrabold text-[#3F6FE8] shadow-[0_12px_24px_rgba(7,32,97,0.35)] transition-transform hover:rotate-0">
                    {y.t.avatarUrl ? <img src={y.t.avatarUrl} alt="" className="h-full w-full object-cover" /> : y.t.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </Link>
                  <b className="truncate text-[16px]">{y.t.name}</b>
                  <span className="line-clamp-2 text-[12.5px] font-semibold text-[#2F57C9]">{y.role}</span>
                  <span className="rounded-lg bg-[#F4F6FB] px-2.5 py-1.5 text-[12px] text-[#3A4A70]">{y.next}</span>
                  <span className="mt-auto flex gap-1.5">
                    <Link href={y.href} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#2F57C9] text-[12.5px] font-extrabold text-[#FFFFFF]">{y.cta}</Link>
                    <Link href={`/student/messages?to=${y.t.id}`} className="inline-flex h-9 items-center rounded-lg border border-[#D5DDEC] px-3 text-[12.5px] font-extrabold text-[#072061]">Message</Link>
                  </span>
                </div>
              ))}
              <a href="#all-teachers" className="flex w-[240px] flex-shrink-0 snap-start flex-col justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[rgba(255,255,255,0.55)] bg-[rgba(255,255,255,0.12)] p-4 sm:w-auto">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#FFFFFF] text-[#2F57C9]"><Icon name="search" size={17} /></span>
                <b className="text-[15px]">Find another teacher</b><span className="text-[12.5px] text-[#EEF3FF]">Pick a subject above, or browse everyone below.</span>
              </a>
            </div>
          </>}
        </section>

        <div id="all-teachers" className="flex scroll-mt-20 flex-wrap items-center gap-2.5">
          <h2 className="flex-1 text-[20px] font-extrabold text-navy">{teachers ? `${visible.length} teacher${visible.length === 1 ? '' : 's'}${subject === 'All' ? '' : ` · ${subject}`}` : 'Teachers'}</h2>
          <button type="button" aria-pressed={mentorOnly} onClick={() => setMentorOnly(v => !v)} className={toggle(mentorOnly)}>Takes bookings</button>
          <button type="button" aria-pressed={videoOnly} onClick={() => setVideoOnly(v => !v)} className={toggle(videoOnly)}>Has a video</button>
          {countries.length > 1 && (
            <select aria-label="Country" value={country} onChange={e => setCountry(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] font-bold text-navy">
              <option value="">Country: All</option>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div className={clsx('grid items-start gap-[18px]', panelOn && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
          {!teachers ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-72 animate-pulse rounded-[14px] border border-line bg-white" />)}</div>
            : !visible.length ? <p className="rounded-[14px] border border-line bg-white p-10 text-center text-[13px] text-ink2">No teachers match.</p> : (
            <div className={clsx('grid gap-4 sm:grid-cols-2', panelOn ? 'xl:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4')}>
              {visible.map(t => {
                const on = panelOn && selected?.id === t.id, tag = tagOf.get(t.id), c = pub.get(t.id)?.country, mine = tag ? progressWith(t) : null, m = mentors.get(t.id);
                return (
                  <Link key={t.id} href={`/student/teachers/${t.id}`} onClick={e => choose(e, t.id)} aria-pressed={on}
                    className={clsx('group flex flex-col gap-2 rounded-[14px] bg-white p-4 text-navy transition',
                      on ? 'border-2 border-navy shadow-[0_0_0_4px_rgba(127,163,255,0.35)]' : tag ? 'border-2 border-azure-strong' : 'border border-line hover:border-azure-strong')}>
                    <TeacherPhoto src={t.avatarUrl} name={t.name} video={!!t.videoIntroUrl} straight={on} />
                    <b className="mt-1 flex items-center gap-1.5 text-[16px] leading-tight"><span className="line-clamp-2">{t.name}</span>{c && <Flag code={c.code} title={c.name} />}</b>
                    <Subjects t={t} className="text-[12.5px] leading-snug text-ink2" />
                    {tag && <span className="w-fit rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-extrabold text-azure-strong">{tag}</span>}
                    <span className="flex flex-wrap gap-1.5">
                      {t.courseCount ? <span className={fact}><b className="text-navy">{t.courseCount}</b> course{t.courseCount === 1 ? '' : 's'}</span> : <span className={fact}>Courses coming</span>}
                      {!!t.yearsExperience && <span className={fact}><b className="text-navy">{t.yearsExperience}</b> yrs</span>}
                      {t.reviewCount > 0 && t.avgRating != null && <span className={fact}><b className="text-navy">{t.avgRating}</b>★ {t.reviewCount}</span>}
                    </span>
                    {mine != null && <span className="flex items-center gap-2 text-[11.5px] text-ink2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#3F6FE8,#8EA8FF)]" style={{ width: `${Math.max(mine, 3)}%` }} /></span>{mine}% of your course{lib.filter(l => t.courseIds?.includes(l.id)).length > 1 ? 's' : ''}</span>}
                    <span className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[12px]">
                      {m?.nextAt ? <span className="inline-flex items-center gap-1 font-bold text-[#17703A]"><Icon name="calendar" size={13} />Free {short(m.nextAt)}</span> : <span className="text-muted">No free times</span>}
                      <span className="font-extrabold text-azure-strong">Profile →</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {panelOn && selected && (
            <aside className="hidden flex-col overflow-hidden rounded-[16px] border border-line bg-white lg:sticky lg:top-6 lg:flex">
              <div className="keep-light relative flex items-center gap-3.5 bg-[linear-gradient(120deg,#2F57C9,#6B8BFF)] p-4 text-[#072061]">
                <span className="flex h-[76px] w-[76px] flex-shrink-0 -rotate-[4deg] items-center justify-center overflow-hidden rounded-[18px] bg-[#FFFDF8] text-[24px] font-extrabold text-[#3F6FE8] shadow-[0_10px_22px_rgba(7,32,97,0.35)]">
                  {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" className="h-full w-full object-cover" /> : firstName(selected.name).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-extrabold uppercase tracking-[0.07em]">{['Teacher', pub.get(selected.id)?.country?.name, selected.yearsExperience ? `${selected.yearsExperience} years` : null].filter(Boolean).join(' · ')}</span>
                  <b className="block text-[20px] leading-tight">{selected.name}.</b>
                  {selSubjects.length > 0 && <span className="block text-[13px] font-extrabold text-[#FFFFFF]">{selSubjects.slice(0, 2).join(' and ')}.</span>}
                </span>
                <button type="button" onClick={() => setClosed(true)} aria-label="Close" className="absolute right-2.5 top-2 text-[14px] text-[#072061] opacity-70 hover:opacity-100">✕</button>
              </div>
              <div className="flex flex-col gap-3 p-4">
                {selected.videoIntroUrl && <VideoThumb url={selected.videoIntroUrl} photo={selected.avatarUrl} href={`/student/teachers/${selected.id}`} label={`Meet ${firstName(selected.name).split(' ')[0]}`} className="h-[150px]" />}
                {selected.bio && <p className="line-clamp-4 text-[13px] leading-normal text-ink2">{selected.bio}</p>}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {([[selected.courseCount, 'courses'], [detail?.studentCount ?? '…', 'students'], [selected.avgRating != null ? `${selected.avgRating}★` : '—', 'rating']] as [string | number, string][]).map(([v, l]) => (
                    <span key={l} className="rounded-[9px] bg-subtle p-2 text-[11px] text-muted"><b className="block text-[17px] text-navy">{v}</b>{l}</span>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                  <p className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-muted">Book a mentor session</p>
                  {detail?.availableSlots?.length ? detail.availableSlots.slice(0, 3).map(s => <Link key={s.id} href="/student/mentorship" className="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-bold text-azure-strong hover:bg-subtle">{when(s.startsAt)}</Link>)
                    : <span className="text-[12.5px] text-muted">{detail ? 'No free times right now.' : '…'}</span>}
                  {allow?.perMonth != null && <span className="text-[11.5px] text-muted">{allow.left} of {allow.perMonth} sessions left this month</span>}
                </div>
                {selMine.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-muted">Your courses with {firstName(selected.name).split(' ')[0]}</p>
                    {selMine.slice(0, 3).map(c => { const l = lib.find(x => x.id === c.id)!; return (
                      <Link key={c.id} href={`/student/learn/${c.id}`} className="flex items-center gap-2.5 text-[12.5px] text-navy">
                        <span className="min-w-0 flex-1"><b className="block truncate">{cardTitle(c.title).title}</b><span className="mt-1 block h-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-azure-strong" style={{ width: `${Math.max(l.pct, 3)}%` }} /></span></span>
                        <span className="font-extrabold text-azure-strong">{l.pct ? 'Continue' : 'Start'}</span>
                      </Link>
                    ); })}
                  </div>
                )}
                {selOther.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-line pt-3">
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-muted">{selMine.length ? 'Their other courses' : 'Courses'} · {selOther.length}</p>
                    {selOther.slice(0, 4).map(c => (
                      <Link key={c.id} href={`/student/courses/${c.id}`} className="flex justify-between gap-2 py-0.5 text-[12.5px] text-ink2 hover:text-navy">
                        <span className="min-w-0 truncate">{cardTitle(c.title).title}</span>
                        <b className={clsx('whitespace-nowrap', c.isSoldIndividually && !c.priceAmount ? 'text-[#17703A]' : 'text-navy')}>{c.isSoldIndividually && c.priceAmount && c.priceCurrency ? walletMoney(c.priceAmount, c.priceCurrency) : c.isSoldIndividually ? 'Free' : 'In a package'}</b>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line pt-3">
                  <Link href={`/student/teachers/${selected.id}`} className="inline-flex h-10 items-center justify-center rounded-lg bg-azure-strong text-[13.5px] font-extrabold text-on-accent">View full profile</Link>
                  <Link href={`/student/messages?to=${selected.id}`} className="inline-flex h-10 items-center rounded-lg border border-line px-3.5 text-[13.5px] font-extrabold text-navy hover:bg-subtle">Message</Link>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
