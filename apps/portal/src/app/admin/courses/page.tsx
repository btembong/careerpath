'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import api from '@/lib/api';

/* ── Types ──────────────────────────────────────────────────────── */
interface Country { id: string; name: string; code: string; }
interface ProgrammeCountry { id: string; code: string; name: string; }
interface Programme { id: string; name: string; shortName: string | null; countries?: ProgrammeCountry[]; }
interface Subject { id: string; name: string; }
interface Level   { id: string; name: string; }
interface PlatformCourse {
  id: string; title: string; status: string;
  source: 'NATIVE' | 'WORDPRESS';
  coverUrl?: string | null;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject:   { id: string; name: string } | null;
  level:     { id: string; name: string } | null;
  teacher:   { id: string; email: string };
  _count:    { modules: number; enrollments: number };
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  PUBLISHED: 'active', PENDING_REVIEW: 'muted', DRAFT: 'default', ARCHIVED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Published', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft', ARCHIVED: 'Archived',
};

/* ── Helpers ─────────────────────────────────────────────────────── */
function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function waitBadge(dateStr?: string) {
  if (!dateStr) return null;
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (hrs > 72)  return { label: 'Overdue', cls: 'bg-red-100 text-red-600' };
  if (hrs > 24)  return { label: 'Waiting', cls: 'bg-amber-100 text-amber-600' };
  return null;
}

