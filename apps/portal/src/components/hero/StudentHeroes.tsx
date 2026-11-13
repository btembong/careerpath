'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { PageHero, HeroPhoto, HeroRing, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { PersonPhoto } from '@/components/ui/PersonPhoto';
import api from '@/lib/api';

const DAY = 86_400_000;
const time = (d: string | number) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();
const dayWord = (d: string) => (isToday(d) ? 'today' : new Date(+new Date() + DAY).toDateString() === new Date(d).toDateString() ? 'tomorrow' : new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }));
const daysTo = (d: string) => Math.ceil((+new Date(d) - Date.now()) / DAY);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export function until(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}
const hm = (h: number) => { const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };

/* ── Live classes ─────────────────────────────────────────── */

interface LiveCls { id: string; title: string; description: string | null; scheduledAt: string; durationMins: number; cohort: { id: string; name: string }; teacher: string; attended?: boolean; inClass?: number }

export function StudentLiveHero({ live, next, attendance, week, now, onAddToCalendar }: {
  live?: LiveCls; next?: LiveCls; attendance: { attended: number; held: number; cohortAvgPct: number | null } | null;
  week: { day: Date; items: LiveCls[]; today: boolean }[]; now: number; onAddToCalendar: (c: LiveCls) => void;
}) {
  const c = live ?? next;
  const opens = next ? +new Date(next.scheduledAt) - 10 * 60_000 : 0;
  const canJoin = !!live || (!!next && now >= opens);
  return (
    <PageHero
      kicker={live ? `Live now · started ${Math.max(0, Math.round((now - +new Date(live.scheduledAt)) / 60_000))} min ago${live.inClass ? ` · ${live.inClass} in class` : ''}` : next ? `Next live class · ${until(+new Date(next.scheduledAt) - now)}` : 'Live classes'}
      l1={c ? `${c.title},` : 'No class scheduled'} l2={c ? `${dayWord(c.scheduledAt)} at ${time(c.scheduledAt)}.` : 'yet.'}
      sub={c ? [c.teacher, c.cohort.name, `${c.durationMins} minutes`].join(' · ') + (c.description ? `. ${c.description}` : '.') : 'Your teacher will add the next class here. Recordings of past classes are below.'}
      chips={next && !live ? [{ t: canJoin ? 'You can join now' : `Join opens at ${time(opens)}`, strong: true }] : []}
      actions={<>
        {canJoin && c && <Link href={`/student/live/${c.id}`} className={heroBtnDark}>Join class</Link>}
        {!canJoin && next && <button type="button" onClick={() => onAddToCalendar(next)} className={heroBtn}>Add to calendar</button>}
        <a href="#classes" className={heroBtnLine}>Past recordings</a>
      </>}
      aside={<>
        <p className={asideLabel}>This week</p>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold">
          {week.map(w => (
            <div key={w.day.toISOString()} className={clsx('rounded-lg py-1.5', w.today ? 'bg-[#3F6FE8] text-[#FFFFFF]' : 'bg-subtle text-navy')}>
              <span className="block">{w.day.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</span>
              <span className="block text-[15px] font-extrabold">{w.day.getDate()}</span>
              <span className={clsx('mx-auto mt-1 block h-1.5 w-1.5 rounded-full', !w.items.length ? 'bg-transparent' : w.items.some(i => i.attended) ? 'bg-[#1baf7a]' : w.today ? 'bg-[#FFFFFF]' : 'bg-[#3F6FE8]')} />
            </div>
          ))}
        </div>
        {attendance && attendance.held > 0 && (
          <div className="flex items-center gap-3 border-t border-line pt-2.5">
            <HeroRing value={attendance.attended} max={attendance.held} label={`${attendance.attended} of ${attendance.held} classes attended`} />
            <div><p className="text-lg font-extrabold">{attendance.attended} of {attendance.held} attended</p><p className="text-xs text-muted">{attendance.cohortAvgPct != null ? `Class average ${attendance.cohortAvgPct}%` : 'Classes held so far'}</p></div>
          </div>
        )}
      </>}
    />
  );
}

/* ── My progress ──────────────────────────────────────────── */

export function StudentProgressHero({ stats, weeks, courses, nextLesson }: {
  stats: { totalLessons: number; completedLessons: number; avgQuizScore: number | null; streak: number; certificates: number } | null;
  weeks: { week: string; hours: number; lessons: number }[] | null;
  courses: { id: string; title: string; progress: number }[];
  nextLesson?: { href: string; title: string } | null;
}) {
  const [exam, setExam] = useState<{ date: string; label: string | null } | null>(null);
  useEffect(() => { api.get('/portals/student/cohort-overview').then(r => r.data?.cohort?.examDate && setExam({ date: r.data.cohort.examDate, label: r.data.cohort.sittingLabel })).catch(() => {}); }, []);
  const pct = stats?.totalLessons ? Math.round((stats.completedLessons / stats.totalLessons) * 100) : 0;
  const thisWeek = weeks?.[weeks.length - 1];
  // The pace of the last four weeks, to say when they'll finish
  const recent = (weeks ?? []).slice(-4), perWeek = recent.length ? recent.reduce((n, w) => n + w.lessons, 0) / recent.length : 0;
  const left = stats ? stats.totalLessons - stats.completedLessons : 0;
  const finish = perWeek > 0 && left > 0 ? new Date(Date.now() + (left / perWeek) * 7 * DAY) : null;
  const examDays = exam ? daysTo(exam.date) : null;
  const ahead = finish && exam ? Math.round((+new Date(exam.date) - +finish) / (7 * DAY)) : null;
  const studyMax = Math.max(0.5, ...(weeks ?? []).slice(-7).map(w => w.hours));
  return (
    <PageHero
      kicker={examDays != null && examDays >= 0 ? `My progress · ${examDays} days to ${exam!.label ?? 'your exam'}` : 'My progress'}
      l1={!stats?.totalLessons ? <>Let’s get <span className="text-[#FFFFFF]">started.</span></> : pct >= 100 ? 'Every lesson done.' : <>You’re <span className="text-[#FFFFFF]">{pct}% of the way</span></>}
      sub={stats && !stats.totalLessons ? 'Open a course and finish your first lesson; your progress, quiz average and finish date show up here.' : stats ? <>{pct < 100 && <>through your courses. </>}{stats.completedLessons} of {stats.totalLessons} lessons done{stats.avgQuizScore ? `, quizzes averaging ${stats.avgQuizScore}%` : ''}.{finish ? ` At your pace you finish everything by ${finish.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${ahead != null ? (ahead >= 0 ? `, ${ahead} week${ahead === 1 ? '' : 's'} before the exam.` : `, ${-ahead} week${ahead === -1 ? '' : 's'} after the exam: a little more each week closes the gap.`) : '.'}` : left > 0 ? ' Finish a lesson this week to see when you’ll be done.' : ''}</> : 'Loading your progress…'}
      chips={stats ? [
        ...(stats.streak ? [{ t: `${stats.streak}-day streak`, strong: true }] : []),
        ...(thisWeek ? [{ t: `${hm(thisWeek.hours)} this week` }] : []),
        ...(stats.certificates ? [{ t: `${stats.certificates} certificate${stats.certificates === 1 ? '' : 's'}` }] : []),
      ] : []}
      actions={<>
        {nextLesson ? <Link href={nextLesson.href} className={heroBtn}>Continue: {nextLesson.title.length > 28 ? nextLesson.title.slice(0, 27) + '…' : nextLesson.title}</Link> : <Link href="/student/courses" className={heroBtn}>My courses</Link>}
        <Link href="/student/roadmap" className={heroBtnLine}>See my roadmap</Link>
      </>}
      aside={<>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 120 120" width={104} height={104} role="img" aria-label={`${pct}% of lessons done`} className="flex-shrink-0">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#EAF0FF" strokeWidth="14" />
            {pct > 0 && <circle cx="60" cy="60" r="48" fill="none" stroke="#3F6FE8" strokeWidth="14" strokeDasharray={`${(pct / 100 * 301.6).toFixed(1)} 301.6`} transform="rotate(-90 60 60)" strokeLinecap="round" />}
            <text x="60" y="67" textAnchor="middle" fontSize="24" fontWeight="800" fill="#072061">{pct}%</text>
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {courses.slice(0, 4).map(c => (
              <div key={c.id}>
                <p className="flex justify-between gap-2 text-xs font-semibold"><span className="truncate">{c.title.split(' · ')[0]}</span><span>{c.progress}%</span></p>
                <span className="block h-1.5 rounded-[3px] bg-accent-soft"><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${c.progress}%` }} /></span>
              </div>
            ))}
            {!courses.length && <p className="text-xs text-muted">Your courses will show here.</p>}
          </div>
        </div>
        {weeks && weeks.length > 0 && (
          <div className="border-t border-line pt-2.5">
            <p className={asideLabel}>Study, last {Math.min(7, weeks.length)} weeks</p>
            <div className="mt-1.5 flex h-11 items-end gap-1.5">
              {weeks.slice(-7).map((w, i, all) => <span key={w.week} title={`${w.week}: ${hm(w.hours)}`} className={clsx('flex-1 rounded-t-[3px]', i === all.length - 1 ? 'bg-[#072061]' : w.hours ? 'bg-[#3F6FE8]' : 'bg-line')} style={{ height: Math.max(3, Math.round((w.hours / studyMax) * 44)) }} />)}
            </div>
          </div>
        )}
      </>}
    />
  );
}

/* ── Community ────────────────────────────────────────────── */

interface CReply { author: { id: string; isTeacher: boolean } }
interface CThread { id: string; body: string; createdAt: string; course: { id: string; title: string }; author: { id: string; name: string }; answered: boolean; teacherAnswer: unknown; replies: CReply[]; upvotes: number }

export function useCommunityPulse() {
  const [p, setP] = useState<{ hereNow: number; faces: { id: string; name: string; avatarUrl: string | null }[] } | null>(null);
  useEffect(() => { api.get('/community/pulse').then(r => setP(r.data)).catch(() => {}); }, []);
  return p;
}

export function StudentCommunityHero({ threads, me, onAsk, onOpen }: { threads: CThread[] | null; me?: string; onAsk: () => void; onOpen: (id: string) => void }) {
  const pulse = useCommunityPulse();
  const week = (threads ?? []).filter(t => Date.now() - +new Date(t.createdAt) < 7 * DAY);
  const answered = week.filter(t => t.answered || t.replies.length).length;
  const myAnswers = me ? (threads ?? []).reduce((n, t) => n + t.replies.filter(r => r.author.id === me).length, 0) : 0;
  const hot = [...(threads ?? [])].sort((a, b) => (b.replies.length + b.upvotes * 2) - (a.replies.length + a.upvotes * 2))[0];
  return (
    <PageHero
      kicker={`Community · ${week.length} question${week.length === 1 ? '' : 's'} this week`}
      l1="Ask, answer," l2="study together."
      sub={<>{week.length ? `${answered} of this week’s questions have answers. ` : 'Ask about any lesson in your courses; classmates and teachers answer. '}{myAnswers ? `Your answers so far: ${myAnswers}. Thank you for helping.` : 'Answering a classmate is one of the best ways to learn it yourself.'}</>}
      actions={<>
        <button type="button" onClick={onAsk} className={heroBtn}>Ask a question</button>
        <a href="#discussions" className={heroBtnLine}>See questions</a>
      </>}
      chips={pulse && pulse.hereNow ? [{ t: `${pulse.hereNow} ${pulse.hereNow === 1 ? 'person' : 'people'} on CareerPath now`, strong: true }] : []}
      aside={hot ? <>
        <p className={asideLabel}>Busiest question · {hot.course.title.split(' · ')[0]}</p>
        <button type="button" onClick={() => onOpen(hot.id)} className="text-left text-[15px] font-bold leading-snug hover:text-azure-strong">“{hot.body.length > 140 ? hot.body.slice(0, 138) + '…' : hot.body}”</button>
        <p className="text-[12.5px] text-muted">{hot.author.name.split(' ')[0]} · {hot.replies.length} answer{hot.replies.length === 1 ? '' : 's'}{hot.teacherAnswer ? ' · a teacher answered' : ''}</p>
        {pulse && pulse.faces.length > 0 && (
          <div className="flex items-center gap-2 border-t border-line pt-2.5">
            <div className="flex">{pulse.faces.map((f, i) => <span key={f.id} className={clsx('rounded-full ring-2 ring-white', i && '-ml-2.5')}><PersonPhoto src={f.avatarUrl} name={f.name} id={f.id} size={30} /></span>)}</div>
            <span className="text-xs text-muted">here in the last 15 minutes</span>
          </div>
        )}
      </> : undefined}
    />
  );
}

/* ── My cohort ────────────────────────────────────────────── */

export function StudentCohortHero({ cohort, teacher, next, stats, members, onAddToCalendar, now }: {
  cohort: { id: string; name: string; sittingLabel: string | null; examDate: string | null };
  teacher?: { id: string; name: string; avatarUrl: string | null };
  next?: { id: string; title: string; scheduledAt: string; durationMins: number; live: boolean } | null;
  stats?: { attended: number; held: number; cohortAttendancePct: number | null; submitted: number; assignments: number; avgGradePct: number | null; classAvgGradePct?: number | null; classSubmittedAvg?: number | null } | null;
  members: { id: string; name: string; role: string; me: boolean }[];
  onAddToCalendar: () => void; now: number;
}) {
  const examDays = cohort.examDate ? daysTo(cohort.examDate) : null;
  const canJoin = !!next && (next.live || +new Date(next.scheduledAt) - now <= 10 * 60_000);
  const classmates = members.filter(m => m.role === 'Student' && !m.me);
  const attPct = stats?.held ? Math.round((stats.attended / stats.held) * 100) : null;
  const subPct = stats?.assignments ? Math.round((stats.submitted / stats.assignments) * 100) : null;
  const rows = stats ? [
    attPct != null && { l: 'Attendance', me: attPct, avg: stats.cohortAttendancePct, v: `${attPct}%${stats.cohortAttendancePct != null ? ` · class ${stats.cohortAttendancePct}%` : ''}` },
    stats.avgGradePct != null && { l: 'Average grade', me: stats.avgGradePct, avg: stats.classAvgGradePct ?? null, v: `${stats.avgGradePct}%${stats.classAvgGradePct != null ? ` · class ${stats.classAvgGradePct}%` : ''}` },
    subPct != null && { l: 'Work handed in', me: subPct, avg: stats.classSubmittedAvg != null && stats.assignments ? Math.round((stats.classSubmittedAvg / stats.assignments) * 100) : null, v: `${stats.submitted} of ${stats.assignments}${stats.classSubmittedAvg != null ? ` · class ${stats.classSubmittedAvg}` : ''}` },
  ].filter(Boolean) as { l: string; me: number; avg: number | null; v: string }[] : [];
  return (
    <PageHero
      photo={<HeroPhoto src={teacher?.avatarUrl} initials={initials(teacher?.name ?? cohort.name)} caption={teacher ? teacher.name.replace(/\s*\(.*\)\s*$/, '') : undefined} />}
      kicker={[cohort.sittingLabel, `${classmates.length + 1} students`].filter(Boolean).join(' · ')}
      l1={`${cohort.name}.`} l2={examDays != null && examDays >= 0 ? (examDays === 0 ? 'Exam day. Good luck!' : `${examDays} day${examDays === 1 ? '' : 's'} to the exam.`) : undefined}
      sub={next ? <>{next.live ? 'Live now: ' : `Next class ${dayWord(next.scheduledAt)}, ${time(next.scheduledAt)}: `}{next.title} · {next.durationMins} min.</> : 'No class is scheduled yet. Your teacher will add the next one here.'}
      actions={<>
        {next && (canJoin ? <Link href={`/student/live/${next.id}`} className={heroBtnDark}>Join class</Link> : <button type="button" onClick={onAddToCalendar} className={heroBtn}>Add next class to calendar</button>)}
        {teacher && <Link href={`/student/messages?to=${teacher.id}`} className={heroBtnLine}>Message your teacher</Link>}
      </>}
      aside={rows.length ? <>
        <p className={asideLabel}>You and the class</p>
        {rows.map(r => (
          <div key={r.l}>
            <p className="flex justify-between gap-2 text-[12.5px] font-semibold"><span>{r.l}</span><span className="text-ink2">{r.v}</span></p>
            <div className="relative mt-1 h-2 rounded bg-accent-soft">
              <span className="absolute left-0 top-0 block h-2 rounded bg-[#3F6FE8]" style={{ width: `${Math.min(100, r.me)}%` }} />
              {r.avg != null && <span className="absolute -top-[3px] block h-3.5 w-0.5 bg-navy" style={{ left: `${Math.min(100, r.avg)}%` }} title="Class average" />}
            </div>
          </div>
        ))}
        <p className="flex gap-3 text-[11.5px] text-muted"><span className="flex items-center gap-1.5"><span className="h-1.5 w-2.5 rounded-sm bg-[#3F6FE8]" />You</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-navy" />Class average</span></p>
        {classmates.length > 0 && <p className="border-t border-line pt-2.5 text-xs text-muted">With {classmates.slice(0, 3).map(m => m.name.split(' ')[0]).join(', ')}{classmates.length > 3 ? ` and ${classmates.length - 3} more` : ''}</p>}
      </> : undefined}
    />
  );
}

/* ── Assignments ──────────────────────────────────────────── */

interface ARow { id: string; title: string; dueDate: string; maxPoints: number; teacher: string; state: 'todo' | 'overdue' | 'submitted' | 'graded'; submission: { grade: number | null } | null }

export function StudentAssignmentsHero({ stats, rows, onOpen }: {
  stats: { dueThisWeek: number; nextDue: ARow | null; overdue: number; avgGradePct: number | null; graded: number; submitted: number; total: number } | null;
  rows: ARow[]; onOpen: (id: string) => void;
}) {
  const n = stats?.nextDue;
  const overdueRow = rows.find(r => r.state === 'overdue');
  const focus = overdueRow ?? n;
  const ms = focus ? +new Date(focus.dueDate) - Date.now() : 0;
  const waiting = rows.filter(r => r.state === 'submitted').length;
  const soon = [...rows].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)).filter(r => r.state !== 'graded' || Date.now() - +new Date(r.dueDate) < 14 * DAY).slice(0, 4);
  const chip = (r: ARow) => r.state === 'graded' ? { t: r.submission?.grade != null && r.maxPoints ? `${Math.round((r.submission.grade / r.maxPoints) * 100)}%` : 'Graded', c: 'bg-[#E6F5EE] text-[#1F6B47]' }
    : r.state === 'submitted' ? { t: 'Waiting', c: 'bg-accent-soft text-[#2F57C9]' }
    : r.state === 'overdue' ? { t: 'Overdue', c: 'bg-[#FDECEC] text-[#A23434]' }
    : daysTo(r.dueDate) <= 2 ? { t: daysTo(r.dueDate) <= 0 ? 'Today' : daysTo(r.dueDate) === 1 ? 'Tomorrow' : 'In 2 days', c: 'bg-[#FFF6E5] text-[#8A5A0B]' }
    : { t: `In ${daysTo(r.dueDate)} days`, c: 'bg-subtle text-ink2' };
  return (
    <PageHero
      kicker={stats ? `Assignments · ${stats.dueThisWeek} due this week${stats.overdue ? ` · ${stats.overdue} overdue` : ''}` : 'Assignments'}
      l1={focus ? `${focus.title}` : 'All caught up.'}
      l2={focus ? (focus.state === 'overdue' ? 'was due; you can still hand it in.' : `is due ${dayWord(focus.dueDate)}, ${time(focus.dueDate)}.`) : undefined}
      sub={focus ? `${focus.maxPoints} points · ${focus.teacher}.` : 'Nothing is due right now. New work from your teachers shows up here.'}
      chips={stats ? [
        ...(focus && focus.state !== 'overdue' ? [{ t: `Due ${until(ms)}`, strong: true }] : []),
        ...(waiting ? [{ t: `${waiting} waiting for a grade` }] : []),
        ...(stats.avgGradePct != null ? [{ t: `Average grade ${stats.avgGradePct}%` }] : []),
      ] : []}
      actions={<>
        {focus && <button type="button" onClick={() => onOpen(focus.id)} className={heroBtn}>{focus.state === 'overdue' ? 'Hand it in' : 'Open it'}</button>}
        <a href="#list" className={heroBtnLine}>All assignments</a>
      </>}
      aside={soon.length ? <>
        <p className={asideLabel}>Coming up and recent</p>
        {soon.map(r => {
          const c = chip(r), d = new Date(r.dueDate);
          return (
            <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="flex items-center gap-2.5 text-left">
              <span className="w-11 flex-shrink-0 text-center"><span className="block text-[11px] font-semibold text-muted">{d.toLocaleDateString('en-GB', { month: 'short' })}</span><span className="block text-lg font-extrabold">{d.getDate()}</span></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{r.title}</span><span className="block truncate text-[11.5px] text-muted">{r.teacher} · {r.maxPoints} points</span></span>
              <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-[11.5px] font-bold', c.c)}>{c.t}</span>
            </button>
          );
        })}
      </> : undefined}
    />
  );
}
