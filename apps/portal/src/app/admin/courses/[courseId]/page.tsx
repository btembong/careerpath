'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

interface Lesson {
  id: string; title: string; type: string;
  durationSecs: number | null; isFree: boolean;
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface CourseDetail {
  id: string; title: string; description: string | null; status: string;
  source: 'NATIVE' | 'WORDPRESS'; wpCourseId: number | null; wpCourseUrl: string | null;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  programme: { id: string; name: string; shortName: string | null; type: string } | null;
  subject:   { id: string; name: string } | null;
  level:     { id: string; name: string } | null;
  teacher:   { id: string; email: string };
  modules:   Module[];
  _count?:   { modules: number; enrollments: number };
}
interface Programme {
  id: string; name: string; shortName: string | null;
  subjects: { id: string; name: string }[];
  levels:   { id: string; name: string }[];
}

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  PUBLISHED: 'active', PENDING_REVIEW: 'muted', DRAFT: 'default', ARCHIVED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Published', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft', ARCHIVED: 'Archived',
};

export default function AdminCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();

  const [course,      setCourse]      = useState<CourseDetail | null>(null);
  const [programmes,  setProgrammes]  = useState<Programme[]>([]);
  const [teachers,    setTeachers]    = useState<{ id: string; email: string }[]>([]);
  const [packages,    setPackages]    = useState<{ id: string; name: string; currency: string; priceAmount: number }[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectNote,  setRejectNote]  = useState('');
  const [rejecting,   setRejecting]   = useState(false);

  // Tag form state
  const [tagOpen,     setTagOpen]     = useState(false);
  const [progId,      setProgId]      = useState('');
  const [subjId,      setSubjId]      = useState('');
  const [lvlId,       setLvlId]       = useState('');
  const [teacherId,   setTeacherId]   = useState('');
  const [tagging,     setTagging]     = useState(false);
  // Pricing form state
  const [pricingOpen,     setPricingOpen]     = useState(false);
  const [priceAmount,     setPriceAmount]     = useState('');
  const [priceCurrency,   setPriceCurrency]   = useState('');
  const [isSoldInd,       setIsSoldInd]       = useState(false);
  const [savingPricing,   setSavingPricing]   = useState(false);

  async function load() {
    const [cr, pr, tr, pkgRes] = await Promise.all([
      api.get(`/platform-courses/${courseId}`),
      api.get('/catalogue/programmes'),
      api.get('/portals/admin/teachers').catch(() => ({ data: [] })),
      api.get('/admin/packages').catch(() => ({ data: [] })),
    ]);
    const c: CourseDetail = cr.data;
    setCourse(c);
    setProgrammes(pr.data ?? []);
    setTeachers((tr.data ?? []).map((t: any) => ({ id: t.id, email: t.email })));
    const allPkgs = pkgRes.data ?? [];
    setPackages(allPkgs.filter((p: any) => Array.isArray(p.courseIds) && p.courseIds.includes(courseId)));
    // Pre-fill tag form
    setProgId(c.programme?.id ?? '');
    setSubjId(c.subject?.id   ?? '');
    setLvlId(c.level?.id      ?? '');
    setTeacherId(c.teacher?.id ?? '');
    // Pre-fill pricing
    setPriceAmount(c.priceAmount ? String(c.priceAmount) : '');
    setPriceCurrency(c.priceCurrency ?? '');
    setIsSoldInd(c.isSoldIndividually);
    // Expand first module
    if (c.modules?.length > 0) setExpanded(new Set([c.modules[0].id]));
  }

  useEffect(() => {
    load().catch(() => notify.error('Failed to load course')).finally(() => setLoading(false));
  }, [courseId]);

  async function rejectCourse() {
    setRejecting(true);
    try {
      await api.post(`/platform-courses/${courseId}/reject`, { notes: rejectNote.trim() || undefined });
      notify.success('Course rejected — teacher notified');
      setRejectOpen(false); setRejectNote('');
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to reject');
    } finally { setRejecting(false); }
  }

  async function doAction(action: 'publish' | 'archive') {
    setActing(action);
    try {
      await api.post(`/platform-courses/${courseId}/${action}`);
      notify.success(action === 'publish' ? 'Course published' : 'Course archived');
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    } finally { setActing(null); }
  }

  async function saveTag() {
    setTagging(true);
    try {
      await api.patch(`/platform-courses/${courseId}`, {
        programmeId: progId   || null,
        subjectId:   subjId   || null,
        levelId:     lvlId    || null,
        teacherId:   teacherId || undefined,
      });
      notify.success('Course updated');
      setTagOpen(false);
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update');
    } finally { setTagging(false); }
  }

  async function savePricing() {
    setSavingPricing(true);
    try {
      await api.patch(`/platform-courses/${courseId}`, {
        priceAmount: priceAmount ? parseInt(priceAmount, 10) : null,
        priceCurrency: priceCurrency.trim().toUpperCase() || null,
        isSoldIndividually: isSoldInd,
      });
      notify.success('Pricing updated');
      setPricingOpen(false);
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update pricing');
    } finally { setSavingPricing(false); }
  }

  if (loading || !course) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="h-40 rounded-2xl bg-navy/60 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalSecs    = course.modules.flatMap(m => m.lessons).reduce((n, l) => n + (l.durationSecs ?? 0), 0);
  const fmtDur = (s: number) => s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
  const typeIcon = (t: string) => t === 'VIDEO' ? 'play' : t === 'TEXT' ? 'file' : 'assignments';

  const selectedProg = programmes.find(p => p.id === progId) ?? null;

  return (
    <>
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title={course.title}
        subtitle="Course detail & management"
        backHref="/admin/courses"
        backLabel="Courses"
      />

      <div className="flex-1 p-6 space-y-5 max-w-5xl w-full mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-royal/40">
          <Link href="/admin/courses" className="hover:text-navy transition">Course Management</Link>
          <Icon name="chevronRight" size={10} />
          <span className="text-navy font-semibold truncate">{course.title}</span>
        </div>

        {/* Hero card */}
        <Card padding="none" className="overflow-hidden">
          <div className="bg-navy px-6 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Badge variant={STATUS_BADGE[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                  {course.source === 'WORDPRESS' && (
                    <span className="rounded-md bg-orange-400/20 px-2 py-0.5 text-[10px] font-bold text-orange-300 uppercase tracking-widest">WP</span>
                  )}
                  {course.programme && (
                    <span className="rounded-md bg-azure/20 px-2.5 py-0.5 text-[10px] font-bold text-azure uppercase tracking-widest">
                      {course.programme.shortName ?? course.programme.name}
                    </span>
                  )}
                  {course.subject && (
                    <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/60">
                      {course.subject.name}
                    </span>
                  )}
                  {course.level && (
                    <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/60">
                      {course.level.name}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-black text-white leading-snug">{course.title}</h1>
                {course.description && (
                  <p className="text-sm text-white/50 mt-2 max-w-2xl line-clamp-2">{course.description}</p>
                )}
                <p className="text-[11px] text-white/30 mt-2">
                  <Icon name="mentorship" size={10} className="inline mr-1" />
                  Teacher: {course.teacher.email}
                </p>
              </div>

              {/* Admin actions */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <button onClick={() => setTagOpen(v => !v)}
                  className="flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition">
                  <Icon name="tag" size={12} /> {tagOpen ? 'Close' : 'Edit tags'}
                </button>
                <button onClick={() => setPricingOpen(v => !v)}
                  className="flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition">
                  <Icon name="wallet" size={12} /> {pricingOpen ? 'Close' : 'Pricing'}
                </button>
                {course.source === 'NATIVE' && course.status === 'PENDING_REVIEW' && (
                  <>
                    <Button size="sm" loading={acting === 'publish'} onClick={() => doAction('publish')}>
                      Publish
                    </Button>
                    <button
                      onClick={() => setRejectOpen(true)}
                      className="flex items-center gap-1.5 rounded-md border border-red-300/50 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition">
                      Reject
                    </button>
                  </>
                )}
                {course.source === 'NATIVE' && course.status === 'PUBLISHED' && (
                  <Button size="sm" variant="secondary" loading={acting === 'archive'} onClick={() => doAction('archive')}>
                    Archive
                  </Button>
                )}
                {course.source === 'WORDPRESS' && course.wpCourseUrl && (
                  <a href={course.wpCourseUrl} target="_blank" rel="noreferrer">
                    <Button size="sm">
                      <Icon name="live" size={12} /> Open in WP
                    </Button>
                  </a>
                )}
              </div>
            </div>

            {/* Inline tag / reassign form */}
            {tagOpen && (
              <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Programme</label>
                  <Select
                    value={progId}
                    onValueChange={v => { setProgId(v); setSubjId(''); setLvlId(''); }}
                    placeholder="— Untagged —"
                    options={programmes.map(p => ({ value: p.id, label: p.shortName ?? p.name }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Teacher</label>
                  <Select
                    value={teacherId}
                    onValueChange={setTeacherId}
                    placeholder="— Keep current —"
                    options={teachers.map(t => ({ value: t.id, label: t.email, avatar: t.email[0].toUpperCase() }))}
                  />
                </div>
                {selectedProg && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Subject</label>
                      <Select
                        value={subjId}
                        onValueChange={setSubjId}
                        placeholder="— Any subject —"
                        options={selectedProg.subjects.map(s => ({ value: s.id, label: s.name }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Level</label>
                      <Select
                        value={lvlId}
                        onValueChange={setLvlId}
                        placeholder="— Any level —"
                        options={selectedProg.levels.map(l => ({ value: l.id, label: l.name }))}
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2 flex gap-2 pt-1">
                  <Button size="sm" loading={tagging} onClick={saveTag}>Save changes</Button>
                  <Button size="sm" variant="secondary" onClick={() => setTagOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Pricing panel */}
            {pricingOpen && (
              <div className="mt-5 pt-5 border-t border-white/10 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Individual Course Pricing</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Price amount</label>
                    <input
                      type="number"
                      value={priceAmount}
                      onChange={e => setPriceAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-azure"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Currency (e.g. GHS, USD)</label>
                    <input
                      type="text"
                      value={priceCurrency}
                      onChange={e => setPriceCurrency(e.target.value)}
                      placeholder="GHS"
                      maxLength={3}
                      className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-azure uppercase"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSoldInd(v => !v)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isSoldInd ? 'bg-azure' : 'bg-white/20'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isSoldInd ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-xs text-white/70">
                      Allow students to buy this course individually (outside of a package)
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" loading={savingPricing} onClick={savePricing}>Save pricing</Button>
                  <Button size="sm" variant="secondary" onClick={() => setPricingOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-cloud bg-white">
            {[
              { label: 'Modules',   value: course._count?.modules ?? course.modules.length, icon: 'notebook' },
              { label: 'Lessons',   value: totalLessons,                                    icon: 'play'     },
              { label: 'Students',  value: course._count?.enrollments ?? 0,                 icon: 'graduate' },
              {
                label: 'Price',
                value: course.isSoldIndividually && course.priceAmount
                  ? `${course.priceCurrency} ${course.priceAmount.toLocaleString()}`
                  : 'Package only',
                icon: 'wallet',
              },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cloud text-azure flex-shrink-0">
                  <Icon name={s.icon as any} size={16} />
                </span>
                <div>
                  <p className="text-base font-black text-navy leading-none">{s.value}</p>
                  <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-widest">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status callouts */}
        {course.status === 'PENDING_REVIEW' && (
          <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <Icon name="clock" size={16} className="text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700">Awaiting review</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Teacher has submitted this course. Review the curriculum below then click Publish.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" loading={acting === 'publish'} onClick={() => doAction('publish')}>
                Publish now
              </Button>
              <button onClick={() => setRejectOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-100 transition">
                Reject
              </button>
            </div>
          </div>
        )}
        {course.status === 'ARCHIVED' && (
          <div className="flex items-center gap-3 rounded-md border border-royal/20 bg-cloud px-4 py-3">
            <Icon name="close" size={16} className="text-royal/40 flex-shrink-0" />
            <p className="text-sm text-royal/60">
              This course is archived and not visible to students.
            </p>
          </div>
        )}

        {/* Two-column layout: curriculum + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Curriculum — 2/3 */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                Curriculum — {course.modules.length} module{course.modules.length !== 1 ? 's' : ''} · {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => {
                  const all = new Set(course.modules.map(m => m.id));
                  setExpanded(prev => prev.size === all.size ? new Set() : all);
                }}
                className="text-[10px] font-semibold text-royal/40 hover:text-azure transition">
                {expanded.size > 0 ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            {course.modules.length === 0 ? (
              <Card padding="lg">
                <div className="flex flex-col items-center py-8 text-center">
                  <Icon name="notebook" size={28} className="text-royal/20 mb-2" />
                  <p className="text-sm font-semibold text-navy">No modules yet</p>
                  <p className="text-xs text-royal/50 mt-1">
                    {course.source === 'NATIVE'
                      ? 'The teacher needs to add content in the course builder.'
                      : 'This WP course is managed on the WordPress site.'}
                  </p>
                </div>
              </Card>
            ) : (
              course.modules.map((mod, idx) => {
                const isOpen = expanded.has(mod.id);
                return (
                  <div key={mod.id} className="rounded-md border border-cloud bg-white overflow-hidden">
                    <button
                      onClick={() => setExpanded(s => { const n = new Set(s); n.has(mod.id) ? n.delete(mod.id) : n.add(mod.id); return n; })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface transition">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-cloud text-[10px] font-black text-navy">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-navy">{mod.title}</span>
                      <span className="text-[10px] text-royal/40 flex-shrink-0">
                        {mod.lessons.length} lesson{mod.lessons.length !== 1 ? 's' : ''}
                      </span>
                      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="text-royal/30 flex-shrink-0" />
                    </button>

                    {isOpen && (
                      <div className="border-t border-cloud divide-y divide-cloud/60">
                        {mod.lessons.map(lesson => (
                          <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-cloud bg-surface">
                              <Icon name={typeIcon(lesson.type) as any} size={9} className="text-azure" />
                            </div>
                            <span className="flex-1 text-xs font-medium text-navy">{lesson.title}</span>
                            {lesson.isFree && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-600">FREE</span>
                            )}
                            {lesson.durationSecs && (
                              <span className="text-[10px] text-royal/30">{fmtDur(lesson.durationSecs)}</span>
                            )}
                            <span className="text-[10px] font-semibold text-royal/30 uppercase">{lesson.type}</span>
                          </div>
                        ))}
                        {mod.lessons.length === 0 && (
                          <div className="px-4 py-3 text-xs text-royal/30 italic">No lessons in this module</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-4">

            {/* Taxonomy card */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Taxonomy</p>
              <div className="space-y-3">
                <InfoRow label="Programme" value={course.programme?.shortName ?? course.programme?.name ?? '—'} />
                <InfoRow label="Subject"   value={course.subject?.name ?? '—'} />
                <InfoRow label="Level"     value={course.level?.name   ?? '—'} />
                <InfoRow label="Teacher"   value={course.teacher.email} />
                <InfoRow label="Source"    value={course.source === 'WORDPRESS' ? 'WordPress' : 'Native'} />
                {course.source === 'WORDPRESS' && course.wpCourseId && (
                  <InfoRow label="WP Post ID" value={`#${course.wpCourseId}`} mono />
                )}
              </div>
              <button onClick={() => setTagOpen(v => !v)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-cloud py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                <Icon name="edit" size={12} /> Edit taxonomy
              </button>
            </Card>

            {/* Packages card */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">
                Included in packages{packages.length > 0 && ` (${packages.length})`}
              </p>
              {packages.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-center">
                  <Icon name="packages" size={20} className="text-royal/20 mb-1.5" />
                  <p className="text-xs text-royal/40">Not in any package yet</p>
                  <Link href="/admin/packages" className="mt-2 text-[10px] font-semibold text-azure hover:text-royal transition">
                    Manage packages →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {packages.map(pkg => (
                    <div key={pkg.id} className="flex items-center justify-between gap-2 rounded-lg border border-cloud px-3 py-2">
                      <span className="text-xs font-medium text-navy truncate flex-1">{pkg.name}</span>
                      <span className="text-[10px] font-semibold text-royal/50 flex-shrink-0">{pkg.currency} {Number(pkg.priceAmount).toLocaleString()}</span>
                    </div>
                  ))}
                  <Link href="/admin/packages" className="mt-1 block text-[10px] font-semibold text-azure hover:text-royal transition text-center">
                    Manage packages →
                  </Link>
                </div>
              )}
            </Card>

            {/* Quick actions card */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Actions</p>
              <div className="space-y-2">
                {course.source === 'NATIVE' && (
                  <>
                    {course.status === 'PENDING_REVIEW' && (
                      <Button fullWidth size="sm" loading={acting === 'publish'} onClick={() => doAction('publish')}>
                        <Icon name="check" size={13} /> Publish course
                      </Button>
                    )}
                    {course.status === 'PUBLISHED' && (
                      <Button fullWidth size="sm" variant="secondary" loading={acting === 'archive'} onClick={() => doAction('archive')}>
                        Archive course
                      </Button>
                    )}
                  </>
                )}
                {course.source === 'WORDPRESS' && course.wpCourseUrl && (
                  <a href={course.wpCourseUrl} target="_blank" rel="noreferrer" className="block">
                    <Button fullWidth size="sm">
                      <Icon name="live" size={13} /> Open in WordPress
                    </Button>
                  </a>
                )}
                <Link href="/admin/courses" className="block">
                  <Button fullWidth size="sm" variant="ghost">
                    <Icon name="arrowLeft" size={13} /> Back to management
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>

    {/* Reject modal */}
    {rejectOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => setRejectOpen(false)} />
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
              onClick={rejectCourse}
              disabled={rejecting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-50">
              {rejecting ? 'Rejecting…' : 'Confirm reject'}
            </button>
            <button onClick={() => setRejectOpen(false)}
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

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-royal/40 flex-shrink-0 mt-0.5">{label}</span>
      <span className={`text-xs text-navy text-right ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
