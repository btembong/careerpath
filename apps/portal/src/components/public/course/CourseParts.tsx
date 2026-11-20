'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Icon, type IconName } from '@/components/ui/Icon';

export interface Lesson { title: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; free: boolean; minutes: number | null }
export interface MiniCourse { slug: string; title: string; subject: string | null; level: string | null; teacher: string | null; teacherPhoto?: string | null; lessons: number; selling: string; price: { amount: number; currency: string } | null }

const TYPE_ICON: Record<Lesson['type'], IconName> = { VIDEO: 'play', TEXT: 'docLine', QUIZ: 'question', LIVE: 'live' };
const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/** Modules you open one by one, or all at once; free lessons say so, the rest show a padlock */
export function CourseContent({ modules, start }: { modules: { title: string; lessons: Lesson[] }[]; start: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  const toggle = () => { const next = !all; ref.current?.querySelectorAll('details').forEach(d => { d.open = next; }); setAll(next); };
  return (
    <>
      <button type="button" onClick={toggle} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D5DDEC] bg-[#FFFFFF] px-3.5 text-[13px] font-bold text-navy hover:bg-subtle">
        {all ? 'Collapse all' : 'Expand all'}<Icon name="chevronDown" size={14} className={clsx('transition-transform', all && 'rotate-180')} />
      </button>
      <div ref={ref} className="order-last mt-3.5 flex w-full flex-col gap-2.5">
        {modules.map((m, i) => {
          const notes = m.lessons.filter(l => l.type === 'TEXT').length, quizzes = m.lessons.filter(l => l.type === 'QUIZ').length, videos = m.lessons.filter(l => l.type === 'VIDEO').length;
          const locked = !m.lessons.some(l => l.free);
          return (
            <details key={m.title + i} open={i === 0} className="group overflow-hidden rounded-xl border border-line bg-[#FFFFFF]">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-[18px] py-4 text-[15.5px] font-bold text-navy hover:bg-[#FAFBFE]">
                <Icon name="chevronRight" size={16} className="flex-shrink-0 text-[#637090] transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1">{i + 1} · {m.title}</span>
                {locked && <Icon name="lock" size={15} className="flex-shrink-0 text-[#9AA6C2]" />}
                <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#637090]">{[videos && s(videos, 'video'), notes && s(notes, 'note'), quizzes && s(quizzes, 'quiz', 'quizzes')].filter(Boolean).join(' · ') || s(m.lessons.length, 'lesson')}</span>
              </summary>
              <ul>
                {m.lessons.map(l => (
                  <li key={l.title} className="flex items-center gap-3 border-t border-[#EEF1F7] py-2.5 pl-[46px] pr-[18px] text-[14px] text-[#3A4A6B]">
                    <Icon name={TYPE_ICON[l.type]} size={16} className="flex-shrink-0 text-[#3F6FE8]" />
                    <span className="min-w-0 flex-1">{l.title}</span>
                    {l.minutes ? <span className="text-xs text-[#9AA6C2]">{l.minutes} min</span> : null}
                    {l.free ? <Link href={start} className="whitespace-nowrap text-[12px] font-extrabold text-[#2F57C9] hover:underline">FREE PREVIEW</Link> : <Icon name="lock" size={14} className="flex-shrink-0 text-[#9AA6C2]" />}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </>
  );
}

/** A long description cut to a few lines, with Read more */
export function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div>
      <p className={clsx('whitespace-pre-line text-[15.5px] leading-[1.65] text-ink2', long && !open && 'line-clamp-4')}>{text}</p>
      {long && <button type="button" onClick={() => setOpen(v => !v)} className="mt-2 text-[13px] font-extrabold uppercase tracking-[0.04em] text-azure-strong hover:underline">{open ? 'Read less' : 'Read more'}</button>}
    </div>
  );
}

const sell = (c: MiniCourse) => c.price ? `${c.price.currency} ${minorToMajor(c.price.amount, c.price.currency).toLocaleString('en-GB')}` : c.selling === 'free' ? 'Free' : 'In a package';

/** More courses for the same exam, with a tab per subject; dark, like the rest of the sidebar's lists */
export function ExamMore({ exam, courses, allHref = '/courses' }: { exam: string; courses: MiniCourse[]; allHref?: string }) {
  const subjects = [...new Set(courses.map(c => c.subject ?? 'Other'))];
  const [tab, setTab] = useState(subjects[0]);
  const shown = courses.filter(c => (c.subject ?? 'Other') === tab).slice(0, 3);
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-[#072061] p-[18px] text-[#FFFFFF]">
      <b className="text-center text-[17px]">More for {exam}</b>
      {subjects.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {subjects.slice(0, 5).map(sub => <button key={sub} type="button" aria-pressed={tab === sub} onClick={() => setTab(sub)} className={clsx('h-8 rounded-full border px-3.5 text-[13px] font-bold', tab === sub ? 'border-[#3F6FE8] bg-[#3F6FE8] text-[#FFFFFF]' : 'border-[rgba(255,255,255,0.3)] text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.08)]')}>{sub}</button>)}
        </div>
      )}
      {shown.map(c => <CourseCard key={c.slug} c={c} dark />)}
      <AllCard href={allHref} dark />
    </div>
  );
}

/**
 * A course in a sidebar list, as KodeKloud shows theirs: the title with a round play button, level and length,
 * then the teacher's photo and name with "Details →". The whole card opens the course.
 */
export function CourseCard({ c, dark }: { c: MiniCourse; dark?: boolean }) {
  return (
    <Link href={`/courses/${c.slug}`} className={clsx('group flex flex-col gap-2.5 rounded-[14px] p-3.5', dark ? 'bg-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.12)]' : 'bg-[#FFFFFF] hover:shadow-[0_10px_24px_rgba(7,32,97,0.12)]')}>
      <span className="flex items-start gap-3">
        <b className={clsx('line-clamp-3 flex-1 text-[15px] leading-snug', dark ? 'text-[#FFFFFF]' : 'text-navy')}>{c.title}</b>
        <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105', dark ? 'bg-[rgba(255,255,255,0.14)] text-[#FFFFFF]' : 'bg-[#EAF0FF] text-[#2F57C9]')}><Icon name="play" size={15} /></span>
      </span>
      <span className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]', dark ? 'text-[#C9D4F2]' : 'text-[#3A4A6B]')}>
        {c.level && <span className="flex items-center gap-1.5"><Icon name="graduate" size={14} />{c.level}</span>}
        {c.lessons > 0 && <span className="flex items-center gap-1.5"><Icon name="list" size={14} />{s(c.lessons, 'lesson')}</span>}
        <span className={clsx('font-bold', c.price ? '' : dark ? 'text-[#9FE0B5]' : 'text-[#17703A]')}>{sell(c)}</span>
      </span>
      <span className="flex items-center gap-2 text-[12.5px]">
        <span className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-extrabold', dark ? 'bg-[rgba(255,255,255,0.15)] text-[#FFFFFF]' : 'bg-[#EAF0FF] text-[#3F6FE8]')}>
          {c.teacherPhoto ? <img src={c.teacherPhoto} alt="" loading="lazy" className="h-full w-full object-cover" /> : (c.teacher ?? 'CareerPath').split(/\s+/).slice(0, 2).map(w => w[0]).join('')}
        </span>
        <span className={clsx('min-w-0 flex-1 truncate font-semibold', dark ? 'text-[#FFFFFF]' : 'text-navy')}>{c.teacher ?? 'CareerPath Africa'}</span>
        <span className={clsx('flex items-center gap-1 font-bold', dark ? 'text-[#7FA3FF]' : 'text-[#2F57C9]')}>Details<Icon name="arrowRight" size={13} /></span>
      </span>
    </Link>
  );
}

/** The last card in a list: everything else, with an arrow */
export function AllCard({ href, dark, label = 'View all courses' }: { href: string; dark?: boolean; label?: string }) {
  return (
    <Link href={href} className={clsx('group flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold', dark ? 'bg-[rgba(255,255,255,0.05)] text-[#7FA3FF] hover:bg-[rgba(255,255,255,0.1)]' : 'bg-[#FFFFFF] text-[#2F57C9] hover:shadow-[0_10px_24px_rgba(7,32,97,0.12)]')}>
      {label}<Icon name="arrowRight" size={20} className="transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
