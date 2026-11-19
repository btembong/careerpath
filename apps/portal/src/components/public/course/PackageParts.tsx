'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';

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
      <button type="button" onClick={toggle} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D5DDEC] bg-[#FFFFFF] px-3.5 text-[13px] font-bold text-navy hover:bg-subtle">
        {all ? 'Collapse all' : 'Expand all'}<Icon name="chevronDown" size={14} className={clsx('transition-transform', all && 'rotate-180')} />
      </button>
      <div ref={ref} className="order-last mt-3.5 flex w-full flex-col gap-2.5">
        {groups.map(([subject, list], i) => (
          <details key={subject} open={i === 0} className="group overflow-hidden rounded-xl border border-line bg-[#FFFFFF]">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-[18px] py-4 text-[15.5px] font-bold text-navy hover:bg-[#FAFBFE]">
              <Icon name="chevronRight" size={16} className="flex-shrink-0 text-[#637090] transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1">{subject}</span>
              <span className="whitespace-nowrap text-[13.5px] font-semibold text-[#637090]">{list.length} course{list.length === 1 ? '' : 's'}</span>
            </summary>
            <ul>
              {list.map(c => {
                const inner = (
                  <>
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-[#EAF0FF] text-[10px] font-extrabold text-[#3F6FE8]">
                      {c.teacher?.avatarUrl ? <img src={c.teacher.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : c.teacher?.name ? initials(c.teacher.name) : 'c'}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate">{short(c.title)}</span><span className="block truncate text-[12px] text-[#9AA6C2]">{c.teacher?.name ?? 'CareerPath Africa'}</span></span>
                    {c.lessons > 0
                      ? <><span className="hidden whitespace-nowrap text-[12.5px] text-[#637090] sm:inline">{c.lessons} lesson{c.lessons === 1 ? '' : 's'}</span><span className="whitespace-nowrap rounded-[5px] bg-[#EAF0FF] px-1.5 py-0.5 text-[11px] font-extrabold text-[#2F57C9]">Ready</span></>
                      : <><span className="hidden whitespace-nowrap text-[12.5px] text-[#637090] sm:inline">on the website</span><span className="whitespace-nowrap rounded-[5px] bg-[#FFF1D6] px-1.5 py-0.5 text-[11px] font-extrabold text-[#8A5A00]">Lessons coming</span></>}
                  </>
                );
                return (
                  <li key={c.id} className="border-t border-[#EEF1F7]">
                    {c.slug ? <Link href={`/courses/${c.slug}`} className="flex items-center gap-3 px-[18px] py-2.5 text-[14px] text-navy hover:bg-[#FAFBFE]">{inner}</Link>
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
