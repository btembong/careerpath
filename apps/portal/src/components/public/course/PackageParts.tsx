'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { AllCard, CourseCard, type MiniCourse } from './CourseParts';
import { Cover } from '@/components/public/PublicChrome';
import { cardTitle } from './BigCourseCard';

export interface PkgCourse {
  id: string; slug: string | null; title: string; coverUrl: string | null; exam: string | null; subject: string | null; level?: string | null;
  teacher: { name: string | null; avatarUrl: string | null } | null; modules: number; lessons: number; quizzes: number; website?: boolean;
  price: { amount: number; currency: string } | null;
}

const short = (t: string) => t.replace(/^Cameroon GCE,?\s*/i, '').replace(/^(Form [A-Za-z\- ]+)[.,:]\s*/, '$1 · ');
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** The courses inside, grouped by subject; each with its teacher and whether its lessons are on the portal yet */
export function PackageCourses({ courses }: { courses: PkgCourse[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  const groups = [...courses.reduce((m, c) => m.set(c.subject ?? 'Other', [...(m.get(c.subject ?? 'Other') ?? []), c]), new Map<string, PkgCourse[]>())].sort((a, b) => b[1].length - a[1].length);
  const toggle = () => { const next = !all; ref.current?.querySelectorAll('details').forEach(d => { d.open = next; }); setAll(next); };
  return (
    <>
      <button type="button" onClick={toggle} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 text-[13px] font-bold text-navy hover:bg-subtle">
        {all ? 'Collapse all' : 'Expand all'}<Icon name="chevronDown" size={14} className={clsx('transition-transform', all && 'rotate-180')} />
      </button>
      <div ref={ref} className="order-last mt-3.5 flex w-full flex-col gap-2.5">
        {groups.map(([subject, list], i) => (
          <details key={subject} open={i === 0} className="group overflow-hidden rounded-xl border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-[18px] py-4 text-[15.5px] font-bold text-navy hover:bg-subtle">
              <Icon name="chevronRight" size={16} className="flex-shrink-0 text-muted transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1">{subject}</span>
              <span className="whitespace-nowrap text-[13.5px] font-semibold text-muted">{list.length} course{list.length === 1 ? '' : 's'}</span>
            </summary>
            <ul>
              {list.map(c => {
                const inner = (
                  <>
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-accent-soft text-[10px] font-extrabold text-azure-strong">
                      {c.teacher?.avatarUrl ? <img src={c.teacher.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : c.teacher?.name ? initials(c.teacher.name) : 'c'}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate">{short(c.title)}</span><span className="block truncate text-[12px] text-muted">{c.teacher?.name ?? 'CareerPath Africa'}</span></span>
                    {c.lessons > 0
                      ? <><span className="hidden whitespace-nowrap text-[12.5px] text-muted sm:inline">{c.lessons} lesson{c.lessons === 1 ? '' : 's'}</span><span className="whitespace-nowrap rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-extrabold text-azure-strong">Ready</span></>
                      : <><span className="hidden whitespace-nowrap text-[12.5px] text-muted sm:inline">on the website</span><span className="whitespace-nowrap rounded-[5px] bg-[#FFF1D6] px-1.5 py-0.5 text-[11px] font-extrabold text-[#8A5A00]">Lessons coming</span></>}
                  </>
                );
                return (
                  <li key={c.id} className="border-t border-line">
                    {c.slug ? <Link href={`/courses/${c.slug}`} className="flex items-center gap-3 px-[18px] py-2.5 text-[14px] text-navy hover:bg-subtle">{inner}</Link>
                      : <span className="flex items-center gap-3 px-[18px] py-2.5 text-[14px] text-navy">{inner}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}

/** A package that's theirs: each course with its progress, and Continue or Start */
export function YourCourses({ rows }: { rows: { id: string; title: string; coverUrl: string | null; subject: string | null; lessons: number; pct: number; next: string | null; href: string }[] }) {
  return (
    <div className="order-last mt-3.5 flex w-full flex-col gap-2.5">
      {rows.map(r => (
        <Link key={r.id} href={r.href} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3 hover:border-azure-strong">
          <span className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-[10px]"><Cover src={r.coverUrl} label={r.subject ?? ''} seed={r.id} className="h-full w-full" /></span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14.5px]">{cardTitle(r.title).title}</b>
            <span className="block truncate text-[12.5px] text-muted">{!r.lessons ? 'Lessons coming from the website' : r.next ? `Next: ${r.next}` : r.pct >= 100 ? 'Finished' : 'Not started'}</span>
            {r.lessons > 0 && <span className="mt-1.5 block h-1.5 max-w-[320px] overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#3F6FE8,#8EA8FF)]" style={{ width: `${Math.max(r.pct, 2)}%` }} /></span>}
          </span>
          {r.lessons > 0 && <span className={clsx('inline-flex h-9 flex-shrink-0 items-center rounded-lg px-3.5 text-[13px] font-extrabold', r.pct > 0 && r.pct < 100 ? 'bg-azure-strong text-on-accent' : 'border border-line text-navy')}>{r.pct >= 100 ? 'Review' : r.pct > 0 ? 'Continue' : 'Start'}</span>}
        </Link>
      ))}
    </div>
  );
}

export interface TeacherMore { name: string | null; slug: string | null; avatarUrl: string | null; courses: MiniCourse[] }

/**
 * More from the package's teachers, as one list: their other courses taken in turn (one from each teacher, then the
 * next), each card showing its teacher. Their faces at the top open their profiles; the last card opens all courses.
 */
export function MoreFromTeachers({ teachers }: { teachers: TeacherMore[] }) {
  if (!teachers.length) return null;
  const mixed: MiniCourse[] = [];
  for (let i = 0; mixed.length < 6 && teachers.some(t => t.courses[i]); i++) for (const t of teachers) if (t.courses[i] && mixed.length < 6) mixed.push(t.courses[i]);
  const first = (n: string | null) => (n ?? '').split(' ')[0];
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-[#EAF0FF] p-[18px]">
      <div className="flex flex-col items-center gap-2">
        <div className="flex">
          {teachers.map((t, i) => {
            const face = (
              <span className={clsx('flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[14px] bg-[#FFFDF8] font-extrabold text-[#3F6FE8] shadow-[0_10px_22px_rgba(7,32,97,0.2)] transition-transform hover:z-10 hover:rotate-0', i ? '-ml-2.5' : '', ['-rotate-[4deg]', 'rotate-3', '-rotate-2', 'rotate-[4deg]', '-rotate-3', 'rotate-2'][i % 6])}>
                {t.avatarUrl ? <img src={t.avatarUrl} alt={t.name ?? ''} className="h-full w-full object-cover" /> : initials(t.name ?? '')}
              </span>
            );
            return t.slug ? <Link key={t.slug} href={`/teachers/${t.slug}`} title={`${t.name}’s profile`} className="relative">{face}</Link> : <span key={i} className="relative">{face}</span>;
          })}
        </div>
        <b className="text-center text-[16px]">{teachers.length > 1 ? 'More from our teachers' : `More from ${teachers[0].name}`}</b>
        <span className="text-center text-[12.5px] text-[#637090]">
          {teachers.map((t, i) => <span key={(t.slug ?? '') + i}>{i ? (i === teachers.length - 1 ? ' and ' : ', ') : ''}{t.slug ? <Link href={`/teachers/${t.slug}`} className="font-bold text-[#2F57C9] hover:underline">{first(t.name)}</Link> : first(t.name)}</span>)}
        </span>
      </div>
      {mixed.map(m => <CourseCard key={m.slug} c={m} />)}
      <AllCard href={teachers.length === 1 && teachers[0].slug ? `/teachers/${teachers[0].slug}` : '/courses'} />
    </div>
  );
}
