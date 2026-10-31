'use client';
import { Suspense as _Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

// The repo's React types don't accept Suspense as a JSX element (same workaround as the login page)
const Suspense = _Suspense as any;

interface Course { id: string; title: string; shortDescription: string | null; teacherName: string | null; subject: string | null; programme: string | null; enrollmentCount: number }
interface Teacher { id: string; name: string; avatarUrl: string | null; bio: string | null; country: string | null; subjects: string[]; avgRating: number | null; reviewCount: number; courseCount: number }
interface Results { courses: Course[]; teachers: Teacher[] }
type Kind = 'all' | 'courses' | 'teachers';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [kind, setKind] = useState<Kind>((params.get('type') as Kind) || 'all');
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    router.replace(`/student/search${term ? `?q=${encodeURIComponent(term)}${kind !== 'all' ? `&type=${kind}` : ''}` : ''}`, { scroll: false });
    if (term.length < 2) { setRes(null); return; }
    setLoading(true);
    timer.current = setTimeout(() => {
      api.get('/search', { params: { q: term } }).then(r => setRes(r.data)).catch(() => setRes({ courses: [], teachers: [] })).finally(() => setLoading(false));
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind]);

  const total = res ? res.courses.length + res.teachers.length : 0;
  const showCourses = kind !== 'teachers' && !!res?.courses.length;
  const showTeachers = kind !== 'courses' && !!res?.teachers.length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Search" subtitle="Courses and teachers" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <label className="flex h-12 items-center gap-2.5 rounded-lg border border-azure bg-white px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="shrink-0 text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search a subject, exam, course or teacher" aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-navy outline-none placeholder:text-muted" />
          <span className="shrink-0 text-[12.5px] text-muted">{loading ? 'Searching…' : res ? `${total} result${total === 1 ? '' : 's'}` : ''}</span>
        </label>
        {res && total > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[13px]">
            {([['all', 'All', total], ['courses', 'Courses', res.courses.length], ['teachers', 'Teachers', res.teachers.length]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                className={clsx('rounded-full px-3 py-1.5', kind === k ? 'bg-navy font-semibold text-white' : 'border border-line bg-white text-navy hover:bg-subtle')}>{l} {n}</button>
            ))}
          </div>
        )}

        {q.trim().length < 2 ? (
          <div className="rounded-lg border border-line bg-white px-5 py-8 text-center">
            <p className="text-[14px] font-semibold text-navy">What do you want to study?</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {['Mathematics', 'Biology', 'Physics', 'English', 'TEF Canada', 'Nursing'].map(s => (
                <button key={s} onClick={() => setQ(s)} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-navy hover:bg-subtle">{s}</button>
              ))}
            </div>
          </div>
        ) : res && !total && !loading ? (
          <div className="rounded-lg border border-line bg-white px-5 py-8 text-center text-[13.5px] text-ink2">
            Nothing matches “{q.trim()}”. Try a subject or exam name, or <Link href="/student/catalogue" className="font-semibold text-azure-strong hover:underline">browse the catalogue</Link>.
          </div>
        ) : <>
          {showCourses && <>
            <h2 className="mt-1 text-[16px] font-bold text-navy">Courses</h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {res!.courses.map(c => (
                <Link key={c.id} href={`/student/courses/${c.id}`} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white px-4 py-3.5 hover:border-azure">
                  {(c.programme || c.subject) && <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{['Course', c.programme, c.subject].filter(Boolean).join(' · ')}</span>}
                  <p className="text-[14.5px] font-bold text-navy">{c.title}</p>
                  {c.shortDescription && <p className="line-clamp-2 text-[13px] text-ink2">{c.shortDescription}</p>}
                  <p className="mt-1 text-[12.5px] text-muted">{[c.teacherName, `${c.enrollmentCount} student${c.enrollmentCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p>
                </Link>
              ))}
            </div>
          </>}
          {showTeachers && <>
            <h2 className="mt-1 text-[16px] font-bold text-navy">Teachers</h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {res!.teachers.map(t => (
                <Link key={t.id} href={`/student/teachers/${t.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3.5 hover:border-azure">
                  {t.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={t.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    : <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-navy">{initials(t.name)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy">{t.name}</p>
                    <p className="mt-px truncate text-[12.5px] text-muted">{[t.country, `${t.courseCount} course${t.courseCount === 1 ? '' : 's'}`, t.avgRating ? `★ ${t.avgRating.toFixed(1)} (${t.reviewCount})` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-[13px] font-semibold text-azure-strong">View</span>
                </Link>
              ))}
            </div>
          </>}
        </>}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><SearchInner /></Suspense>;
}
