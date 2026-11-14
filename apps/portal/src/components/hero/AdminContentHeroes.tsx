'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { minorToMajor } from '@cpa/shared';
import { PageHero, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';

const s = (n: number, w: string, ws = `${w}s`) => `${n.toLocaleString()} ${n === 1 ? w : ws}`;
/** USD 49.99, XAF 29,900: keeps cents only where the currency has them */
const price = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const loadingHero = <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />;

/** Loads the numbers for one Admin → Content page; reloadKey refetches after a change on the page */
function useHero<T>(section: string, reloadKey?: unknown) {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => { api.get(`/admin/content-hero/${section}`).then(r => setD(r.data)).catch(() => {}); }, [section, reloadKey]);
  return d;
}

function Explainer({ title, rows }: { title: string; rows: [string, string][] }) {
  return <>
    <p className={asideLabel}>{title}</p>
    {rows.map(([t, d], i) => (
      <div key={t} className="flex items-start gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
        <span className="min-w-0"><span className="block text-[13.5px] font-bold">{t}</span><span className="block text-xs text-muted">{d}</span></span>
      </div>
    ))}
  </>;
}

function Bar({ pct, className }: { pct: number; className?: string }) {
  return <span className={clsx('block h-1.5 rounded-[3px] bg-accent-soft', className)}><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;
}

