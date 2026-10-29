'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

type State = 'going' | 'new' | 'done';
type Access =
  | { kind: 'package'; packageId: string; name: string; expiresAt: string | null }
  | { kind: 'single'; expiresAt: string | null; purchasedAt: string }
  | { kind: 'free' | 'website'; expiresAt: null };
interface Row {
  id: string; title: string; source: string; programme: string | null; teacher: string | null;
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
type Tab = 'all' | State;
type Sort = 'recent' | 'progress' | 'az';

const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const date = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const studyTime = (secs: number) => { const m = Math.round(secs / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function viaText(r: Row) {
  const a = r.access;
  const where = a.kind === 'package' ? `From ${a.name}` : a.kind === 'single' ? 'Bought on its own' : a.kind === 'website' ? 'From the website' : 'Free course';
  const when = r.state === 'done' && r.certificate ? 'completed'
    : !a.expiresAt ? 'no time limit'
    : r.endsInDays != null && r.endsInDays <= 14 ? `access ends in ${plural(Math.max(0, r.endsInDays), 'day')}`
    : `access until ${date(a.expiresAt)}`;
  return `${where} · ${when}`;
}

export default function MyCoursesPage() {
  const [lib, setLib] = useState<Library | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    api.get('/portals/student/library').then(r => setLib(r.data))
      .catch(() => setLib({ stats: { courses: 0, packages: 0, single: 0, free: 0, lessonsThisWeek: 0, studySecs30d: 0, certificates: 0 }, resume: null, courses: [] }));
  }, []);

  const count = (t: Tab) => (lib?.courses ?? []).filter(c => t === 'all' || c.state === t).length;
  const shown = useMemo(() => {
    const list = (lib?.courses ?? []).filter(c => (tab === 'all' || c.state === tab)
      && (!q.trim() || `${c.title} ${c.teacher ?? ''} ${c.programme ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
    if (sort === 'progress') return [...list].sort((a, b) => b.pct - a.pct);
    if (sort === 'az') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [lib, tab, q, sort]);

  const s = lib?.stats;
  const latestCert = lib?.courses.find(c => c.id === s?.latestCertificate)?.title;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My courses" subtitle="Everything you have access to, from packages and single courses"
        actions={<Link href="/student/catalogue" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Browse catalogue</Link>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!lib ? (
          <>
            <div className="h-36 rounded-lg border border-line bg-white animate-pulse" />
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">{[0, 1, 2].map(i => <div key={i} className="h-56 rounded-lg border border-line bg-white animate-pulse" />)}</div>
          </>
        ) : !lib.courses.length ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">You don’t have any courses yet</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink2">Buy a single course, get a package, or start one of the free courses in the catalogue.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/student/catalogue" className="inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Browse catalogue</Link>
              <Link href="/packages" className="inline-flex h-9 items-center rounded-md border border-line px-4 text-[13.5px] font-semibold text-navy hover:bg-subtle">See packages</Link>
            </div>
          </div>
        ) : <>
          {lib.resume && (
            <section className="flex flex-wrap items-center gap-5 rounded-lg border border-azure bg-white p-5">
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-lg font-extrabold text-azure-strong">{abbr(lib.resume.title)}</span>
              <div className="min-w-0 flex-[999_1_320px]">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Pick up where you left off</p>
                <p className="mt-1 text-[19px] font-extrabold text-navy">{lib.resume.title}</p>
                {lib.resume.next && (
                  <p className="mt-0.5 text-[13.5px] text-ink2">
                    Next: {lib.resume.next.module} · {lib.resume.next.title}{lib.resume.next.durationSecs ? ` · ${Math.max(1, Math.round(lib.resume.next.durationSecs / 60))} min` : ''}
                  </p>
                )}
                <div className="mt-2.5 flex max-w-[420px] items-center gap-2.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${lib.resume.pct}%` }} /></span>
                  <strong className="text-[13px] text-navy">{lib.resume.pct}%</strong>
                </div>
              </div>
              <Link href={lib.resume.next ? `/student/learn/${lib.resume.id}/lesson/${lib.resume.next.id}` : `/student/learn/${lib.resume.id}`}
                className="inline-flex h-10 items-center rounded-md bg-azure-strong px-5 text-sm font-semibold text-on-accent">Continue lesson</Link>
            </section>
          )}

          {s && (
            <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              {[
                { l: 'Courses', v: String(s.courses), sub: [s.packages && plural(s.packages, 'package'), s.single && `${s.single} single`, s.free && `${s.free} free`].filter(Boolean).join(' · ') || '—' },
                { l: 'Lessons done', v: String(s.lessonsDone ?? lib.courses.reduce((n, c) => n + c.done, 0)), sub: `${s.lessonsThisWeek} this week` },
                { l: 'Study time', v: s.studySecs30d ? studyTime(s.studySecs30d) : '—', sub: 'Last 30 days' },
                { l: 'Certificates', v: String(s.certificates), sub: latestCert ?? 'Finish a course to earn one' },
              ].map(x => (
                <div key={x.l} className="rounded-lg border border-line bg-white p-4">
                  <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
                  <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
                  <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <div role="tablist" aria-label="Filter" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1">
              {([['all', 'All'], ['going', 'In progress'], ['new', 'Not started'], ['done', 'Completed']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('h-8 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors', tab === k ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                  {l} <span className="font-medium text-muted">{count(k)}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <label className="flex h-[38px] min-w-0 flex-[0_1_280px] items-center gap-2 rounded-md border border-line bg-white px-3 focus-within:border-azure">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden className="text-muted"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
              <input type="search" aria-label="Search my courses" value={q} onChange={e => setQ(e.target.value)} placeholder="Search my courses" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-navy outline-none placeholder:text-muted" />
            </label>
            <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className="h-[38px] rounded-md border border-line bg-white pl-3 pr-8 text-[13px] text-navy outline-none">
              <option value="recent">Sort: Recently opened</option>
              <option value="progress">Most progress</option>
              <option value="az">A to Z</option>
            </select>
          </div>

          {!shown.length ? <p className="rounded-lg border border-line bg-white p-8 text-center text-[13px] text-ink2">No courses here.</p> : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {shown.map(c => {
                const warn = c.endsInDays != null && c.endsInDays <= 14 && c.state !== 'done';
                const href = c.state !== 'done' && c.next && c.source !== 'WORDPRESS' ? `/student/learn/${c.id}/lesson/${c.next.id}` : `/student/learn/${c.id}`;
                const renew = warn ? (c.access.kind === 'package' ? `/packages/${c.access.packageId}` : c.access.kind === 'single' ? `/student/courses/${c.id}` : null) : null;
                return (
                  <article key={c.id} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-extrabold text-azure-strong">{abbr(c.title)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-navy">{c.title}</p>
                        <p className="mt-0.5 truncate text-[12.5px] text-muted">{[c.teacher, c.programme].filter(Boolean).join(' · ') || 'CareerPath Africa'}</p>
                      </div>
                      <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', c.state === 'new' ? 'border border-line bg-subtle text-ink2' : 'bg-accent-soft text-navy')}>
                        {c.state === 'done' ? 'Completed' : c.state === 'going' ? 'In progress' : 'Not started'}
                      </span>
                    </div>
                    {c.lessons > 0 ? (
                      <div>
                        <div className="flex justify-between text-[12.5px]"><span className="text-ink2">{c.done ? `${c.done} of ${plural(c.lessons, 'lesson')}` : plural(c.lessons, 'lesson')}</span><strong className="text-navy">{c.pct}%</strong></div>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${c.pct}%` }} /></span>
                      </div>
                    ) : <p className="text-[12.5px] text-ink2">Opens on the CareerPath Africa website</p>}
                    <p className={clsx('text-[12.5px]', warn ? 'font-semibold text-navy' : 'text-muted')}>{viaText(c)}</p>
                    <div className="mt-auto flex gap-2 border-t border-line pt-3">
                      <Link href={href} className={clsx('inline-flex h-[34px] flex-1 items-center justify-center rounded-md border text-[13px] font-semibold',
                        c.state === 'done' ? 'border-line bg-white text-navy hover:bg-subtle' : 'border-azure-strong bg-azure-strong text-on-accent')}>
                        {c.state === 'done' ? 'Review' : c.state === 'new' ? 'Start course' : 'Continue'}
                      </Link>
                      {c.certificate && (
                        <a href={c.certificate.pdfUrl || '/student/certificates'} target="_blank" rel="noopener noreferrer"
                          className="inline-flex h-[34px] items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Certificate</a>
                      )}
                      {renew && <Link href={renew} className="inline-flex h-[34px] items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Renew</Link>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3.5">
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2"><strong className="text-navy">Want live classes and a teacher?</strong> Packages add a cohort with weekly classes to the courses you study.</p>
            <Link href="/packages" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">See packages</Link>
          </section>
        </>}
      </div>
    </div>
  );
}
