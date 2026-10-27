'use client';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

type Tab = 'all' | 'courses' | 'teachers';

interface CourseResult {
  id: string; title: string; shortDescription?: string | null;
  coverUrl?: string | null; teacherName?: string | null; subject?: string | null;
}
interface TeacherResult {
  id: string; name: string | null; avatarUrl?: string | null;
  badge?: string | null; bio?: string | null;
  avgRating?: number | null; reviewCount?: number; courseCount: number;
}

const BADGE_LABELS: Record<string, string> = {
  top_rated:   'Top Rated',
  rising_star: 'Rising Star',
  new:         'New',
};

export default function SearchPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [tab,      setTab]      = useState<Tab>((searchParams.get('type') as Tab) ?? 'all');
  const [q,        setQ]        = useState(searchParams.get('q') ?? '');
  const [inputVal, setInputVal] = useState(q);
  const [results,  setResults]  = useState<{ courses: CourseResult[]; teachers: TeacherResult[] }>({ courses: [], teachers: [] });
  const [loading,  setLoading]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!q.trim()) { setResults({ courses: [], teachers: [] }); return; }
    setLoading(true);
    api.get('/search', { params: { q, type: tab === 'all' ? 'all' : tab } })
      .then(r => setResults(r.data))
      .finally(() => setLoading(false));
  }, [q, tab]);

  function handleInput(val: string) {
    setInputVal(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(val);
      router.replace(`/student/search?q=${encodeURIComponent(val)}&type=${tab}`, { scroll: false });
    }, 350);
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    router.replace(`/student/search?q=${encodeURIComponent(q)}&type=${t}`, { scroll: false });
  }

  const showCourses  = (tab === 'all' || tab === 'courses')  && results.courses.length > 0;
  const showTeachers = (tab === 'all' || tab === 'teachers') && results.teachers.length > 0;
  const empty        = !loading && q.trim() && !showCourses && !showTeachers;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Search" subtitle="Find courses, teachers, and subjects" />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-5 py-5 space-y-4">

        {/* Search input */}
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
          <input
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            placeholder="Search courses, subjects, teachers…"
            autoFocus
            className="w-full rounded-2xl border border-cloud bg-white pl-11 pr-10 py-3 text-sm text-navy placeholder:text-royal/40 outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 shadow-card transition"
          />
          {loading ? (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-azure border-t-transparent rounded-full animate-spin" />
          ) : inputVal && (
            <button
              onClick={() => { setInputVal(''); setQ(''); setResults({ courses: [], teachers: [] }); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-royal/30 hover:text-royal transition">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-cloud bg-white p-1 w-fit">
          {(['all', 'courses', 'teachers'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition capitalize ${
                tab === t ? 'bg-azure text-white shadow-sm' : 'text-royal/60 hover:text-navy'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── COURSES ── */}
        {showCourses && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">
              Courses <span className="text-royal/40">({results.courses.length})</span>
            </p>
            <Card padding="none" className="divide-y divide-cloud">
              {results.courses.map(c => (
                <Link key={c.id} href={`/student/learn/${c.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface transition group">
                  {/* Thumbnail */}
                  <div className="relative w-14 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-cloud">
                    {c.coverUrl ? (
                      <Image src={c.coverUrl} alt={c.title} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="courses" size={18} className="text-azure/40" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy line-clamp-1">{c.title}</p>
                    {c.shortDescription && (
                      <p className="text-xs text-royal/50 line-clamp-1 mt-0.5">{c.shortDescription}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {c.teacherName && <span className="text-xs text-royal/50">{c.teacherName}</span>}
                      {c.subject && <Badge>{c.subject}</Badge>}
                    </div>
                  </div>

                  <Icon name="chevronRight" size={14} className="text-royal/30 group-hover:text-royal/60 flex-shrink-0 transition" />
                </Link>
              ))}
            </Card>
          </div>
        )}

        {/* ── TEACHERS ── */}
        {showTeachers && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">
              Teachers <span className="text-royal/40">({results.teachers.length})</span>
            </p>
            <Card padding="none" className="divide-y divide-cloud">
              {results.teachers.map(t => (
                <Link key={t.id} href={`/student/teachers/${t.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface transition group">
                  {/* Avatar */}
                  <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-cloud">
                    {t.avatarUrl ? (
                      <Image src={t.avatarUrl} alt={t.name ?? ''} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-azure text-white font-bold text-sm">
                        {t.name?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-navy">{t.name}</p>
                      {t.badge && <Badge>{BADGE_LABELS[t.badge] ?? t.badge}</Badge>}
                    </div>
                    {t.bio && <p className="text-xs text-royal/50 line-clamp-1 mt-0.5">{t.bio}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      {t.avgRating && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-500">
                          <Icon name="star" size={12} className="text-amber-400" />
                          {t.avgRating}
                          <span className="font-normal text-royal/40">({t.reviewCount})</span>
                        </span>
                      )}
                      {t.courseCount > 0 && (
                        <span className="text-xs text-royal/50">
                          {t.courseCount} course{t.courseCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <Icon name="chevronRight" size={14} className="text-royal/30 group-hover:text-royal/60 flex-shrink-0 transition" />
                </Link>
              ))}
            </Card>
          </div>
        )}

        {/* No results */}
        {empty && (
          <EmptyState
            icon="search"
            title={`No results for "${q}"`}
            description="Try a different keyword or browse by subject"
          />
        )}

        {/* Idle */}
        {!q.trim() && (
          <EmptyState
            icon="search"
            title="Search anything"
            description="Courses, teachers, subjects, programmes…"
          />
        )}

      </div>
    </div>
  );
}