function Rows({ rows }: { rows: { k: string; l: React.ReactNode; r: React.ReactNode; sub?: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {rows.map(x => (
        <div key={x.k} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0"><span className="block truncate text-[13.5px] font-bold">{x.l}</span>{x.sub && <span className="block text-xs text-muted">{x.sub}</span>}</span>
          <span className="flex-shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink2">{x.r}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Courses ─────────────────────────────────────────────── */

interface CoursesHero { total: number; published: number; drafts: number; inReview: number; placeholders: number; untagged: number; tagged: number; titleMatches: number; free: number; joinedThisMonth: number; topJoined: { title: string; n: number }[] }

/** What needs fixing before students can find courses: placeholder titles and missing exam or subject */
export function AdminCoursesHero({ onNew }: { onNew: () => void }) {
  const d = useHero<CoursesHero>('courses');
  if (!d) return loadingHero;
  const tagged = pctOf(d.tagged, d.total);
  const job = d.placeholders ? { l1: `${s(d.placeholders, 'course has', 'courses have')}`, l2: 'placeholder titles.' }
    : d.untagged ? { l1: `${s(d.untagged, 'course')}`, l2: 'without an exam or subject.' }
    : { l1: `${s(d.published, 'course')} live,`, l2: 'all tagged.' };
  return (
    <PageHero
      kicker={`Courses · ${d.published} published${d.drafts ? ` · ${d.drafts} draft${d.drafts === 1 ? '' : 's'}` : ''}${d.inReview ? ` · ${d.inReview} in review` : ''}`}
      l1={job.l1} l2={job.l2}
      sub={<>
        {d.placeholders ? `Titles like “Cameroon” or “New Course” came in from the website import and tell students nothing. Rename them, then set their exam and subject. ` : ''}
        {d.untagged ? `Students filter the catalogue by exam and subject, so ${d.untagged === d.total ? 'none of the courses show' : `${d.untagged} courses don’t show`} up there yet.` : 'Every course shows up when students filter by exam and subject.'}
      </>}
      chips={[
        { t: `${tagged}% tagged`, strong: true },
        ...(d.titleMatches ? [{ t: `${d.titleMatches} matched from the title` }] : []),
        { t: `${d.free} free to start` },
        { t: `${s(d.joinedThisMonth, 'enrolment')} this month` },
      ]}
      actions={<>
        {d.untagged > 0 && <Link href="/admin/courses/classify" className={heroBtnDark}>Set exam and subject</Link>}
        <button type="button" onClick={onNew} className={d.untagged ? heroBtnLine : heroBtn}>New course</button>
      </>}
      aside={<>
        <p className={asideLabel}>What students can find</p>
        <div className="flex items-end justify-between gap-3">
          <span className="text-[30px] font-extrabold leading-none tracking-[-0.02em]">{tagged}%</span>
          <span className="text-right text-xs text-muted">{d.tagged} of {d.total} courses<br />have an exam and a subject</span>
        </div>
        <Bar pct={tagged} />
        {d.topJoined.length > 0 ? (
          <div className="border-t border-line pt-2.5">
            <p className={asideLabel}>Joined most this month</p>
            <div className="mt-1.5"><Rows rows={d.topJoined.map((t, i) => ({ k: `${i}${t.title}`, l: t.title, r: s(t.n, 'student') }))} /></div>
          </div>
        ) : <p className="border-t border-line pt-2.5 text-xs text-muted">No one has joined a course this month yet.</p>}
      </>}
    />
  );
}

/* ── Question bank ───────────────────────────────────────── */

interface QuestionsHero { total: number; live: number; inReview: number; drafts: number; noExplanation: number; explained: number; aiDrafts: number; aiCheck: number; byCourse: { courseId: string; title: string; n: number; explained: number }[] }

/** How many questions students practise with have no explanation, and which courses hold the most */
export function AdminQuestionsHero({ onNoWhy, onDraftAI, onAiDrafts, aiOn, reloadKey }: { onNoWhy: () => void; onDraftAI: () => void; onAiDrafts: () => void; aiOn: boolean; reloadKey?: unknown }) {
  const d = useHero<QuestionsHero>('questions', reloadKey);
  if (!d) return loadingHero;
  if (!d.total) return (
    <PageHero kicker="Question bank" l1="No questions yet," l2="on any course."
      sub="Teachers write questions for their courses; you can import a spreadsheet too. Live questions feed lesson quizzes, the Test Centre and mock exams."
      aside={<Explainer title="How the bank works" rows={[['Teachers write or import questions', 'Tagged by course, topic and difficulty'], ['A reviewer checks each one', 'Then it goes live for students'], ['Mock exams draw from it', 'Students sit them in the Test Centre']]} />} />
  );
  const why = pctOf(d.explained, d.total);
  return (
    <PageHero
      kicker={`Question bank · ${d.total.toLocaleString()} questions${d.inReview ? ` · ${d.inReview} in review` : ''}`}
      l1={d.noExplanation ? `${s(d.noExplanation, 'question has', 'questions have')}` : `${s(d.total, 'question')},`}
      l2={d.noExplanation ? 'no explanation.' : 'all explained.'}
      sub={d.aiDrafts ? <>AI has already drafted explanations for {s(d.aiDrafts, 'question')}. Check each draft and accept it, so students see why an answer is right when they get it wrong.{d.aiCheck ? <> On {d.aiCheck} of them AI thinks the marked answer may be wrong: check those first.</> : null}</>
        : d.noExplanation ? 'When students get one of these wrong in practice they see only the right answer, not why. AI can draft the explanations; a teacher or reviewer checks each one before students see it.' : 'Students see why an answer is right whenever they get a question wrong.'}
      chips={[
        { t: `${why}% explained`, strong: true },
        ...(d.aiDrafts ? [{ t: `${d.aiDrafts} AI drafts to check` }] : []),
        ...(d.aiCheck ? [{ t: `${d.aiCheck} answers may be wrong` }] : []),
        { t: `${d.live.toLocaleString()} live` },
        ...(d.inReview ? [{ t: `${d.inReview} in review` }] : []),
        ...(d.drafts ? [{ t: `${d.drafts} draft${d.drafts === 1 ? '' : 's'}` }] : []),
      ]}
      actions={d.aiDrafts ? <>
        <button type="button" onClick={onAiDrafts} className={heroBtnDark}>Check the {d.aiDrafts.toLocaleString()} AI drafts</button>
        <button type="button" onClick={onNoWhy} className={heroBtnLine}>All {d.noExplanation.toLocaleString()} without one</button>
      </> : d.noExplanation ? <>
        <button type="button" onClick={onDraftAI} disabled={!aiOn} title={aiOn ? '' : 'Add the AI key to switch this on'} className={clsx(heroBtnDark, 'disabled:opacity-60')}>Draft explanations with AI</button>
        <button type="button" onClick={onNoWhy} className={heroBtnLine}>Show the {d.noExplanation.toLocaleString()}</button>
      </> : undefined}
      aside={<>
        <p className={asideLabel}>Most questions</p>
        <div className="flex flex-col gap-2">
          {d.byCourse.slice(0, 4).map(c => (
            <div key={c.courseId} className="flex flex-col gap-1">
              <div className="flex justify-between gap-3 text-[12.5px]"><span className="truncate font-bold">{c.title}</span><span className="flex-shrink-0 tabular-nums text-ink2">{c.n}</span></div>
              <Bar pct={pctOf(c.explained, c.n)} />
              <span className="text-[11.5px] text-muted">{c.explained ? `${c.explained} explained` : 'None explained yet'}</span>
            </div>
          ))}
        </div>
      </>}
    />
  );
}

/* ── Mock exams ──────────────────────────────────────────── */

interface MocksHero { total: number; live: number; drafts: number; pastPapers: number; attempts: number; attemptsThisMonth: number; avgPct: number | null; questionsAvailable: number; top: { title: string; status: string; attempts: number }[] }

/** Mock exams live for students, how often they're sat, and the average */
export function AdminMocksHero({ onNew }: { onNew: () => void }) {
  const d = useHero<MocksHero>('mocks');
  if (!d) return loadingHero;
  if (!d.live) return (
    <PageHero kicker={`Mock exams${d.drafts ? ` · ${d.drafts} in draft` : ''}`} l1="No mock exams" l2="for students yet."
      sub={`A mock is a timed exam built from live questions in the bank${d.questionsAvailable ? ` (${d.questionsAvailable.toLocaleString()} are live now)` : ''}. Students sit it in the Test Centre and get a mark and a breakdown by topic.`}
      chips={[{ t: `${d.questionsAvailable.toLocaleString()} live questions to use`, strong: true }, ...(d.drafts ? [{ t: `${d.drafts} draft${d.drafts === 1 ? '' : 's'}` }] : [])]}
      actions={<button type="button" onClick={onNew} className={heroBtn}>New mock exam</button>}
      aside={<Explainer title="How a mock exam works" rows={[['Pick a course and the questions', 'By topic, or let it draw at random'], ['Set the time and the pass mark', 'Like the real exam'], ['Publish it', 'Students with the course sit it in the Test Centre']]} />} />
  );
  return (
    <PageHero
      kicker={`Mock exams · ${d.live} live${d.drafts ? ` · ${d.drafts} in draft` : ''}${d.pastPapers ? ` · ${d.pastPapers} past paper${d.pastPapers === 1 ? '' : 's'}` : ''}`}
      l1={`${s(d.attempts, 'attempt')},`} l2={d.avgPct != null ? `${d.avgPct}% on average.` : 'none marked yet.'}
      sub={d.attempts ? `${s(d.attemptsThisMonth, 'attempt')} this month across ${s(d.live, 'live mock')}.` : 'No one has sat a mock yet. Tell students they’re in the Test Centre.'}
      chips={[...(d.avgPct != null ? [{ t: `Average ${d.avgPct}%`, strong: true }] : []), { t: `${d.attemptsThisMonth} this month` }, { t: `${d.questionsAvailable.toLocaleString()} live questions` }]}
      actions={<button type="button" onClick={onNew} className={heroBtnDark}>New mock exam</button>}
      aside={<>
        <p className={asideLabel}>Sat most</p>
        <Rows rows={d.top.map((m, i) => ({ k: `${i}${m.title}`, l: m.title, sub: m.status === 'PUBLISHED' ? 'Live' : 'Draft', r: s(m.attempts, 'attempt') }))} />
      </>}
    />
  );
}

/* ── Packages ────────────────────────────────────────────── */

interface PkgRow { id: string; name: string; priceAmount: number | null; currency: string; courses: number; published: boolean; bestValue: boolean; live: boolean; sold: number; soldThisMonth: number }
interface PackagesHero { total: number; published: number; unpublished: number; bestValueSet: boolean; soldThisMonth: number; list: PkgRow[] }

/** Which packages are on sale, and sales this month */
export function AdminPackagesHero({ onPick, onNew, reloadKey }: { onPick: (id: string) => void; onNew: () => void; reloadKey?: unknown }) {
  const d = useHero<PackagesHero>('packages', reloadKey);
  if (!d) return loadingHero;
  if (!d.total) return (
    <PageHero kicker="Packages" l1="No packages yet," l2="nothing to buy in one go."
      sub="A package bundles courses, and optionally a cohort’s live classes, at one price. Students see it in the catalogue and on each course in it."
      actions={<button type="button" onClick={onNew} className={heroBtn}>New package</button>}
      aside={<Explainer title="How a package works" rows={[['Choose the courses', 'And a cohort for live classes if you like'], ['Set one price', 'Usually less than the courses on their own'], ['Publish it', 'Students buy it from the catalogue']]} />} />
  );
  const firstOff = d.list.find(p => !p.published);
  const l = !d.published
    ? { l1: d.total === 1 ? 'The package' : d.total === 2 ? 'Neither package' : `None of the ${d.total} packages`, l2: 'is on sale yet.' }
    : { l1: `${s(d.published, 'package')} on sale,`, l2: `${s(d.soldThisMonth, 'sale')} this month.` };
  return (
    <PageHero
      kicker={`Packages · ${d.published} published · ${d.unpublished} unpublished`}
      l1={l.l1} l2={l.l2}
      sub={!d.published ? 'Students can’t buy a package until it’s published. Check the courses and the price, then publish it.' : d.unpublished ? `${s(d.unpublished, 'package is', 'packages are')} still unpublished.` : 'All packages are on sale.'}
      chips={[
        { t: `${d.soldThisMonth} sold this month`, strong: true },
        ...(d.published && !d.bestValueSet ? [{ t: 'No “best value” set' }] : []),
      ]}
      actions={<>
        {firstOff && <button type="button" onClick={() => onPick(firstOff.id)} className={heroBtnDark}>Open {firstOff.name}</button>}
        <button type="button" onClick={onNew} className={firstOff ? heroBtnLine : heroBtn}>New package</button>
      </>}
      aside={<>
        <p className={asideLabel}>Your packages</p>
        <div className="flex flex-col divide-y divide-line">
          {d.list.map(p => (
            <button key={p.id} type="button" onClick={() => onPick(p.id)} className="flex items-start justify-between gap-3 py-2 text-left first:pt-0 last:pb-0 hover:opacity-80">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold">{p.name}</span>
                <span className="block text-xs text-muted">{s(p.courses, 'course')}{p.live ? ' · live classes' : ''} · {p.sold ? `${p.sold} sold` : 'not sold yet'}</span>
              </span>
              <span className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-[13px] font-bold tabular-nums">{p.priceAmount != null ? price(p.priceAmount, p.currency) : 'No price'}</span>
                <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-bold', p.published ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-[#FFF1D6] text-[#8A5A00]')}>{p.published ? 'On sale' : 'Unpublished'}</span>
              </span>
            </button>
          ))}
        </div>
      </>}
    />
  );
}

/* ── Coupons ─────────────────────────────────────────────── */

interface CouponsHero { total: number; active: number; endingSoon: number; used: number; top: { code: string; used: number; max: number | null; off: string }[] }

/** Codes running now, how often they've been used, and which end this week */
export function AdminCouponsHero({ onNew, reloadKey }: { onNew: () => void; reloadKey?: unknown }) {
  const d = useHero<CouponsHero>('coupons', reloadKey);
  if (!d) return loadingHero;
  if (!d.active) return (
    <PageHero kicker={`Coupons${d.total ? ` · ${d.total} ended` : ''}`} l1="No coupons" l2="running."
      sub="A coupon takes a share or an amount off a package. Share the code with a school, a cohort or in a campaign, and set a limit and an end date."
      actions={<button type="button" onClick={onNew} className={heroBtn}>New coupon</button>}
      aside={<Explainer title="Ideas to start with" rows={[['A school or teacher code', 'e.g. 20% off for one class, 40 uses'], ['A launch week offer', 'Ends on a date, so students act now'], ['A thank-you for referrals', 'One code per student who brings a friend']]} />} />
  );
  return (
    <PageHero
      kicker={`Coupons · ${d.active} running${d.total > d.active ? ` · ${d.total - d.active} ended` : ''}`}
      l1={`${s(d.active, 'code')} running,`} l2={`used ${s(d.used, 'time')}.`}
      sub={d.endingSoon ? `${s(d.endingSoon, 'code ends', 'codes end')} in the next 7 days.` : 'None ends in the next 7 days.'}
      chips={[{ t: `${d.used} redemptions`, strong: true }, ...(d.endingSoon ? [{ t: `${d.endingSoon} ending this week` }] : [])]}
      actions={<button type="button" onClick={onNew} className={heroBtnDark}>New coupon</button>}
      aside={<>
        <p className={asideLabel}>Used most</p>
        <Rows rows={d.top.map(c => ({ k: c.code, l: <span className="font-mono">{c.code}</span>, sub: c.off, r: c.max ? `${c.used} of ${c.max}` : `${c.used} used` }))} />
      </>}
    />
  );
}

/* ── Live classes ────────────────────────────────────────── */

interface LiveHero { liveNow: number; thisWeek: number; cohorts: number; next: { title: string; at: string; cohort: string }[]; held60: number; missingRecordings: number }

/** What's live now, what's on this week, and classes without a recording */
export function AdminLiveHero() {
  const d = useHero<LiveHero>('live');
  if (!d) return loadingHero;
  const when = (x: string) => new Date(x).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (!d.thisWeek && !d.liveNow) return (
    <PageHero kicker={`Live classes${d.held60 ? ` · ${d.held60} in the last 60 days` : ''}`} l1="No live classes" l2="this week."
      sub={`Teachers schedule live classes for their cohorts; students join from their timetable and can watch the recording after. ${d.cohorts ? `There ${d.cohorts === 1 ? 'is 1 cohort' : `are ${d.cohorts} cohorts`} to schedule for.` : 'Start by creating a cohort.'}`}
      chips={[{ t: `${s(d.cohorts, 'cohort')}`, strong: true }, ...(d.missingRecordings ? [{ t: `${d.missingRecordings} without a recording` }] : [])]}
      actions={<Link href="/admin/cohorts" className={heroBtn}>Open cohorts</Link>}
      aside={<Explainer title="How live classes work" rows={[['Create a cohort', 'A group of students and its teacher'], ['The teacher schedules classes', 'Students see them on their timetable'], ['Recordings follow', 'For anyone who missed the class']]} />} />
  );
  return (
    <PageHero
      kicker={`Live classes${d.liveNow ? ` · ${d.liveNow} live now` : ''}`}
      l1={`${s(d.thisWeek, 'class', 'classes')}`} l2="this week."
      sub={d.missingRecordings ? `${s(d.missingRecordings, 'class', 'classes')} from the last 60 days ${d.missingRecordings === 1 ? 'has' : 'have'} no recording, so students who missed ${d.missingRecordings === 1 ? 'it' : 'them'} can’t catch up.` : 'Every recent class has a recording.'}
      chips={[...(d.liveNow ? [{ t: `${d.liveNow} live now`, strong: true }] : []), { t: s(d.cohorts, 'cohort') }, { t: `${d.held60} held in 60 days` }]}
      actions={<Link href="/admin/cohorts" className={heroBtnLine}>Cohorts</Link>}
      aside={<>
        <p className={asideLabel}>Coming up</p>
        {d.next.length ? <Rows rows={d.next.map((c, i) => ({ k: `${i}${c.title}`, l: c.title, sub: c.cohort, r: when(c.at) }))} /> : <p className="text-xs text-muted">Nothing else scheduled this week.</p>}
      </>}
    />
  );
}

/* ── Commissions ─────────────────────────────────────────── */

interface CommissionsHero { courses: number; noReviewer: number; waiting: number; teacherPending: number; approved: number; teacherShare: number | null; reviewerShare: number | null }

/** Courses without a reviewer, and how a sale is split today. Same numbers as the table below it */
export function AdminCommissionsHero({ onNoReviewer, onDefaults, reloadKey }: { onNoReviewer: () => void; onDefaults: () => void; reloadKey?: unknown }) {
  const d = useHero<CommissionsHero>('commissions', reloadKey);
  if (!d) return loadingHero;
  const teacher = d.teacherShare, reviewer = d.reviewerShare ?? 0;
  const rest = teacher != null ? Math.max(0, 100 - teacher - reviewer) : null;
  const all = d.noReviewer === d.courses;
  return (
    <PageHero
      kicker={`Commissions · ${s(d.courses, 'course')}${d.waiting ? ` · ${d.waiting} waiting for review` : ''}${d.teacherPending ? ` · ${d.teacherPending} without a teacher` : ''}`}
      l1={d.noReviewer ? (all ? (d.courses === 1 ? 'The course has' : `None of the ${d.courses} courses has`) : s(d.noReviewer, 'course has', 'courses have')) : 'Every course has'}
      l2={d.noReviewer ? (all ? 'a reviewer yet.' : 'no reviewer.') : 'a reviewer.'}
      sub={d.noReviewer ? 'A course can’t be approved for students until a subject reviewer is assigned. Pick the courses, choose a reviewer and set their share in one go.' : `${d.approved} approved, ${d.waiting} waiting for review.`}
      chips={[
        ...(teacher != null ? [{ t: `Teacher ${teacher}%`, strong: true }] : [{ t: 'No default teacher share', strong: true }]),
        { t: d.reviewerShare != null ? `Reviewer ${reviewer}%` : 'No reviewer share set' },
        ...(d.approved ? [{ t: `${d.approved} approved` }] : []),
      ]}
      actions={<>
        {d.noReviewer > 0 && <button type="button" onClick={onNoReviewer} className={heroBtnDark}>Assign reviewers</button>}
        <button type="button" onClick={onDefaults} className={d.noReviewer ? heroBtnLine : heroBtn}>Default shares</button>
      </>}
      aside={<>
        <p className={asideLabel}>How a sale splits today</p>
        {teacher != null && rest != null ? <>
          <div className="flex h-3 w-full overflow-hidden rounded-[3px]">
            <div className="h-full shrink-0 bg-[#3F6FE8]" style={{ width: `${teacher}%` }} />
            {reviewer > 0 && <div className="h-full shrink-0 border-l-2 border-white bg-[#8FB0FF]" style={{ width: `${reviewer}%` }} />}
            <div className="h-full min-w-0 flex-1 border-l-2 border-white bg-[#DCE5FB]" />
          </div>
          <Rows rows={[
            { k: 't', l: <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#3F6FE8]" />Teacher</span>, r: `${teacher}%`, sub: 'the default share' },
            { k: 'r', l: <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#8FB0FF]" />Reviewer</span>, r: d.reviewerShare != null ? `${reviewer}%` : '—', sub: d.reviewerShare != null ? 'the usual share' : 'set when you assign one' },
            { k: 'c', l: <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#DCE5FB]" />Reps & CareerPath</span>, r: `${rest}%`, sub: 'course and country reps come out of this' },
          ]} />
        </> : <p className="text-xs text-muted">Set a default teacher share in Default shares.</p>}
      </>}
    />
  );
}
