'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { walletMoney } from '@/components/wallet/WalletCharts';
import { PageHero, HeroPhoto, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';

const DAY = 86_400_000;
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const count = (n: number) => words[n] ?? String(n);
const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const short = (t: string, n = 34) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayDiff = (d: string) => Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
/** "today", "tomorrow", "on Friday", "on Fri 21 Nov" */
const onDay = (d: string) => {
  const n = dayDiff(d);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 1 && n < 7 ? `on ${new Date(d).toLocaleDateString('en-GB', { weekday: 'long' })}` : `on ${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const dayName = (d: string) => { const n = dayDiff(d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? new Date(d).toLocaleDateString('en-GB', { weekday: 'long' }) : new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
const loadingHero = <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />;

function useWork<T>(section: string, reloadKey?: unknown) {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => { api.get(`/portals/teacher/work/${section}`).then(r => setD(r.data)).catch(() => {}); }, [section, reloadKey]);
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

/* ── My courses ───────────────────────────────────────────── */

interface CourseRow { id: string; title: string; status: string; students: number; avgPct: number | null; salesThisMonth: number; earnedThisMonth: number }
interface CoursesWork {
  stats: { courses: number; published: number; inReview: number; drafts: number; students: number; newThisWeek: number; finished: number; salesThisMonth: number; earnedThisMonth: number; currency: string | null; avgPct: number | null; rating: number | null; ratings: number };
  courses: CourseRow[];
}
const STATE: Record<string, string> = { PUBLISHED: 'Live', PENDING_REVIEW: 'In review', DRAFT: 'Draft' };

/** How many students learn from the teacher's courses, sales and earnings this month, and each course */
export function TeacherCoursesHero({ onNew }: { onNew: () => void }) {
  const d = useWork<CoursesWork>('courses');
  if (!d) return loadingHero;
  const st = d.stats;
  if (!d.courses.length) return (
    <PageHero kicker="My courses" l1="Your first course" l2="starts here."
      sub="Start from the template: it sets up modules, lessons and quizzes for you to fill in. A reviewer checks it, then it goes live for students."
      actions={<button type="button" onClick={onNew} className={heroBtn}>New course</button>}
      aside={<Explainer title="How a course goes live" rows={[['Build it from the template', 'Modules, lessons, videos and quizzes'], ['Submit it for review', 'A subject reviewer checks it, an admin publishes it'], ['Students join and learn', 'You see their progress and earn from each sale']]} />} />
  );
  const earned = st.earnedThisMonth && st.currency ? walletMoney(st.earnedThisMonth, st.currency) : null;
  return (
    <PageHero
      kicker={`My courses · ${s(st.published, 'live course')}${st.inReview ? ` · ${st.inReview} in review` : ''}${st.drafts ? ` · ${s(st.drafts, 'draft')}` : ''}`}
      l1={st.students ? `${st.students.toLocaleString()} student${st.students === 1 ? '' : 's'}` : 'No students'} l2={st.students ? 'learn from your courses.' : 'yet. They’re coming.'}
      sub={st.students
        ? <>{st.newThisWeek ? `${s(st.newThisWeek, 'student')} joined this week. ` : ''}{st.salesThisMonth ? `${s(st.salesThisMonth, 'sale')} this month. ` : ''}{st.avgPct != null ? `On average they’re ${st.avgPct}% through${st.finished ? `, and ${st.finished} finished` : ''}.` : ''}</>
        : st.published ? 'Your course is live. Students who buy it or a package with it show up here, with how far they’ve got.' : 'When a reviewer approves your course and it goes live, the students who join it show up here.'}
      chips={[
        ...(earned ? [{ t: `${earned} earned this month`, strong: true }] : []),
        ...(st.finished ? [{ t: `${st.finished} finished` }] : []),
        ...(st.rating != null ? [{ t: `★ ${st.rating} from ${s(st.ratings, 'review')}` }] : []),
      ]}
      actions={<>
        <button type="button" onClick={onNew} className={heroBtnDark}>New course</button>
        <Link href="/teacher/wallet" className={heroBtnLine}>Earnings</Link>
      </>}
      aside={<>
        <p className={asideLabel}>Your courses</p>
        {d.courses.slice(0, 4).map(c => (
          <Link key={c.id} href={`/teacher/courses/${c.id}/builder`} className="block">
            <p className="flex items-center justify-between gap-2 text-[13px] font-bold">
              <span className="truncate">{c.title.split(' · ')[0]}</span>
              <span className={clsx('inline-flex h-5 flex-shrink-0 items-center rounded px-1.5 text-[11px] font-bold', c.status === 'PUBLISHED' ? 'bg-accent-soft text-[#2F57C9]' : 'bg-subtle text-ink2')}>{STATE[c.status] ?? c.status}</span>
            </p>
            {c.status === 'PUBLISHED' && c.avgPct != null && <Bar pct={c.avgPct} className="mt-1" />}
            <span className="text-[11.5px] text-muted">
              {[s(c.students, 'student'), c.avgPct != null && c.students ? `${c.avgPct}% through` : null, c.salesThisMonth ? `${s(c.salesThisMonth, 'sale')} this month` : null, c.earnedThisMonth && st.currency ? walletMoney(c.earnedThisMonth, st.currency) : null].filter(Boolean).join(' · ')}
            </span>
          </Link>
        ))}
        {d.courses.length > 4 && <p className="border-t border-line pt-2.5 text-xs text-muted">And {s(d.courses.length - 4, 'more course')} below</p>}
      </>}
    />
  );
}

/* ── Assignments ──────────────────────────────────────────── */

interface AssignmentRow { id: string; title: string; dueDate: string; cohort: { id: string; name: string }; students: number; submitted: number; graded: number; late: number }

/** The next assignment due and who has handed it in, with a reminder for the rest; what's coming up */
export function TeacherAssignmentsHero({ d, onNew, onGrade }: {
  d: { cohorts: { id: string }[]; stats: { toGrade: number; oldestWaitDays: number | null; onTimePct: number | null; avgGradePct: number | null }; assignments: AssignmentRow[] };
  onNew: () => void; onGrade: () => void;
}) {
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const now = Date.now();
  const open = d.assignments.filter(a => new Date(a.dueDate).getTime() >= now - DAY / 2).sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
  // The soonest one still waiting for work, so the reminder is there when it's useful
  const next = open.find(a => a.submitted < a.students) ?? open[0] ?? null;
  const st = d.stats;

  async function remind(a: AssignmentRow) {
    setReminding(true);
    try {
      const r = await api.post(`/education/assignments/${a.id}/remind`);
      setReminded(m => ({ ...m, [a.id]: true }));
      notify.success(r.data.reminded ? `Reminder sent to ${s(r.data.reminded, 'student')}` : 'Everyone has handed it in');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not send the reminder');
    } finally { setReminding(false); }
  }

  if (!d.assignments.length) return (
    <PageHero kicker={`Assignments · ${s(d.cohorts.length, 'cohort')}`} l1="Set work," l2="see who hands it in."
      sub={d.cohorts.length ? 'Set an assignment for a cohort. Students hand in their work here, and you grade it with a rubric or a mark.' : 'Assignments are set for a cohort. When an admin gives you a class, you can set work for it here.'}
      actions={d.cohorts.length ? <button type="button" onClick={onNew} className={heroBtn}>New assignment</button> : undefined}
      aside={<Explainer title="How assignments work" rows={[['Set the work and a due date', 'For one of your cohorts'], ['Students hand it in here', 'A file, a photo or a note'], ['Grade it with a rubric', 'They see the mark and your feedback']]} />} />
  );

  const missing = next ? Math.max(0, next.students - next.submitted) : 0;
  const late = next && new Date(next.dueDate).getTime() < now;
  return (
    <PageHero
      kicker={`Assignments${st.toGrade ? ` · ${st.toGrade} to grade` : ''} · ${s(d.cohorts.length, 'cohort')}`}
      l1={next ? `${short(next.title, 40)}` : 'Nothing due'} l2={next ? (late ? 'was due today.' : `is due ${onDay(next.dueDate)}.`) : 'right now.'}
      sub={next
        ? <>{!next.submitted ? `No one in ${next.cohort.name} has handed it in yet.` : missing ? `${next.submitted} of ${next.students} in ${next.cohort.name} handed in so far; ${s(missing, 'student is', 'students are')} still to hand in.` : `Everyone in ${next.cohort.name} has handed it in.`}{st.toGrade ? ` ${s(st.toGrade, 'piece')} of work ${st.toGrade === 1 ? 'is' : 'are'} waiting for your grade.` : ''}</>
        : <>Every assignment is closed.{st.toGrade ? ` ${s(st.toGrade, 'piece')} of work ${st.toGrade === 1 ? 'is' : 'are'} waiting for your grade.` : ' Set the next one when you’re ready.'}</>}
      chips={[
        ...(next ? [{ t: `${next.submitted} of ${next.students} handed in`, strong: true }] : []),
        ...(st.onTimePct != null ? [{ t: `${st.onTimePct}% on time` }] : []),
        ...(st.avgGradePct != null ? [{ t: `Average grade ${st.avgGradePct}%` }] : []),
      ]}
      actions={<>
        {next && missing > 0 && <button type="button" disabled={reminding || reminded[next.id]} onClick={() => remind(next)} className={clsx(heroBtnDark, 'disabled:opacity-70')}>{reminded[next.id] ? 'Reminder sent' : `Remind the ${missing}`}</button>}
        {st.toGrade > 0 && <button type="button" onClick={onGrade} className={next && missing ? heroBtnLine : heroBtnDark}>Grade {st.toGrade}</button>}
        <button type="button" onClick={onNew} className={heroBtnLine}>New assignment</button>
      </>}
      aside={<>
        <p className={asideLabel}>{open.length ? 'Coming up' : 'Most recent'}</p>
        {(open.length ? open : d.assignments).slice(0, 4).map(a => (
          <div key={a.id}>
            <p className="flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{a.title}</span><span className="whitespace-nowrap text-ink2">{a.submitted}/{a.students}</span></p>
            <Bar pct={a.students ? (a.submitted / a.students) * 100 : 0} className="mt-1" />
            <span className="text-[11.5px] text-muted">{a.cohort.name} · due {new Date(a.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
        ))}
        {st.toGrade > 0 && <p className="border-t border-line pt-2.5 text-xs text-muted">{s(st.toGrade, 'piece')} to grade{st.oldestWaitDays ? `, the oldest waiting ${s(st.oldestWaitDays, 'day')}` : ''}</p>}
      </>}
    />
  );
}

/* ── Mentorship ───────────────────────────────────────────── */

interface MentorWork {
  next: { id: string; notes: string | null; startsAt: string; durationMins: number; student: { id: string; name: string; avatarUrl: string | null } } | null;
  stats: { freeThisWeek: number; bookedThisWeek: number; heldThisMonth: number; earnedThisMonth: number; currency: string | null; rating: number | null; ratings: number };
  weekStart: string; week: { id: string; startsAt: string; durationMins: number; state: 'booked' | 'free' | 'held' | 'past'; student: string | null }[];
}
const SLOT: Record<string, string> = { booked: 'bg-[#3F6FE8] text-[#FFFFFF]', free: 'bg-accent-soft text-[#2F57C9] ring-1 ring-inset ring-[#3F6FE8]/50', held: 'bg-[#072061] text-[#FFFFFF]', past: 'bg-subtle text-muted line-through' };

/** The next session and what the student wrote, free times, held and earned, and this week at a glance */
export function TeacherMentorshipHero({ reloadKey, onAdd, onCancel }: { reloadKey: unknown; onAdd: () => void; onCancel: (bookingId: string) => void }) {
  const d = useWork<MentorWork>('mentorship', reloadKey);
  if (!d) return loadingHero;
  const n = d.next, st = d.stats;
  const open = n && new Date(n.startsAt).getTime() - Date.now() < 10 * 60_000;
  const earned = st.earnedThisMonth && st.currency ? walletMoney(st.earnedThisMonth, st.currency) : null;
  const first = n?.student.name.split(' ')[0] ?? '';
  const days = Array.from({ length: 7 }, (_, i) => new Date(new Date(d.weekStart).getTime() + i * DAY));
  const any = d.week.length > 0;
  return (
    <PageHero
      photo={n ? <HeroPhoto src={n.student.avatarUrl} initials={n.student.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()} caption={first} /> : undefined}
      kicker={`Mentorship${n ? ` · next session ${onDay(n.startsAt)}` : ''}${st.heldThisMonth ? ` · ${st.heldThisMonth} held this month` : ''}`}
      l1={n ? `${short(n.student.name, 26)},` : 'No sessions'} l2={n ? `${dayName(n.startsAt)} at ${time(n.startsAt)}.` : 'booked yet.'}
      sub={n ? (n.notes ? <>{first} wrote: “{short(n.notes, 140)}”</> : `${n.durationMins} minutes. ${first} didn’t leave a note.`)
        : st.freeThisWeek ? `You have ${s(st.freeThisWeek, 'free time')} in the next 7 days. Students from your cohorts can book them.` : 'Add a few free times. Students from your cohorts book them, and you’re paid for every session held.'}
      chips={[
        ...(earned ? [{ t: `${earned} earned this month`, strong: true }] : []),
        { t: `${s(st.freeThisWeek, 'free time')} this week` },
        ...(st.rating != null ? [{ t: `★ ${st.rating} from ${s(st.ratings, 'review')}` }] : []),
      ]}
      actions={<>
        {n && (open ? <Link href={`/teacher/mentorship/session/${n.id}`} className={heroBtnDark}>Join session</Link>
          : <span className="inline-flex h-10 items-center rounded-md bg-[rgba(255,255,255,0.25)] px-3.5 text-sm font-semibold text-navy">Opens 10 min before</span>)}
        <button type="button" onClick={onAdd} className={n ? heroBtnLine : heroBtn}>Add times</button>
        {n && <button type="button" onClick={() => onCancel(n.id)} className={heroBtnLine}>Cancel</button>}
      </>}
      aside={any ? <>
        <p className={asideLabel}>This week</p>
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const list = d.week.filter(w => new Date(w.startsAt).toDateString() === day.toDateString());
            const today = day.toDateString() === new Date().toDateString();
            return (
              <div key={day.toISOString()} className="flex min-w-0 flex-col items-stretch gap-1">
                <span className={clsx('text-center text-[11px] font-bold', today ? 'text-[#2F57C9]' : 'text-muted')}>{day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</span>
                {list.slice(0, 4).map(w => <span key={w.id} title={`${time(w.startsAt)} · ${w.student ?? w.state}`} className={clsx('rounded px-0.5 py-0.5 text-center text-[10px] font-bold tabular-nums', SLOT[w.state])}>{time(w.startsAt)}</span>)}
                {list.length > 4 && <span className="text-center text-[10px] text-muted">+{list.length - 4}</span>}
                {!list.length && <span className="h-[19px] rounded border border-dashed border-line" />}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[11.5px] text-ink2">
          {[['booked', 'Booked'], ['free', 'Free'], ['held', 'Held']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-sm', SLOT[k])} />{l}</span>)}
        </div>
      </> : <Explainer title="How mentorship works" rows={[['Add your free times', '30 or 60 minutes, any day'], ['Students from your cohorts book', 'They leave a note on what they need'], ['Meet in the portal', 'Video and a whiteboard; you’re paid per session']]} />}
    />
  );
}

/* ── Question bank and Mock exams ─────────────────────────── */

interface BankWork {
  stats: { questions: number; live: number; inReview: number; drafts: number; addedThisMonth: number; mocks: number; mocksLive: number; mockDrafts: number; attempts: number; students: number; avgPct: number | null };
  mocks: { id: string; title: string; status: string; attempts: number; avgPct: number | null; passPct: number | null }[];
  missed: { id: string; text: string; missed: number; answered: number; pct: number } | null;
  byTopic: { topic: string; n: number }[];
}

/** Questions written and waiting for review, mocks live and how students score, the most-missed question, topics */
export function TeacherBankHero({ page, onNew }: { page: 'questions' | 'mocks'; onNew: () => void }) {
  const d = useWork<BankWork>('bank');
  if (!d) return loadingHero;
  const st = d.stats;
  const other = page === 'questions' ? <Link href="/teacher/mocks" className={heroBtnLine}>Mock exams</Link> : <Link href="/teacher/questions" className={heroBtnLine}>Question bank</Link>;
  const newBtn = <button type="button" onClick={onNew} className={st.questions ? heroBtnDark : heroBtn}>{page === 'questions' ? 'New question' : 'New mock exam'}</button>;
  if (!st.questions && !st.mocks) return (
    <PageHero kicker={page === 'questions' ? 'Question bank' : 'Mock exams'} l1="Write questions once," l2="use them everywhere."
      sub="Questions you write here feed your lesson quizzes, the Test Centre and the mock exams you set. A reviewer checks them before students see them."
      actions={<>{newBtn}{other}</>}
      aside={<Explainer title="How it fits together" rows={[['Write questions for your courses', 'Tag them by topic and difficulty'], ['A reviewer checks them', 'Then they go live for students'], ['Build mock exams from them', 'Students sit them in the Test Centre']]} />} />
  );
  const max = Math.max(1, ...d.byTopic.map(t => t.n));
  return (
    <PageHero
      kicker={page === 'questions' ? `Question bank${st.addedThisMonth ? ` · ${st.addedThisMonth} added this month` : ''}${st.inReview ? ` · ${st.inReview} in review` : ''}` : `Mock exams${st.attempts ? ` · ${s(st.attempts, 'attempt')} by ${s(st.students, 'student')}` : ''}`}
      l1={`${st.questions.toLocaleString()} question${st.questions === 1 ? '' : 's'},`} l2={`${st.mocksLive || 'no'} mock exam${st.mocksLive === 1 ? '' : 's'} live.`}
      sub={<>
        {st.inReview ? `${s(st.inReview, 'question is', 'questions are')} waiting for a reviewer. ` : ''}
        {st.drafts ? `${s(st.drafts, 'draft')} to finish. ` : ''}
        {st.attempts && st.avgPct != null ? `Students average ${st.avgPct}% on your mocks across ${s(st.attempts, 'attempt')}.` : st.mocksLive ? 'No one has sat your mocks yet.' : 'Set a mock exam from your questions so students can practise under exam conditions.'}
      </>}
      chips={[
        ...(st.avgPct != null ? [{ t: `Mock average ${st.avgPct}%`, strong: true }] : []),
        { t: `${st.live} live` },
        ...(st.mockDrafts ? [{ t: `${s(st.mockDrafts, 'mock')} in draft` }] : []),
      ]}
      actions={<>{newBtn}{other}</>}
      aside={<>
        {d.missed && (
          <div>
            <p className={asideLabel}>Missed most</p>
            <p className="mt-1 text-[13px] font-bold leading-snug">“{short(d.missed.text, 110)}”</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{d.missed.pct}% got it wrong · {d.missed.missed} of {d.missed.answered} answers</p>
          </div>
        )}
        {d.byTopic.length > 0 && (
          <div className={clsx(d.missed && 'border-t border-line pt-2.5')}>
            <p className={asideLabel}>Questions by topic</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {d.byTopic.slice(0, 5).map(t => (
                <div key={t.topic} className="grid grid-cols-[minmax(0,1fr)_90px_28px] items-center gap-2 text-[12.5px]">
                  <span className="truncate font-semibold">{t.topic}</span>
                  <Bar pct={(t.n / max) * 100} />
                  <span className="text-right tabular-nums text-ink2">{t.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>}
    />
  );
}

/* ── Recordings ───────────────────────────────────────────── */

export interface RecRow { id: string; title: string; scheduledAt: string; durationMins: number; status: string; recordingUrl: string | null; cohort: { id: string; name: string }; rosterSize: number; views: number; viewers: number; viewersPct: number | null }
export interface RecordingsWork { stats: { recorded: number; missing: number; views: number; viewsThisWeek: number; avgViewersPct: number | null }; mostWatched: RecRow[]; missing: RecRow[]; recorded: RecRow[] }

/** Classes with no recording yet, how often recordings are watched, and the most watched */
export function TeacherRecordingsHero({ d, onAdd }: { d: RecordingsWork; onAdd: (c: RecRow) => void }) {
  const st = d.stats, m = d.missing[0];
  if (!st.recorded && !st.missing) return (
    <PageHero kicker="Recordings" l1="Every class," l2="ready to watch again."
      sub="Classes in the portal are recorded on their own. Students who missed one, or want to revise, watch it here. You see who has watched."
      actions={<Link href="/teacher/live" className={heroBtn}>Live classes</Link>}
      aside={<Explainer title="How recordings work" rows={[['Teach in the portal', 'The class is recorded on its own'], ['It appears a few minutes later', 'Or paste a link if you recorded elsewhere'], ['Students watch it again', 'You see how many have watched']]} />} />
  );
  return (
    <PageHero
      kicker={`Recordings · ${s(st.recorded, 'class', 'classes')} recorded${st.views ? ` · ${s(st.views, 'view')}` : ''}`}
      l1={st.missing ? `${count(st.missing)} class${st.missing === 1 ? '' : 'es'}` : 'Every class'} l2={st.missing ? `${st.missing === 1 ? 'has' : 'have'} no recording yet.` : 'has a recording.'}
      sub={st.missing ? <>Students who missed {st.missing === 1 ? `“${short(m.title, 40)}”` : 'them'} have nothing to catch up with. Paste a link if you recorded it elsewhere.</>
        : st.avgViewersPct != null ? `On average ${st.avgViewersPct}% of a class watches its recording.` : 'Students in the class can watch them again from their Live classes page.'}
      chips={[
        ...(st.views ? [{ t: `${s(st.views, 'view')}`, strong: true }] : []),
        ...(st.viewsThisWeek ? [{ t: `${st.viewsThisWeek} watched this week` }] : []),
        ...(st.avgViewersPct != null ? [{ t: `${st.avgViewersPct}% of students watch` }] : []),
      ]}
      actions={<>
        {m && <button type="button" onClick={() => onAdd(m)} className={heroBtnDark}>Add a recording</button>}
        <Link href="/teacher/live" className={m ? heroBtnLine : heroBtn}>Live classes</Link>
      </>}
      aside={<>
        {d.mostWatched.length > 0 && <>
          <p className={asideLabel}>Most watched</p>
          {d.mostWatched.map(r => (
            <Link key={r.id} href={`/teacher/recordings/${r.id}`} className="block">
              <p className="flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{r.title}</span><span className="whitespace-nowrap text-ink2">{s(r.views, 'view')}</span></p>
              <Bar pct={r.viewersPct ?? 0} className="mt-1" />
              <span className="text-[11.5px] text-muted">{r.viewers} of {r.rosterSize} students · {r.cohort.name}</span>
            </Link>
          ))}
        </>}
        {d.missing.length > 0 && (
          <div className={clsx(d.mostWatched.length > 0 && 'border-t border-line pt-2.5')}>
            <p className={asideLabel}>No recording yet</p>
            {d.missing.slice(0, 3).map(r => (
              <button key={r.id} type="button" onClick={() => onAdd(r)} className="mt-1.5 flex w-full items-center justify-between gap-2 text-left text-[13px]">
                <span className="min-w-0"><span className="block truncate font-bold">{r.title}</span><span className="block text-[11.5px] text-muted">{new Date(r.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {r.cohort.name}</span></span>
                <span className="flex-shrink-0 text-xs font-bold text-[#2F57C9]">Add</span>
              </button>
            ))}
          </div>
        )}
        {!d.mostWatched.length && !d.missing.length && <p className="text-[13px] text-ink2">No one has watched a recording yet. Students see them on their Live classes page.</p>}
      </>}
    />
  );
}

/* ── Quizzes and rubrics ──────────────────────────────────── */

export interface QuizRow { id: string; title: string; courseId: string; course: string; module: string; questions: number; attempts: number; avgPct: number | null; passPct: number | null }
export interface QuizzesWork {
  stats: { quizzes: number; modules: number; modulesWithoutQuiz: number; emptyQuizzes: number; attempts: number; attemptsThisMonth: number; avgPct: number | null; passPct: number | null; toMark: number; assignments: number; rubrics: number };
  hardest: QuizRow | null;
  noQuiz: { courseId: string; course: string; moduleId: string; module: string; lessons: number }[];
  courses: { id: string; title: string; status: string; quizzes: QuizRow[] }[];
  withoutRubric: { id: string; title: string; dueDate: string }[];
}

/** Modules still without a quiz, how students score, the hardest quiz, and rubrics */
export function TeacherQuizzesHero({ d }: { d: QuizzesWork }) {
  const st = d.stats, gap = d.noQuiz[0];
  // Only one quiz taken: it's not the hardest, it's the only one
  const taken = d.courses.reduce((n, c) => n + c.quizzes.filter(q => q.attempts).length, 0);
  if (!d.courses.length) return (
    <PageHero kicker="Quizzes and rubrics" l1="Check what" l2="students have learned."
      sub="A short quiz at the end of each module shows you, and them, what stuck. Rubrics make your assignment marks clear and fair."
      actions={<Link href="/teacher/courses" className={heroBtn}>My courses</Link>}
      aside={<Explainer title="How quizzes work" rows={[['Add a quiz lesson to a module', 'In the course builder'], ['Write 5 to 10 questions', 'Or draw them from your question bank'], ['See how students score', 'And which quiz is hardest']]} />} />
  );
  return (
    <PageHero
      kicker={`Quizzes · ${s(st.quizzes, 'quiz', 'quizzes')} in ${s(st.modules, 'module')}${st.assignments ? ` · ${st.rubrics} of ${st.assignments} assignments have a rubric` : ''}`}
      l1={st.modulesWithoutQuiz ? `${count(st.modulesWithoutQuiz)} module${st.modulesWithoutQuiz === 1 ? '' : 's'}` : 'Every module'} l2={st.modulesWithoutQuiz ? `still ${st.modulesWithoutQuiz === 1 ? 'has' : 'have'} no quiz.` : 'has a quiz.'}
      sub={<>
        {st.attempts && st.avgPct != null ? `Students average ${st.avgPct}% on your quizzes${st.passPct != null ? ` and pass ${st.passPct}% of the time` : ''}. ` : 'No one has taken your quizzes yet. '}
        {taken > 1 && d.hardest && d.hardest.avgPct != null ? `“${short(d.hardest.title, 40)}” is the hardest, at ${d.hardest.avgPct}%.` : ''}
        {st.emptyQuizzes ? ` ${s(st.emptyQuizzes, 'quiz has', 'quizzes have')} no questions yet.` : ''}
      </>}
      chips={[
        ...(st.avgPct != null ? [{ t: `Average ${st.avgPct}%`, strong: true }] : []),
        ...(st.attemptsThisMonth ? [{ t: `${s(st.attemptsThisMonth, 'attempt')} this month` }] : []),
        ...(st.toMark ? [{ t: `${st.toMark} to mark` }] : []),
      ]}
      actions={<>
        {gap && <Link href={`/teacher/courses/${gap.courseId}/builder`} className={heroBtnDark}>Add a quiz to {short(gap.module, 22)}</Link>}
        {st.toMark > 0 && <Link href="/teacher/quiz-grading" className={heroBtnLine}>Mark {st.toMark}</Link>}
        <Link href="/teacher/assignments" className={heroBtnLine}>Rubrics</Link>
      </>}
      aside={<>
        {d.noQuiz.length > 0 && <>
          <p className={asideLabel}>No quiz yet</p>
          {d.noQuiz.slice(0, 4).map(m => (
            <Link key={m.moduleId} href={`/teacher/courses/${m.courseId}/builder`} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0"><span className="block truncate font-bold">{m.module}</span><span className="block truncate text-[11.5px] text-muted">{m.course.split(' · ')[0]} · {s(m.lessons, 'lesson')}</span></span>
              <span className="flex-shrink-0 text-xs font-bold text-[#2F57C9]">Add</span>
            </Link>
          ))}
        </>}
        {d.hardest && d.hardest.avgPct != null && (
          <div className={clsx(d.noQuiz.length > 0 && 'border-t border-line pt-2.5')}>
            <p className={asideLabel}>{taken > 1 ? 'Hardest quiz' : 'How students score'}</p>
            <Link href={`/teacher/quiz-builder/${d.hardest.courseId}?lessonId=${d.hardest.id}`} className="block">
              <p className="mt-1 flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{d.hardest.title}</span><span className="text-ink2">{d.hardest.avgPct}%</span></p>
              <Bar pct={d.hardest.avgPct} className="mt-1" />
              <span className="text-[11.5px] text-muted">{d.hardest.module} · {s(d.hardest.attempts, 'attempt')}</span>
            </Link>
          </div>
        )}
        {!d.noQuiz.length && !(d.hardest && d.hardest.avgPct != null) && <p className="text-[13px] text-ink2">Every module has a quiz. When students take them, you’ll see the hardest one here.</p>}
      </>}
    />
  );
}
