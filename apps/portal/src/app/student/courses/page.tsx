'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { StudentCoursesHero } from '@/components/hero/LearningHeroes';
import { Icon } from '@/components/ui/Icon';
import { BigCourseCard, CARD_GRID, cardTitle, type CardCourse } from '@/components/public/course/BigCourseCard';

type State = 'going' | 'new' | 'done';
type Access =
  | { kind: 'package'; packageId: string; name: string; expiresAt: string | null }
  | { kind: 'single'; expiresAt: string | null; purchasedAt: string }
  | { kind: 'free' | 'website'; expiresAt: null };
interface Row {
  id: string; title: string; coverUrl?: string | null; source: string; contentImportedAt?: string | null; programme: string | null; teacher: string | null;
  lessons: number; done: number; pct: number; state: State; lastOpened: string | null;
  next: { id: string; title: string; type: string; durationSecs: number | null; module: string } | null;
  access: Access; endsInDays: number | null;
  certificate: { id: string; verifyCode: string; pdfUrl: string } | null;
}
interface Library {
  stats: { courses: number; packages: number; single: number; free: number; lessonsDone?: number; lessonsThisWeek: number; studySecs30d: number; certificates: number; latestCertificate?: string | null };
  resume: { id: string; title: string; pct: number; next: Row['next'] } | null;
  courses: Row[];
}
/** What the public course list knows for a card: cover, teacher photo, level, topics, practice questions */
interface PubCourse { id: string; slug: string; coverUrl: string | null; level?: string | null; topics?: string[]; questions: number; subject: { name: string } | null; teacher: { name: string | null; avatarUrl: string | null } | null }
type Tab = 'all' | State;
type Sort = 'recent' | 'progress' | 'az';

