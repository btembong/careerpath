'use client';
import Link from 'next/link';
import { PageHero, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';

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

/* ── My courses ───────────────────────────────────────────── */

interface LibCourse { id: string; title: string; pct: number; state: 'going' | 'new' | 'done'; next: { id: string; title: string; module: string; durationSecs: number | null } | null }

/** The course to carry on with, its cover tilted beside it, and the courses in progress */
export function StudentCoursesHero({ lib, cover }: {
  lib: { stats: { courses: number; lessonsThisWeek: number; studySecs30d: number; certificates: number }; resume: { id: string; title: string; pct: number; next: LibCourse['next'] } | null; courses: LibCourse[] };
  cover: React.ReactNode;
}) {
  const r = lib.resume, s = lib.stats;
  if (!lib.courses.length) return (
    <PageHero kicker="My courses" l1="Your courses" l2="will live here."
      sub="Join a free course or buy one, and it shows up here with your progress, your next lesson, and your certificate when you finish."
      actions={<><Link href="/student/catalogue" className={heroBtn}>Browse the catalogue</Link><Link href="/packages" className={heroBtnLine}>See packages</Link></>}
      aside={<Explainer title="How it works" rows={[['Choose a course or a package', 'Many have free lessons to try first'], ['Learn at your pace', 'Videos, notes and quizzes, on your phone or computer'], ['Earn your certificate', 'When every lesson is done']]} />} />
  );
  const going = lib.courses.filter(c => c.state !== 'done').sort((a, b) => b.pct - a.pct).slice(0, 4);
  const mins = Math.round(s.studySecs30d / 60);
  return (
    <PageHero
      photo={r && cover ? <Link href={`/student/courses/${r.id}`} className="block w-[120px] -rotate-3 overflow-hidden rounded-[22px] shadow-[0_12px_26px_rgba(7,32,97,0.25)] sm:w-[136px]">{cover}</Link> : undefined}
      kicker={`My courses · ${s.courses} course${s.courses === 1 ? '' : 's'}${s.lessonsThisWeek ? ` · ${s.lessonsThisWeek} lesson${s.lessonsThisWeek === 1 ? '' : 's'} this week` : ''}`}
      l1={r ? `${r.title.split(' · ')[0]},` : 'Pick a course'} l2={r ? (r.next ? 'your next lesson is waiting.' : 'ready when you are.') : 'and start learning.'}
      sub={r?.next ? `Next: ${r.next.module} · ${r.next.title}${r.next.durationSecs ? ` · ${Math.max(1, Math.round(r.next.durationSecs / 60))} min` : ''}.` : 'Open any course below to carry on.'}
      chips={[
        ...(r ? [{ t: `${r.pct}% through`, strong: true }] : []),
        ...(mins ? [{ t: `${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ''}`} studied in 30 days` }] : []),
        ...(s.certificates ? [{ t: `${s.certificates} certificate${s.certificates === 1 ? '' : 's'}` }] : []),
      ]}
      actions={<>
        {r && <Link href={r.next ? `/student/learn/${r.id}/lesson/${r.next.id}` : `/student/learn/${r.id}`} className={heroBtnDark}>Continue lesson</Link>}
        <Link href="/student/catalogue" className={heroBtnLine}>Browse catalogue</Link>
      </>}
      aside={going.length ? <>
        <p className={asideLabel}>In progress</p>
        {going.map(c => (
          <Link key={c.id} href={`/student/courses/${c.id}`} className="block">
            <p className="flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{c.title.split(' · ')[0]}</span><span className="text-ink2">{c.pct}%</span></p>
            <span className="mt-1 block h-1.5 rounded-[3px] bg-accent-soft"><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${c.pct}%` }} /></span>
          </Link>
        ))}
        <p className="border-t border-line pt-2.5 text-xs text-muted">{s.certificates ? `${s.certificates} finished with a certificate` : 'Finish a course to earn a certificate'}</p>
      </> : undefined}
    />
  );
}

/* ── Roadmap ──────────────────────────────────────────────── */

interface RStep { kind: string; course: string; courseId: string | null; lessonId: string | null; title: string; state: string; date: string | null }
interface RPace { daysLeft: number | null; donePct: number; expectedPct: number | null; behindDays: number | null; lessonsLeft: number; quizzesLeft: number; perDayNeeded: number | null }

