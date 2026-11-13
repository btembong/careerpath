'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { PageHero, HeroPhoto, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { PersonPhoto } from '@/components/ui/PersonPhoto';
import { until, useCommunityPulse } from '@/components/hero/StudentHeroes';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

const DAY = 86_400_000;
const time = (d: string | number) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayWord = (d: string) => (new Date(d).toDateString() === new Date().toDateString() ? 'today' : new Date(+new Date() + DAY).toDateString() === new Date(d).toDateString() ? 'tomorrow' : new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }));
const daysTo = (d: string) => Math.ceil((+new Date(d) - Date.now()) / DAY);

/* ── Live classes ─────────────────────────────────────────── */

interface TCls { id: string; title: string; scheduledAt: string; durationMins: number; status: string; description?: string | null; recordingUrl: string | null; cohort: { id: string; name: string }; rosterSize: number; attendedCount: number }

export function TeacherLiveHero({ next, upcoming, past, stats, busy, onStart, onEnd, onEdit, onSchedule }: {
  next: TCls | null; upcoming: TCls[]; past: TCls[];
  stats: { thisWeek: number; attendancePct: number | null; missingRecordings: number; minutesThisTerm: number };
  busy: boolean; onStart: (c: TCls) => void; onEnd: (c: TCls) => void; onEdit: (c: TCls) => void; onSchedule: () => void;
}) {
  const live = next?.status === 'ACTIVE';
  const mins = next ? Math.round((+new Date(next.scheduledAt) - Date.now()) / 60_000) : 0;
  const recent = past.filter(c => c.rosterSize).slice(0, 4);
  const week = upcoming.filter(c => +new Date(c.scheduledAt) - Date.now() < 7 * DAY).slice(0, 4);
  return (
    <PageHero
      kicker={live ? 'You’re live now' : next ? `You teach next · ${until(+new Date(next.scheduledAt) - Date.now())}` : 'Live classes'}
      l1={next ? `${next.title},` : 'Nothing scheduled'} l2={next ? `${dayWord(next.scheduledAt)} at ${time(next.scheduledAt)}.` : 'yet.'}
      sub={next ? `${next.cohort.name} · ${next.rosterSize} student${next.rosterSize === 1 ? '' : 's'} · ${next.durationMins} minutes.${stats.attendancePct != null ? ` About ${stats.attendancePct}% usually come.` : ''}` : 'Schedule your next class; students get a reminder and it goes on their calendar.'}
      chips={[
        ...(next && !live ? [{ t: mins > 24 * 60 ? 'Start opens on the day' : 'You can start it now', strong: true }] : []),
        { t: `${Math.round(stats.minutesThisTerm / 60)} h taught in 4 months` },
        ...(stats.missingRecordings ? [{ t: `${stats.missingRecordings} without a recording` }] : []),
      ]}
      actions={<>
        {next && (live ? <>
          <button type="button" onClick={() => onStart(next)} className={heroBtnDark}>Open class</button>
          <button type="button" disabled={busy} onClick={() => onEnd(next)} className={heroBtnLine}>End class</button>
        </> : <>
          <button type="button" disabled={busy || mins > 24 * 60} onClick={() => onStart(next)} className={clsx(heroBtnDark, 'disabled:opacity-60')}>Start class</button>
          <button type="button" onClick={() => onEdit(next)} className={heroBtn}>Edit</button>
        </>)}
        <button type="button" onClick={onSchedule} className={heroBtnLine}>Schedule a class</button>
      </>}
      aside={<>
        <p className={asideLabel}>Next 7 days · {stats.thisWeek} class{stats.thisWeek === 1 ? '' : 'es'}</p>
        {week.length ? week.map(c => (
          <div key={c.id} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-[86px] flex-shrink-0 text-xs font-bold text-azure-strong">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} · {time(c.scheduledAt)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{c.title}</span>
            <span className="whitespace-nowrap text-xs text-muted">{c.rosterSize} students</span>
          </div>
        )) : <p className="text-[13px] text-ink2">Nothing scheduled this week.</p>}
        {recent.length > 0 && (
          <div className="border-t border-line pt-2.5">
            <p className={asideLabel}>Attendance, last {recent.length} class{recent.length === 1 ? '' : 'es'}</p>
            <div className="mt-1.5 flex h-12 items-end gap-2">
              {[...recent].reverse().map(c => { const p = Math.round((c.attendedCount / c.rosterSize) * 100); return (
                <div key={c.id} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${c.title}: ${c.attendedCount} of ${c.rosterSize}`}>
                  <span className="text-[10.5px] font-bold">{p}%</span>
                  <span className="w-full rounded-t-[3px] bg-[#3F6FE8]" style={{ height: Math.max(3, Math.round(p * 0.32)) }} />
                </div>
              ); })}
            </div>
          </div>
        )}
      </>}
    />
  );
}

/* ── Grading ──────────────────────────────────────────────── */

interface GItem { id: string; kind: 'quiz' | 'assignment'; title: string; submittedAt: string; student: { id: string; name: string; avatarUrl: string | null } }

export function TeacherGradingHero({ stats, items, onStart }: { stats: { waiting: number; quiz: number; assignment: number; oldestDays: number | null }; items: GItem[]; onStart: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; kind: string; n: number }>();
    for (const i of items) { const k = i.kind + i.title; const g = m.get(k) ?? { title: i.title, kind: i.kind, n: 0 }; g.n++; m.set(k, g); }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 4);
  }, [items]);
  const top = Math.max(1, ...groups.map(g => g.n));
  // A rough guide: a few minutes for a written answer, a little longer for an assignment
  const minutes = stats.quiz * 3 + stats.assignment * 6;
  return (
    <PageHero
      kicker={stats.oldestDays != null ? `Grading · oldest waiting ${stats.oldestDays === 0 ? 'since today' : `${stats.oldestDays} day${stats.oldestDays === 1 ? '' : 's'}`}` : 'Grading'}
      l1={stats.waiting ? <><span className="text-[#FFFFFF]">{stats.waiting}</span> piece{stats.waiting === 1 ? '' : 's'} of work</> : 'Nothing to mark.'} l2={stats.waiting ? undefined : undefined}
      sub={stats.waiting ? <>to mark: {[stats.assignment ? `${stats.assignment} assignment${stats.assignment === 1 ? '' : 's'}` : null, stats.quiz ? `${stats.quiz} written quiz answer${stats.quiz === 1 ? '' : 's'}` : null].filter(Boolean).join(' and ')}. Students see their grade and your feedback as soon as you save.</> : 'New hand-ins and written quiz answers land here. Nice work.'}
      chips={stats.waiting ? [{ t: `About ${minutes < 60 ? `${minutes} minutes` : `${Math.round(minutes / 6) / 10} hours`} of marking`, strong: true }] : []}
      actions={stats.waiting ? <><button type="button" onClick={onStart} className={heroBtnDark}>Start marking</button><Link href="/teacher/rubrics" className={heroBtn}>Rubrics</Link></> : <Link href="/teacher/rubrics" className={heroBtn}>Rubrics</Link>}
      aside={groups.length ? <>
        <p className={asideLabel}>Waiting, by piece of work</p>
        {groups.map(g => (
          <div key={g.kind + g.title}>
            <p className="flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{g.title}</span><span className="whitespace-nowrap font-semibold text-[#8A5A0B]">{g.n} to mark</span></p>
            <span className="mt-1 block h-2 rounded bg-[#FFF6E5]"><span className="block h-2 rounded bg-[#eda100]" style={{ width: `${Math.round((g.n / top) * 100)}%` }} /></span>
            <span className="text-[11.5px] text-muted">{g.kind === 'quiz' ? 'Written quiz answers' : 'Assignment'}</span>
          </div>
        ))}
      </> : undefined}
    />
  );
}

/* ── Community and staff room ─────────────────────────────── */

interface QThread { id: string; body: string; createdAt: string; course: { id: string; title: string }; author: { id: string; name: string }; teacherAnswer: unknown; replies: { author: { id: string; isTeacher: boolean }; createdAt: string }[] }

export function TeacherCommunityHero({ onAnswer }: { onAnswer: () => void }) {
  const [threads, setThreads] = useState<QThread[] | null>(null);
  const { user } = useAuth();
  const pulse = useCommunityPulse();
  useEffect(() => { api.get('/community/feed', { params: { show: 'unanswered' } }).then(r => setThreads(r.data?.threads ?? [])).catch(() => setThreads([])); }, []);
  const waiting = (threads ?? []).filter(t => !t.teacherAnswer).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const monthAgo = Date.now() - 30 * DAY;
  const mine = user ? (threads ?? []).reduce((n, t) => n + t.replies.filter(r => r.author.id === user.id && +new Date(r.createdAt) > monthAgo).length, 0) : 0;
  const ago = (iso: string) => { const h = Math.round((Date.now() - +new Date(iso)) / 3_600_000); return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} ago`; };
  return (
    <PageHero
      kicker="Community · your courses"
      l1={waiting.length ? <><span className="text-[#FFFFFF]">{waiting.length} question{waiting.length === 1 ? '' : 's'}</span></> : 'Every question'}
      l2First={false}
      sub={waiting.length ? <>{waiting.length === 1 ? 'is' : 'are'} waiting for a teacher. Teachers’ answers are pinned to the top, and students who get an answer come back to the course.</> : 'in your courses has a teacher’s answer. New questions show up here.'}
      chips={[...(mine ? [{ t: `You answered ${mine} this month`, strong: true }] : []), ...(pulse?.hereNow ? [{ t: `${pulse.hereNow} on CareerPath now` }] : [])]}
      actions={<>
        {waiting.length > 0 && <button type="button" onClick={onAnswer} className={heroBtn}>Answer questions</button>}
        <a href="#staff" className={heroBtnLine}>Staff room</a>
      </>}
      aside={waiting.length ? <>
        <p className={asideLabel}>Waiting longest</p>
        {waiting.slice(0, 3).map(t => (
          <div key={t.id} className="border-t border-line pt-2 first-of-type:border-t-0 first-of-type:pt-0">
            <p className="text-[13.5px] font-bold leading-snug">“{t.body.length > 110 ? t.body.slice(0, 108) + '…' : t.body}”</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{t.author.name.split(' ')[0]} · {t.course.title.split(' · ')[0]} · {ago(t.createdAt)}</p>
          </div>
        ))}
      </> : undefined}
    />
  );
}

/* ── My students ──────────────────────────────────────────── */

interface SRow { id: string; name: string; progress: number; flag: string | null; flagReason: string | null; cohort: { id: string; name: string } }

export function TeacherStudentsHero({ stats, students, cohorts }: { stats: { students: number; attention: number; avgProgress: number | null; activeThisWeek: number }; students: SRow[]; cohorts: number }) {
  const flagged = students.filter(s => s.flag);
  const buckets = [['Not started', 0, 1], ['A quarter', 1, 37], ['Half', 37, 63], ['Three quarters', 63, 100], ['Finished', 100, 101]].map(([l, a, b]) => ({ l: l as string, n: students.filter(s => s.progress >= (a as number) && s.progress < (b as number)).length }));
  const top = Math.max(1, ...buckets.map(b => b.n));
  return (
    <PageHero
      kicker={`My students · ${stats.students} in ${cohorts} cohort${cohorts === 1 ? '' : 's'}`}
      l1={stats.attention ? <><span className="text-[#FFFFFF]">{stats.attention} student{stats.attention === 1 ? '' : 's'}</span></> : 'Everyone is on track'}
      sub={stats.attention ? <>need{stats.attention === 1 ? 's' : ''} you this week{flagged[0]?.flagReason ? `: ${flagged[0].name.split(' ')[0]} ${flagged[0].flagReason}.` : '.'} A short message usually brings them back.</> : 'by your alert rules. You’ll see anyone who falls behind here.'}
      chips={[
        { t: `${stats.students ? Math.round((stats.activeThisWeek / stats.students) * 100) : 0}% active this week`, strong: true },
        ...(stats.avgProgress != null ? [{ t: `Average progress ${stats.avgProgress}%` }] : []),
      ]}
      actions={<>
        <a href="#students" className={heroBtn}>{stats.attention ? 'See who needs you' : 'All students'}</a>
        <a href="#rules" className={heroBtnLine}>Alert rules</a>
      </>}
      aside={<>
        {flagged.length > 0 && <>
          <p className={asideLabel}>Needs you</p>
          {flagged.slice(0, 3).map(s => (
            <div key={s.id} className="flex items-center gap-2.5 text-[13px]">
              <PersonPhoto name={s.name} id={s.id} size={32} />
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{s.name}</p><p className="truncate text-[11.5px] text-muted">{s.flag} · {s.cohort.name}</p></div>
              <Link href={`/teacher/messages?to=${s.id}`} className="text-[12.5px] font-bold text-azure-strong hover:underline">Message</Link>
            </div>
          ))}
        </>}
        <div className={clsx(flagged.length > 0 && 'border-t border-line pt-2.5')}>
          <p className={asideLabel}>How far through their courses</p>
          <div className="mt-1.5 flex h-[78px] items-end gap-2">
            {buckets.map(b => (
              <div key={b.l} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                <span className="text-[11px] font-bold">{b.n}</span>
                <span className="w-full rounded-t-[3px] bg-[#3F6FE8]" style={{ height: Math.max(3, Math.round((b.n / top) * 46)) }} />
                <span className="text-center text-[10px] leading-tight text-muted">{b.l}</span>
              </div>
            ))}
          </div>
        </div>
      </>}
    />
  );
}

/* ── My cohorts ───────────────────────────────────────────── */

export function TeacherCohortsHero() {
  const [live, setLive] = useState<{ cohorts: { id: string; name: string; examDate: string | null; students: number }[]; next: TCls | null; stats: { attendancePct: number | null } } | null>(null);
  const [st, setSt] = useState<{ stats: { attention: number; avgProgress: number | null }; students: SRow[] } | null>(null);
  useEffect(() => {
    api.get('/live/teacher/overview').then(r => setLive(r.data)).catch(() => {});
    api.get('/portals/teacher/my-students').then(r => setSt(r.data)).catch(() => {});
  }, []);
  if (!live || !live.cohorts.length) return null;
  // The class with the nearest exam is the one to lead with
  const main = [...live.cohorts].sort((a, b) => (a.examDate ? +new Date(a.examDate) : Infinity) - (b.examDate ? +new Date(b.examDate) : Infinity))[0];
  const total = live.cohorts.reduce((n, c) => n + c.students, 0);
  const examDays = main.examDate ? daysTo(main.examDate) : null;
  const flagged = (st?.students ?? []).filter(s => s.flag);
  return (
    <PageHero
      photo={<HeroPhoto initials={String(total)} caption={`student${total === 1 ? '' : 's'}`} />}
      kicker={`${live.cohorts.length > 1 ? `${live.cohorts.length} cohorts · ` : ''}${main.name}`}
      l1={`${main.name}.`} l2={examDays != null && examDays >= 0 ? `${examDays} day${examDays === 1 ? '' : 's'} to the exam.` : undefined}
      sub={<>{live.stats.attendancePct != null ? `Attendance ${live.stats.attendancePct}% over the last 4 weeks` : 'No classes held yet'}{st?.stats.avgProgress != null ? `, average course progress ${st.stats.avgProgress}%` : ''}.{live.next ? ` Next class ${dayWord(live.next.scheduledAt)}, ${time(live.next.scheduledAt)}: ${live.next.title}.` : ''}</>}
      actions={<>
        <Link href="/teacher/live" className={heroBtn}>Live classes</Link>
        <Link href="/teacher/assignments" className={heroBtnLine}>Set an assignment</Link>
        <Link href="/teacher/messages" className={heroBtnLine}>Message the class</Link>
      </>}
      aside={<>
        <p className={asideLabel}>{flagged.length ? 'Needs you' : 'Your students'}</p>
        {flagged.length ? flagged.slice(0, 3).map(s => (
          <div key={s.id} className="flex items-center gap-2.5 text-[13px]">
            <PersonPhoto name={s.name} id={s.id} size={32} />
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{s.name}</p><p className="truncate text-[11.5px] text-muted">{s.flag}</p></div>
            <Link href={`/teacher/messages?to=${s.id}`} className="text-[12.5px] font-bold text-azure-strong hover:underline">Message</Link>
          </div>
        )) : <p className="text-[13px] text-ink2">No one is falling behind right now.</p>}
        <Link href="/teacher/students" className="border-t border-line pt-2.5 text-[13px] font-bold text-azure-strong hover:underline">All students and alert rules</Link>
      </>}
    />
  );
}