function Paginator({ page, total, perPage, onChange }: {
  page: number; total: number; perPage: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-cloud">
      <span className="text-[11px] text-royal/40">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-cloud text-royal/40 hover:bg-cloud disabled:opacity-30 transition">
          <Icon name="chevronRight" size={12} className="rotate-180" />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = pages <= 5 ? i + 1 : page <= 3 ? i + 1 : page + i - 2;
          if (p < 1 || p > pages) return null;
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold transition ${
                p === page ? 'bg-azure text-white' : 'border border-cloud text-navy hover:bg-cloud'
              }`}>
              {p}
            </button>
          );
        })}
        <button disabled={page === pages} onClick={() => onChange(page + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-cloud text-royal/40 hover:bg-cloud disabled:opacity-30 transition">
          <Icon name="chevronRight" size={12} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════ */
export default function AdminCoursesLandingPage() {
  const [courses,    setCourses]    = useState<PlatformCourse[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [countries,  setCountries]  = useState<Country[]>([]);
  const [allLevels,  setAllLevels]  = useState<Level[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [rejectId,   setRejectId]   = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting,  setRejecting]  = useState(false);
  const [migrateId,  setMigrateId]  = useState<string | null>(null);
  const [migrating,  setMigrating]  = useState(false);
  const [coverImageId,  setCoverImageId]  = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [savingCover,   setSavingCover]   = useState(false);

  /* Stats country tab */
  const [activeTab, setActiveTab] = useState('ALL');

  /* Table state */
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('ALL');
  const [sourceFilter,  setSourceFilter]  = useState('ALL');
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [tablePage,     setTablePage]     = useState(1);

  /* Bulk-assign panel */
  const [bulkOpen,       setBulkOpen]       = useState(false);
  const [bulkSelected,   setBulkSelected]   = useState<Set<string>>(new Set());
  const [bulkProgramme,  setBulkProgramme]  = useState('');
  const [bulkSubjects,   setBulkSubjects]   = useState<Subject[]>([]);
  const [bulkSubject,    setBulkSubject]     = useState('');
  const [bulkLevel,      setBulkLevel]      = useState('');
  const [bulkSaving,     setBulkSaving]     = useState(false);

  /* Pending queue pagination */
  const [queuePage, setQueuePage] = useState(1);
  const QUEUE_PER_PAGE = 5;
  const TABLE_PER_PAGE = 10;

  useEffect(() => {
    Promise.all([
      api.get('/platform-courses').then(r => setCourses(r.data ?? [])),
      api.get('/catalogue/programmes').then(r => setProgrammes(r.data ?? [])),
      api.get('/countries/admin/countries').then(r => setCountries(r.data ?? [])).catch(() => {}),
      api.get('/catalogue/education-systems').then(r => {
        const levels: Level[] = (r.data ?? []).flatMap((sys: any) => sys.levels ?? []);
        setAllLevels(levels);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function rejectCourse(id: string) {
    setRejecting(true);
    try {
      await api.post(`/platform-courses/${id}/reject`, { notes: rejectNote.trim() || undefined });
      notify.success('Course rejected — teacher notified');
      setRejectId(null); setRejectNote('');
      const r = await api.get('/platform-courses');
      setCourses(r.data ?? []);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to reject');
    } finally { setRejecting(false); }
  }

  async function syncWp() {
    setSyncing(true);
    try {
      const r = await api.post('/platform-courses/wp-sync');
      notify.success(`Synced: ${r.data.created} new, ${r.data.updated} updated`);
      const r2 = await api.get('/platform-courses');
      setCourses(r2.data ?? []);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'WP sync failed');
    } finally { setSyncing(false); }
  }

  async function handleBulkProgrammeChange(progId: string) {
    setBulkProgramme(progId);
    setBulkSubject('');
    setBulkSubjects([]);
    if (!progId) return;
    const sRes = await api.get(`/catalogue/programmes/${progId}/subjects`).catch(() => ({ data: [] }));
    // subjects come back grouped by category — flatten them
    const raw = sRes.data ?? [];
    const flat: Subject[] = Array.isArray(raw) && raw[0]?.subjects
      ? raw.flatMap((g: any) => g.subjects ?? [])
      : raw;
    setBulkSubjects(flat);
  }

  async function handleBulkAssign() {
    if (!bulkSelected.size || !bulkProgramme) return;
    setBulkSaving(true);
    try {
      const r = await api.patch('/platform-courses/bulk-assign', {
        courseIds:   Array.from(bulkSelected),
        programmeId: bulkProgramme,
        ...(bulkSubject && { subjectId: bulkSubject }),
        ...(bulkLevel   && { levelId:   bulkLevel   }),
      });
      notify.success(`${r.data.updated} course${r.data.updated !== 1 ? 's' : ''} assigned`);
      setBulkOpen(false); setBulkSelected(new Set()); setBulkProgramme(''); setBulkSubjects([]); setBulkSubject(''); setBulkLevel('');
      const r2 = await api.get('/platform-courses');
      setCourses(r2.data ?? []);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Bulk assign failed');
    } finally { setBulkSaving(false); }
  }

  async function publishCourse(id: string) {
    setPublishing(id);
    try {
      await api.post(`/platform-courses/${id}/publish`);
      notify.success('Course published');
      const r = await api.get('/platform-courses');
      setCourses(r.data ?? []);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed');
    } finally { setPublishing(null); }
  }

  async function saveCoverImage() {
    if (!coverImageId) return;
    setSavingCover(true);
    try {
      await api.patch(`/platform-courses/${coverImageId}`, { coverUrl: coverImageUrl.trim() || null });
      setCourses(prev => prev.map(c => c.id === coverImageId ? { ...c, coverUrl: coverImageUrl.trim() || null } : c));
      notify.success('Cover image updated');
      setCoverImageId(null); setCoverImageUrl('');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save cover image');
    } finally { setSavingCover(false); }
  }

  async function migrateToNative() {
    if (!migrateId) return;
    setMigrating(true);
    try {
      await api.patch(`/platform-courses/${migrateId}`, { source: 'NATIVE', wpCourseUrl: null });
      setCourses(prev => prev.map(c => c.id === migrateId ? { ...c, source: 'NATIVE' } : c));
      notify.success('Course migrated to Native — open the builder to add modules and lessons');
      setMigrateId(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Migration failed');
    } finally { setMigrating(false); }
  }

  /* ── Per-country map (needed by useMemo below) ── */
  const progCountryMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    programmes.forEach(p => {
      (p.countries ?? []).forEach(c => {
        if (!map[c.id]) map[c.id] = [];
        map[c.id].push(p.id);
      });
    });
    return map;
  }, [programmes]);

  /* ── Courses scoped to active stats tab ── */
  const tabCourses = useMemo(() => {
    if (activeTab === 'ALL') return courses;
    const progIds = new Set(progCountryMap[activeTab] ?? []);
    return courses.filter(c => c.programme && progIds.has(c.programme.id));
  }, [courses, activeTab, progCountryMap]);

  /* ── Filtered courses for table ── */
  const filteredCourses = useMemo(() => {
    let list = courses;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.teacher.email.toLowerCase().includes(q) ||
        (c.programme?.name ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'ALL') list = list.filter(c => c.status === statusFilter);
    if (sourceFilter !== 'ALL') list = list.filter(c => c.source === sourceFilter);
    if (countryFilter) {
      const progIds = new Set(progCountryMap[countryFilter] ?? []);
      list = list.filter(c => c.programme && progIds.has(c.programme.id));
    }
    return list;
  }, [courses, search, statusFilter, sourceFilter, countryFilter, progCountryMap]);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  /* ── Derived data (scoped to active tab) ── */
  const total         = tabCourses.length;
  const wordpress     = tabCourses.filter(c => c.source === 'WORDPRESS').length;
  const published     = tabCourses.filter(c => c.status === 'PUBLISHED').length;
  const pending       = tabCourses.filter(c => c.status === 'PENDING_REVIEW');
  const untagged      = tabCourses.filter(c => !c.programme).length;
  const totalEnrolled = tabCourses.reduce((n, c) => n + c._count.enrollments, 0);

  const countryStats = countries.map(country => {
    const progIds = new Set(progCountryMap[country.id] ?? []);
    const cc = courses.filter(c => c.programme && progIds.has(c.programme.id));
    return {
      ...country,
      total:     cc.length,
      published: cc.filter(c => c.status === 'PUBLISHED').length,
      pending:   cc.filter(c => c.status === 'PENDING_REVIEW').length,
      draft:     cc.filter(c => c.status === 'DRAFT').length,
      archived:  cc.filter(c => c.status === 'ARCHIVED').length,
      enrolled:  cc.reduce((n, c) => n + c._count.enrollments, 0),
    };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const tableStart = (tablePage - 1) * TABLE_PER_PAGE;
  const tableRows  = filteredCourses.slice(tableStart, tableStart + TABLE_PER_PAGE);

  const queueStart = (queuePage - 1) * QUEUE_PER_PAGE;
  const queueRows  = pending.slice(queueStart, queueStart + QUEUE_PER_PAGE);

  return (
    <>
    <div className="flex flex-col min-h-full">
      <Topbar title="Courses" subtitle="Overview, review queue & course management" />

      <div className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">

        {/* ── Stats header: label + country tabs ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-navy">Platform Statistics</p>
            {activeTab !== 'ALL' && (
              <p className="text-[10px] text-royal/40 mt-0.5">
                Filtered: {countryStats.find(c => c.id === activeTab)?.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${
                activeTab === 'ALL'
                  ? 'bg-navy text-white'
                  : 'bg-white border border-cloud text-royal/60 hover:border-azure hover:text-azure'
              }`}>
              All
            </button>
            {countryStats.slice(0, 6).map(c => (
              <button
                key={c.id}
                onClick={() => setActiveTab(c.id)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition ${
                  activeTab === c.id
                    ? 'bg-azure text-white'
                    : 'bg-white border border-cloud text-royal/60 hover:border-azure hover:text-azure'
                }`}>
                {c.code}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Courses',   value: total,           icon: 'courses',  accent: 'bg-azure/10 text-azure'         },
            { label: 'Published',       value: published,       icon: 'check',    accent: 'bg-royal/10 text-royal'          },
            { label: 'Pending Review',  value: pending.length,  icon: 'clock',    accent: pending.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-cloud text-royal/40' },
            { label: 'WordPress',       value: wordpress,       icon: 'live',     accent: 'bg-orange-100 text-orange-500'   },
            { label: 'Enrolled',        value: totalEnrolled,   icon: 'graduate', accent: 'bg-azure/10 text-azure'          },
          ].map(s => (
            <Card key={s.label} padding="none">
              <div className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${s.accent}`}>
                  <Icon name={s.icon as any} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-black text-navy leading-none">{s.value}</p>
                  <p className="text-[10px] font-semibold text-royal/50 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: pending queue + courses table */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── Pending review queue ── */}
            <Card padding="none">
              <div className="flex items-center justify-between px-5 py-4 border-b border-cloud">
                <div className="flex items-center gap-2.5">
                  <Icon name="clock" size={15} className="text-amber-500" />
                  <p className="text-sm font-bold text-navy">Pending Review</p>
                  {pending.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-amber-500 px-1.5 text-[10px] font-black text-white">
                      {pending.length}
                    </span>
                  )}
                </div>
                {pending.length > QUEUE_PER_PAGE && (
                  <span className="text-[11px] text-royal/40">Page {queuePage} of {Math.ceil(pending.length / QUEUE_PER_PAGE)}</span>
                )}
              </div>

              {pending.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-3">
                    <Icon name="check" size={20} className="text-green-600" />
                  </span>
                  <p className="text-sm font-bold text-navy">All clear</p>
                  <p className="text-xs text-royal/50 mt-1">No courses waiting for review right now</p>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-cloud">
                    {queueRows.map(course => {
                      const wait = waitBadge(course.updatedAt ?? course.createdAt);
                      return (
                        <li key={course.id} className="flex items-start gap-4 px-5 py-4 hover:bg-surface/50 transition">
                          {/* Teacher avatar */}
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-azure text-sm font-black">
                            {course.teacher.email[0].toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {course.source === 'WORDPRESS' && (
                                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-600 uppercase">WP</span>
                              )}
                              {wait && (
                                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${wait.cls}`}>{wait.label}</span>
                              )}
                              {course.programme && (
                                <span className="text-[10px] font-semibold text-azure bg-azure/10 rounded px-1.5 py-0.5">
                                  {course.programme.shortName ?? course.programme.name}
                                </span>
                              )}
                              {course.subject && (
                                <span className="text-[10px] text-royal/40">{course.subject.name}</span>
                              )}
                            </div>
                            <Link href={`/admin/courses/${course.id}`}
                              className="text-sm font-bold text-navy hover:text-azure transition line-clamp-1">
                              {course.title}
                            </Link>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-royal/40">
                              <span>{course.teacher.email}</span>
                              <span>·</span>
                              <span>{course._count.modules} modules</span>
                              <span>·</span>
                              <span>{course._count.enrollments} enrolled</span>
                              {(course.updatedAt ?? course.createdAt) && (
                                <>
                                  <span>·</span>
                                  <span>{timeAgo(course.updatedAt ?? course.createdAt)}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            <Button size="sm" loading={publishing === course.id}
                              onClick={() => publishCourse(course.id)}>
                              Publish
                            </Button>
                            <button
                              onClick={() => { setRejectId(course.id); setRejectNote(''); }}
                              className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition">
                              Reject
                            </button>
                            <Link href={`/admin/courses/${course.id}`}>
                              <Button size="sm" variant="secondary">Review</Button>
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Paginator page={queuePage} total={pending.length} perPage={QUEUE_PER_PAGE} onChange={p => setQueuePage(p)} />
                </>
              )}
            </Card>

            {/* ── Courses table ── */}
            <Card padding="none">
              {/* Table header */}
              <div className="px-5 py-4 border-b border-cloud space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-navy flex-shrink-0">All Courses</p>
                  {countryFilter && (
                    <button onClick={() => { setCountryFilter(null); setTablePage(1); }}
                      className="flex items-center gap-1.5 rounded-md bg-azure/10 px-2.5 py-1 text-xs font-semibold text-azure hover:bg-azure/20 transition">
                      {countries.find(c => c.id === countryFilter)?.name}
                      <Icon name="close" size={10} />
                    </button>
                  )}
                  <div className="relative flex-1 max-w-xs ml-auto">
                    <Icon name="search" size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
                    <input
                      value={search}
                      onChange={e => { setSearch(e.target.value); setTablePage(1); }}
                      placeholder="Search title, teacher, programme…"
                      className="w-full rounded-md border border-cloud bg-surface pl-7 pr-3 py-1.5 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/30"
                    />
                  </div>
                </div>

                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status tabs */}
                  <div className="flex gap-1">
                    {['ALL', 'PUBLISHED', 'PENDING_REVIEW', 'DRAFT', 'ARCHIVED'].map(s => (
                      <button key={s} onClick={() => { setStatusFilter(s); setTablePage(1); }}
                        className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                          statusFilter === s
                            ? s === 'PENDING_REVIEW' ? 'bg-amber-500 text-white'
                            : s === 'PUBLISHED'      ? 'bg-green-600 text-white'
                            : 'bg-azure text-white'
                            : 'bg-cloud text-royal/50 hover:bg-cloud/80'
                        }`}>
                        {s === 'ALL' ? 'All' : s === 'PENDING_REVIEW' ? 'Review' : STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>

                  <div className="h-4 w-px bg-cloud" />

                  {/* Source toggle */}
                  <div className="flex gap-1">
                    {(['ALL', 'NATIVE', 'WORDPRESS'] as const).map(s => (
                      <button key={s} onClick={() => { setSourceFilter(s); setTablePage(1); }}
                        className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                          sourceFilter === s
                            ? s === 'WORDPRESS' ? 'bg-orange-500 text-white' : 'bg-royal text-white'
                            : 'bg-cloud text-royal/50 hover:bg-cloud/80'
                        }`}>
                        {s === 'ALL' ? 'All sources' : s === 'NATIVE' ? 'Native' : 'WordPress'}
                      </button>
                    ))}
                  </div>

                  <span className="ml-auto text-[11px] text-royal/40 flex-shrink-0">
                    {filteredCourses.length} result{filteredCourses.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Table */}
              {tableRows.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Icon name="courses" size={28} className="text-royal/20 mb-2" />
                  <p className="text-sm font-semibold text-navy">No courses match</p>
                  <p className="text-xs text-royal/40 mt-1">Try adjusting your search or filters</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-cloud bg-surface">
                          <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/50">Course</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/50 hidden sm:table-cell">Programme</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/50 hidden md:table-cell">Teacher</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/50">Status</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-royal/50 hidden sm:table-cell">Enrolled</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-royal/50 hidden md:table-cell">Modules</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cloud/60">
                        {tableRows.map(course => (
                          <tr key={course.id} className="hover:bg-surface/60 transition group">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                {course.source === 'WORDPRESS' && (
                                  <span className="rounded bg-orange-100 px-1 py-0.5 text-[9px] font-bold text-orange-600 uppercase flex-shrink-0">WP</span>
                                )}
                                <Link href={`/admin/courses/${course.id}`}
                                  className="font-semibold text-navy hover:text-azure transition line-clamp-1 leading-snug">
                                  {course.title}
                                </Link>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {course.programme ? (
                                <span className="text-royal/60 truncate">
                                  {course.programme.shortName ?? course.programme.name}
                                </span>
                              ) : (
                                <span className="text-royal/30 italic">Untagged</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <div className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-azure text-[9px] font-black">
                                  {course.teacher.email[0].toUpperCase()}
                                </span>
                                <span className="text-royal/60 truncate max-w-[140px]">{course.teacher.email}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={STATUS_BADGE[course.status]}>
                                {STATUS_LABEL[course.status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell">
                              <span className="font-semibold text-navy">{course._count.enrollments}</span>
                            </td>
                            <td className="px-4 py-3 text-right hidden md:table-cell">
                              <span className="text-royal/50">{course._count.modules}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                {course.source === 'WORDPRESS' && (
                                  <>
                                    <button
                                      onClick={() => { setCoverImageId(course.id); setCoverImageUrl(course.coverUrl ?? ''); }}
                                      className="flex items-center gap-1 rounded-md bg-azure/10 border border-azure/20 px-2 py-1 text-[10px] font-bold text-azure hover:bg-azure/20 transition whitespace-nowrap">
                                      {course.coverUrl ? 'Edit cover' : 'Set cover'}
                                    </button>
                                    <button
                                      onClick={() => setMigrateId(course.id)}
                                      className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100 transition whitespace-nowrap">
                                      Migrate to Native
                                    </button>
                                  </>
                                )}
                                <Link href={`/admin/courses/${course.id}`}
                                  className="text-azure hover:text-royal transition text-[10px] font-semibold whitespace-nowrap">
                                  View →
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Paginator page={tablePage} total={filteredCourses.length} perPage={TABLE_PER_PAGE} onChange={p => setTablePage(p)} />
                </>
              )}
            </Card>
          </div>

          {/* RIGHT: quick actions + country stats */}
          <div className="space-y-5">

            {/* Quick actions */}
            <Card padding="none">
              <div className="px-5 py-4 border-b border-cloud">
                <p className="text-sm font-bold text-navy">Quick Actions</p>
              </div>
              <div className="p-3 space-y-2">
                <Link href="/admin/courses/manage" className="block">
                  <div className="flex items-center gap-3 rounded-lg border border-cloud px-4 py-3 hover:bg-cloud/50 transition group">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-azure/10 text-azure">
                      <Icon name="notebook" size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-navy group-hover:text-azure transition">Manage Programmes & Courses</p>
                      <p className="text-[10px] text-royal/40">3-panel editor</p>
                    </div>
                    <Icon name="chevronRight" size={13} className="text-royal/30 flex-shrink-0" />
                  </div>
                </Link>

                <button onClick={syncWp} disabled={syncing}
                  className="flex w-full items-center gap-3 rounded-lg border border-cloud px-4 py-3 hover:bg-cloud/50 transition group disabled:opacity-50">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-royal/10 text-royal">
                    {syncing
                      ? <div className="h-4 w-4 rounded-full border-2 border-royal/30 border-t-royal animate-spin" />
                      : <Icon name="live" size={15} />
                    }
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-navy group-hover:text-royal transition">
                      {syncing ? 'Syncing WordPress…' : 'Sync WordPress Courses'}
                    </p>
                    <p className="text-[10px] text-royal/40">{wordpress} WP courses imported</p>
                  </div>
                  {!syncing && <Icon name="chevronRight" size={13} className="text-royal/30 flex-shrink-0" />}
                </button>
              </div>
            </Card>

            {/* Untagged alert / Bulk assign panel */}
            {untagged > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                <button
                  onClick={() => setBulkOpen(o => !o)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 hover:bg-amber-100 transition text-left">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                    <Icon name="tag" size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-700">{untagged} untagged course{untagged !== 1 ? 's' : ''}</p>
                    <p className="text-[10px] text-amber-500 mt-0.5">{bulkOpen ? 'Click to close ↑' : 'Click to bulk-assign programme →'}</p>
                  </div>
                  <Icon name={bulkOpen ? 'chevronDown' : 'chevronRight'} size={13} className="text-amber-400 flex-shrink-0" />
                </button>

                {bulkOpen && (() => {
                  const untaggedCourses = courses.filter(c => !c.programme);
                  const allSelected = untaggedCourses.length > 0 && untaggedCourses.every(c => bulkSelected.has(c.id));
                  return (
                    <div className="border-t border-amber-200 bg-white p-4 space-y-4">
                      {/* Course list with checkboxes */}
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-cloud divide-y divide-cloud">
                        <label className="flex items-center gap-2 px-3 py-2 bg-cloud/30 cursor-pointer">
                          <input type="checkbox" checked={allSelected}
                            onChange={() => {
                              if (allSelected) setBulkSelected(new Set());
                              else setBulkSelected(new Set(untaggedCourses.map(c => c.id)));
                            }}
                            className="accent-azure" />
                          <span className="text-[11px] font-bold text-royal/60 uppercase tracking-widest">
                            Select all ({untaggedCourses.length})
                          </span>
                        </label>
                        {untaggedCourses.map(c => (
                          <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-azure/5 transition">
                            <input type="checkbox" checked={bulkSelected.has(c.id)}
                              onChange={() => {
                                const next = new Set(bulkSelected);
                                next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                setBulkSelected(next);
                              }}
                              className="accent-azure flex-shrink-0" />
                            <span className="text-xs text-navy truncate flex-1">{c.title}</span>
                            {c.source === 'WORDPRESS' && (
                              <span className="rounded bg-orange-100 px-1 py-0.5 text-[9px] font-bold text-orange-600 flex-shrink-0">WP</span>
                            )}
                          </label>
                        ))}
                      </div>

                      {/* Assignment fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">
                            Programme <span className="text-red-400">*</span>
                          </label>
                          <div className="relative">
                            <Icon name="courses" size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                            <select value={bulkProgramme} onChange={e => handleBulkProgrammeChange(e.target.value)}
                              className="w-full appearance-none rounded-lg border border-cloud bg-white pl-8 pr-8 py-2 text-xs text-navy outline-none focus:border-azure cursor-pointer">
                              <option value="">Select programme…</option>
                              {programmes.map(p => (
                                <option key={p.id} value={p.id}>{p.shortName ?? p.name}</option>
                              ))}
                            </select>
                            <Icon name="chevronDown" size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Subject</label>
                          <div className="relative">
                            <select value={bulkSubject} onChange={e => setBulkSubject(e.target.value)}
                              disabled={!bulkSubjects.length}
                              className="w-full appearance-none rounded-lg border border-cloud bg-white pl-3 pr-8 py-2 text-xs text-navy outline-none focus:border-azure disabled:opacity-50 cursor-pointer">
                              <option value="">None</option>
                              {bulkSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <Icon name="chevronDown" size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Level</label>
                          <div className="relative">
                            <select value={bulkLevel} onChange={e => setBulkLevel(e.target.value)}
                              className="w-full appearance-none rounded-lg border border-cloud bg-white pl-3 pr-8 py-2 text-xs text-navy outline-none focus:border-azure cursor-pointer">
                              <option value="">None</option>
                              {allLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <Icon name="chevronDown" size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" loading={bulkSaving}
                          onClick={handleBulkAssign}
                          disabled={!bulkSelected.size || !bulkProgramme}>
                          Assign {bulkSelected.size > 0 ? `${bulkSelected.size} course${bulkSelected.size !== 1 ? 's' : ''}` : ''}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setBulkOpen(false); setBulkSelected(new Set()); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Per-country stats */}
            <Card padding="none">
              <div className="px-5 py-4 border-b border-cloud">
                <p className="text-sm font-bold text-navy">Courses by Country</p>
                <p className="text-[10px] text-royal/40 mt-0.5">Click a country to filter the table</p>
              </div>

              {countryStats.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Icon name="countries" size={24} className="text-royal/20 mx-auto mb-2" />
                  <p className="text-xs text-royal/40">No country data — tag programmes to countries</p>
                </div>
              ) : (
                <ul className="divide-y divide-cloud">
                  {countryStats.map(c => {
                    const isActive = countryFilter === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            setCountryFilter(isActive ? null : c.id);
                            setTablePage(1);
                          }}
                          className={`w-full px-5 py-4 text-left transition ${
                            isActive ? 'bg-azure/5 border-l-2 border-l-azure' : 'hover:bg-surface'
                          }`}>
                          {/* Country header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black rounded px-1.5 py-0.5 uppercase tracking-widest ${
                                isActive ? 'bg-azure text-white' : 'bg-navy text-white'
                              }`}>
                                {c.code}
                              </span>
                              <span className="text-xs font-semibold text-navy">{c.name}</span>
                            </div>
                            <span className={`text-sm font-black ${isActive ? 'text-azure' : 'text-navy'}`}>{c.total}</span>
                          </div>

                          {/* Stacked bar */}
                          <div className="h-2 w-full rounded-full bg-cloud overflow-hidden flex gap-px mb-2">
                            {c.published > 0 && (
                              <div className="h-full bg-green-500 transition-all" style={{ width: `${(c.published / c.total) * 100}%` }} />
                            )}
                            {c.pending > 0 && (
                              <div className="h-full bg-amber-400 transition-all" style={{ width: `${(c.pending / c.total) * 100}%` }} />
                            )}
                            {c.draft > 0 && (
                              <div className="h-full bg-cloud/60 border border-cloud transition-all" style={{ width: `${(c.draft / c.total) * 100}%` }} />
                            )}
                          </div>

                          {/* Legend */}
                          <div className="flex items-center gap-3 text-[10px] text-royal/50 flex-wrap">
                            {c.published > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                                {c.published} live
                              </span>
                            )}
                            {c.pending > 0 && (
                              <span className="flex items-center gap-1 text-amber-500 font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                                {c.pending} review
                              </span>
                            )}
                            {c.draft > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-cloud border border-royal/20 inline-block" />
                                {c.draft} draft
                              </span>
                            )}
                            <span className="ml-auto">
                              <Icon name="graduate" size={9} className="inline mr-0.5" />{c.enrolled}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>

    {/* Migrate to Native confirm modal */}
    {migrateId && (() => {
      const course = courses.find(c => c.id === migrateId);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => !migrating && setMigrateId(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 mb-4">
              <Icon name="courses" size={22} className="text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-navy mb-1">Migrate to Native?</p>
            <p className="text-xs text-royal/60 leading-relaxed mb-2">
              <strong className="text-navy">{course?.title}</strong> will be switched from WordPress to Native.
            </p>
            <ul className="text-xs text-royal/60 space-y-1 mb-5 list-none">
              <li className="flex items-start gap-2"><Icon name="check" size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" /> Course will use the native player — no more WP redirect</li>
              <li className="flex items-start gap-2"><Icon name="check" size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" /> Quizzes, assignments, progress &amp; certificates become available</li>
              <li className="flex items-start gap-2"><Icon name="clock" size={12} className="text-amber-500 mt-0.5 flex-shrink-0" /> You must open the course builder to add modules and lessons</li>
              <li className="flex items-start gap-2"><Icon name="close" size={12} className="text-red-400 mt-0.5 flex-shrink-0" /> The external WP course URL will be cleared</li>
            </ul>
            <div className="flex gap-2">
              <button
                onClick={migrateToNative}
                disabled={migrating}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                {migrating ? 'Migrating…' : 'Migrate to Native'}
              </button>
              <Link
                href={`/admin/courses/${migrateId}`}
                onClick={() => setMigrateId(null)}
                className="flex items-center justify-center rounded-xl border border-cloud px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition">
                Open builder
              </Link>
              <button onClick={() => setMigrateId(null)} disabled={migrating}
                className="rounded-xl border border-cloud px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Set cover image modal */}
    {coverImageId && (() => {
      const course = courses.find(c => c.id === coverImageId);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => !savingCover && setCoverImageId(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-azure/10 mb-4">
              <Icon name="courses" size={22} className="text-azure" />
            </div>
            <p className="text-sm font-bold text-navy mb-1">Set cover image</p>
            <p className="text-xs text-royal/60 mb-4">
              Paste the image URL from WordPress media library for <strong className="text-navy">{course?.title}</strong>.
            </p>

            {/* Preview */}
            {coverImageUrl.trim() && (
              <div className="mb-4 h-32 w-full rounded-xl overflow-hidden border border-cloud bg-surface">
                <img src={coverImageUrl.trim()} alt="Preview" className="h-full w-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            )}

            <input
              type="url"
              value={coverImageUrl}
              onChange={e => setCoverImageUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-content/uploads/image.jpg"
              className="w-full rounded-xl border border-cloud px-3 py-2.5 text-sm text-navy placeholder:text-royal/30 outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={saveCoverImage}
                disabled={savingCover}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-azure px-4 py-2.5 text-sm font-semibold text-white hover:bg-royal transition disabled:opacity-50">
                {savingCover ? 'Saving…' : 'Save cover'}
              </button>
              {coverImageUrl && (
                <button
                  onClick={() => setCoverImageUrl('')}
                  disabled={savingCover}
                  className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-50">
                  Remove
                </button>
              )}
              <button onClick={() => { setCoverImageId(null); setCoverImageUrl(''); }} disabled={savingCover}
                className="rounded-xl border border-cloud px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Reject modal */}
    {rejectId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => setRejectId(null)} />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm font-bold text-navy mb-1">Reject course?</p>
          <p className="text-xs text-royal/50 mb-4">The teacher will be notified and the course returned to Draft.</p>
          <textarea
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="Reason for rejection (optional — sent to teacher)"
            rows={3}
            className="w-full rounded-xl border border-cloud bg-surface px-3 py-2.5 text-sm text-navy outline-none focus:border-azure resize-none placeholder:text-royal/40 mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={() => rejectCourse(rejectId)}
              disabled={rejecting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-50">
              {rejecting ? 'Rejecting…' : 'Confirm reject'}
            </button>
            <button onClick={() => setRejectId(null)}
              className="rounded-xl border border-cloud px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