/** On track or behind, what's left, and the step to do now, with where you are against where you should be */
export function StudentRoadmapHero<T extends RPace>({ p, headline }: { p: { name: string; exam: { date: string; label: string | null } | null; pace: T; steps: RStep[] } | null; headline: (p: T) => string }) {
  if (!p) return (
    <PageHero kicker="Roadmap" l1="Your path" l2="to exam day."
      sub="When you join a package, your roadmap plans every module, live class and revision week up to your exam, and tells you each week whether you’re on track."
      actions={<Link href="/packages" className={heroBtn}>See packages</Link>}
      aside={<Explainer title="What your roadmap does" rows={[['Plans every module to your exam', 'With a date to aim for on each'], ['Puts in classes and revision weeks', 'So the last weeks are for practice'], ['Tells you if you’re on track', 'And how much a day gets you there']]} />} />
  );
  const pace = p.pace;
  const now = p.steps.find(s => s.state === 'now') ?? p.steps.find(s => s.state === 'next');
  const href = now && now.kind === 'module' && now.courseId ? (now.lessonId ? `/student/learn/${now.courseId}/lesson/${now.lessonId}` : `/student/courses/${now.courseId}`) : now?.kind === 'live' ? '/student/live' : null;
  const left = pace.lessonsLeft + pace.quizzesLeft;
  const noLessons = (pace as RPace & { lessonsTotal?: number }).lessonsTotal === 0;
  const behind = pace.behindDays != null && pace.behindDays >= 3, ahead = pace.behindDays != null && pace.behindDays <= -3;
  return (
    <PageHero
      kicker={`Roadmap · ${p.name}${pace.daysLeft != null && pace.daysLeft >= 0 ? ` · ${pace.daysLeft} days to ${p.exam?.label ?? 'the exam'}` : ''}`}
      l1={noLessons ? 'Your roadmap' : `${headline(pace)}.`} l2={noLessons ? 'fills in as lessons arrive.' : left ? `${pace.donePct}% done.` : 'Time to revise.'}
      sub={noLessons ? 'Your courses don’t have lessons in the portal yet. As they’re added, your roadmap plans them up to your exam.' : left ? <>{pace.lessonsLeft} lesson{pace.lessonsLeft === 1 ? '' : 's'} and {pace.quizzesLeft} quiz{pace.quizzesLeft === 1 ? '' : 'zes'} left.{pace.perDayNeeded ? ` Finishing ${pace.perDayNeeded} a day gets you there with time to revise.` : ''}</> : 'Every lesson is done. Past papers and mock exams are the best use of the time left.'}
      chips={[
        ...(pace.daysLeft != null && pace.daysLeft >= 0 ? [{ t: `${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to the exam`, strong: true }] : []),
        ...(behind ? [{ t: `About ${pace.behindDays} days behind` }] : ahead ? [{ t: `${-(pace.behindDays ?? 0)} days ahead` }] : pace.behindDays != null ? [{ t: 'On schedule' }] : []),
      ]}
      actions={<>
        {href && <Link href={href} className={heroBtnDark}>{now?.kind === 'live' ? 'Next live class' : 'Continue'}</Link>}
        <Link href="/student/calendar" className={href ? heroBtnLine : heroBtn}>Plan my study time</Link>
      </>}
      aside={<>
        <p className={asideLabel}>Where you are</p>
        <div>
          <span className="relative block h-3 rounded-full bg-accent-soft">
            <span className="block h-3 rounded-full bg-[#3F6FE8]" style={{ width: `${pace.donePct}%` }} />
            {pace.expectedPct != null && <span className="absolute -top-1 block h-5 w-0.5 bg-navy" style={{ left: `${pace.expectedPct}%` }} title="Where you should be by now" />}
          </span>
          <p className="mt-1 flex justify-between text-[11.5px] text-muted"><span>{pace.donePct}% done</span>{pace.expectedPct != null && <span>should be {pace.expectedPct}%</span>}</p>
        </div>
        {now && (
          <div className="border-t border-line pt-2.5">
            <p className={asideLabel}>{now.state === 'now' ? 'Now' : 'Next'}</p>
            <p className="mt-1 text-[14px] font-bold leading-snug">{now.title}</p>
            <p className="text-xs text-muted">{now.course}{now.date ? ` · aim by ${new Date(now.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>
          </div>
        )}
      </>}
    />
  );
}