const date = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const studyTime = (secs: number) => { const m = Math.round(secs / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const website = (r: Row) => r.source === 'WORDPRESS' && !r.contentImportedAt && r.lessons === 0;
/** Where Continue goes: the next lesson, or the course's overview */
const learnHref = (r: Row) => r.state !== 'done' && r.next && !website(r) ? `/student/learn/${r.id}/lesson/${r.next.id}` : `/student/learn/${r.id}`;

export default function MyCoursesPage() {
  const [lib, setLib] = useState<Library | null>(null);
  const [pub, setPub] = useState<Map<string, PubCourse>>(new Map());
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    api.get('/portals/student/library').then(r => setLib(r.data))
      .catch(() => setLib({ stats: { courses: 0, packages: 0, single: 0, free: 0, lessonsThisWeek: 0, studySecs30d: 0, certificates: 0 }, resume: null, courses: [] }));
    api.get('/catalogue/course-list').then(r => setPub(new Map(((r.data?.courses ?? []) as PubCourse[]).map(x => [x.id, x])))).catch(() => {});
  }, []);

  const count = (t: Tab) => (lib?.courses ?? []).filter(c => t === 'all' || c.state === t).length;
  const shown = useMemo(() => {
    const list = (lib?.courses ?? []).filter(c => (tab === 'all' || c.state === tab)
      && (!q.trim() || `${c.title} ${c.teacher ?? ''} ${c.programme ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
    if (sort === 'progress') return [...list].sort((a, b) => b.pct - a.pct);
    if (sort === 'az') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [lib, tab, q, sort]);

  // Packages they have: until when, and how many of its courses they've started
  const packages = useMemo(() => {
    const m = new Map<string, { id: string; name: string; until: string | null; total: number; started: number }>();
    for (const c of lib?.courses ?? []) if (c.access.kind === 'package') {
      const a = c.access, cur = m.get(a.packageId) ?? { id: a.packageId, name: a.name, until: a.expiresAt, total: 0, started: 0 };
      cur.total++; if (c.state !== 'new') cur.started++;
      m.set(a.packageId, cur);
    }
    return [...m.values()];
  }, [lib]);

  const toCard = (r: Row): CardCourse => {
    const p = pub.get(r.id);
    return {
      id: r.id, slug: p?.slug ?? r.id, title: r.title, coverUrl: p?.coverUrl ?? r.coverUrl ?? null, exam: r.programme, subject: p?.subject?.name ?? null,
      level: p?.level ?? null, lessons: r.lessons, questions: p?.questions ?? 0, topics: p?.topics ?? [], website: website(r),
      selling: r.access.kind === 'free' || r.access.kind === 'website' ? 'free' : 'paid', price: null,
      teacher: p?.teacher ?? (r.teacher ? { name: r.teacher, avatarUrl: null } : null),
    };
  };

  const s = lib?.stats;
  const latestCert = lib?.courses.find(c => c.id === s?.latestCertificate)?.title;
  const resume = lib?.resume ? lib.courses.find(c => c.id === lib.resume!.id) ?? null : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My courses" subtitle="Everything you have, from packages, purchases and free courses"
        actions={<Link href="/student/catalogue" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Browse catalogue</Link>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!lib ? (
          <>
            <div className="h-44 rounded-[18px] border border-line bg-white animate-pulse" />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{[0, 1, 2, 3].map(i => <div key={i} className="h-80 rounded-2xl border border-line bg-white animate-pulse" />)}</div>
          </>
        ) : !lib.courses.length ? (
          <StudentCoursesHero lib={lib} cover={null} />
        ) : <>
          {/* What's next: the short title, the next lesson, Continue, and that lesson drawn like the player */}
          <section className="keep-light grid items-center gap-6 overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_50%,#6B8BFF_100%)] p-5 text-[#FFFFFF] sm:p-7 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[#DCE6FF]">My courses · {plural(lib.courses.length, 'course')} · {plural(s?.lessonsThisWeek ?? 0, 'lesson')} this week</p>
              <h1 className="mt-2 text-[30px] font-extrabold leading-[1.02] tracking-[-0.03em] text-[#FFFFFF] sm:text-[40px]">{resume ? <>Your next lesson<br />is waiting.</> : <>Pick up a course<br />and start.</>}</h1>
              {resume?.next
                ? <p className="mt-2.5 text-[15px] text-[#EEF3FF]"><b>{cardTitle(resume.title).title}</b> · Next: {resume.next.title}</p>
                : <p className="mt-2.5 text-[15px] text-[#EEF3FF]">Open any course below; your progress shows on its card.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {resume && <Link href={learnHref(resume)} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#FFFFFF] px-4 text-[14.5px] font-extrabold text-[#2F57C9]">Continue{resume.next ? `: ${resume.next.title.replace(/^\d+[.)]\s*/, '')}` : ''}<Icon name="arrowRight" size={15} /></Link>}
                <Link href="/student/catalogue" className="inline-flex h-11 items-center rounded-lg border border-[rgba(255,255,255,0.6)] px-4 text-[14.5px] font-extrabold text-[#FFFFFF]">Browse the catalogue</Link>
              </div>
            </div>
            {resume?.next && (
              <div className="hidden -rotate-2 items-center gap-4 lg:flex">
                <div className="grid h-[150px] min-w-0 flex-1 grid-cols-[96px_minmax(0,1fr)] overflow-hidden rounded-[14px] bg-[#0B1640] shadow-[0_14px_30px_rgba(7,32,97,0.35)]">
                  <div className="flex flex-col gap-1.5 bg-[#0E1C4D] px-2.5 py-3 text-[8.5px] text-[rgba(255,255,255,0.5)]">
                    <span className="font-extrabold tracking-[0.08em] text-[#7FA3FF]">COURSE OVERVIEW</span>
                    <span className="h-1 rounded-full bg-[rgba(255,255,255,0.1)]"><span className="block h-1 rounded-full bg-[#3F6FE8]" style={{ width: `${Math.max(resume.pct, 4)}%` }} /></span>
                    <span className="line-clamp-2 text-[9.5px] font-bold text-[#FFFFFF]">{resume.next.module.replace(/^Module \d+ · /, '')}</span>
                    <span className="truncate rounded bg-[#2F57C9] px-1 py-0.5 text-[#FFFFFF]">{resume.next.title}</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5 p-3">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[rgba(127,163,255,0.4)] px-2 py-0.5 text-[9.5px] font-bold text-[#7FA3FF]"><Icon name={resume.next.type === 'QUIZ' ? 'question' : resume.next.type === 'VIDEO' ? 'play' : 'docLine'} size={10} />{resume.next.type === 'QUIZ' ? 'Quiz' : resume.next.type === 'VIDEO' ? 'Video' : 'Reading'}</span>
                    <b className="line-clamp-3 text-[15px] leading-tight">{resume.next.title}</b>
                  </div>
                </div>
                <span className="flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#FFFFFF ${resume.pct * 3.6}deg, rgba(255,255,255,0.22) 0)` }}>
                  <span className="flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full bg-[#2F57C9] leading-none"><b className="text-[19px]">{resume.pct}%</b><span className="mt-0.5 text-[10px] text-[#DCE6FF]">done</span></span>
                </span>
              </div>
            )}
          </section>

          {s && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { l: 'Courses', v: String(s.courses), sub: [s.packages && plural(s.packages, 'package'), s.single && `${s.single} bought`, s.free && `${s.free} free`].filter(Boolean).join(' · ') || '—' },
                { l: 'Lessons done', v: String(s.lessonsDone ?? lib.courses.reduce((n, c) => n + c.done, 0)), sub: `${s.lessonsThisWeek} this week` },
                { l: 'Study time', v: s.studySecs30d ? studyTime(s.studySecs30d) : '—', sub: 'Last 30 days' },
                { l: 'Certificates', v: String(s.certificates), sub: latestCert ? cardTitle(latestCert).title : 'Finish a course to earn one' },
              ].map(x => (
                <div key={x.l} className="rounded-2xl border border-line bg-white p-4">
                  <dt className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted">{x.l}</dt>
                  <dd className="mt-1 text-[24px] font-extrabold text-navy">{x.v}</dd>
                  <dd className="truncate text-[12.5px] text-muted">{x.sub}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <div role="tablist" aria-label="Filter" className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] border border-line bg-white p-1">
              {([['all', 'All'], ['going', 'In progress'], ['new', 'Not started'], ['done', 'Finished']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('h-8 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors', tab === k ? 'bg-accent-soft font-bold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                  {l} <span className="font-medium text-muted">{count(k)}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <label className="flex h-[38px] min-w-0 flex-[0_1_280px] items-center gap-2 rounded-[10px] border border-line bg-white px-3 focus-within:border-azure">
              <Icon name="search" size={15} className="text-muted" />
              <input type="search" aria-label="Search my courses" value={q} onChange={e => setQ(e.target.value)} placeholder="Search my courses" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-navy outline-none placeholder:text-muted" />
            </label>
            <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className="h-[38px] rounded-[10px] border border-line bg-white pl-3 pr-8 text-[13px] text-navy outline-none">
              <option value="recent">Recently opened</option>
              <option value="progress">Most progress</option>
              <option value="az">A to Z</option>
            </select>
          </div>

          {!shown.length ? <p className="rounded-2xl border border-line bg-white p-8 text-center text-[13px] text-ink2">No courses here.</p> : (
            <div className="@container"><div className={CARD_GRID}>
              {shown.map(c => {
                const warn = c.endsInDays != null && c.endsInDays <= 14 && c.state !== 'done';
                const renew = warn ? (c.access.kind === 'package' ? `/packages/${c.access.packageId}` : c.access.kind === 'single' ? `/student/courses/${c.id}` : null) : null;
                return (
                  <div key={c.id} className="flex min-w-0 flex-col gap-1.5">
                    <BigCourseCard c={toCard(c)} href={`/student/learn/${c.id}`} onlyIn={c.access.kind === 'package' ? c.access.name : null}
                      mine={website(c) ? null : { pct: c.pct, next: c.state === 'done' ? null : c.next?.title ?? null, href: learnHref(c) }} />
                    {/* Their own notes on the course: access ending, the certificate */}
                    {(warn || c.certificate) && (
                      <p className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12.5px]', warn ? 'font-semibold text-navy' : 'text-muted')}>
                        {warn && <span>Access ends in {plural(Math.max(0, c.endsInDays!), 'day')}{renew && <> · <Link href={renew} className="font-bold text-azure-strong hover:underline">Renew</Link></>}</span>}
                        {c.certificate && <a href={c.certificate.pdfUrl || '/student/certificates'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-azure-strong hover:underline"><Icon name="certificates" size={13} />Certificate</a>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div></div>
          )}

          {packages.map(p => (
            <section key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-[13.5px] text-ink2">
              <Icon name="packages" size={17} className="text-azure-strong" />
              <span className="min-w-0 flex-1"><b className="text-navy">{p.name}</b> · {p.until ? `yours until ${date(p.until)}` : 'no time limit'} · {p.started} of {plural(p.total, 'course')} started</span>
              <Link href={`/packages/${p.id}`} className="font-bold text-azure-strong hover:underline">Open the package →</Link>
            </section>
          ))}

          <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-5 py-4">
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2"><strong className="text-navy">Want live classes and a teacher?</strong> Packages add a class with weekly lessons, or a mentor, to the courses you study.</p>
            <Link href="/packages" className="inline-flex h-9 items-center rounded-lg bg-azure-strong px-3.5 text-[13px] font-extrabold text-on-accent">See packages</Link>
          </section>
        </>}
      </div>
    </div>
  );
}
