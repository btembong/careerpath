'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface PlatformCourse { id: string; title: string; status: string; programme: { shortName: string | null; name: string } | null; }
interface Country { id: string; name: string; code: string; currency: string; }
interface Cohort { id: string; name: string; }
interface AdminPackage {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string; countryId: string | null;
  courseIds: string[]; validityDays: number | null; categoryTags: string[];
  cohortId: string | null; cohort: Cohort | null;
  _count?: { purchases: number };
  totalRevenue?: number;
}

const CURRENCIES = ['USD','NGN','GHS','ZAR','XAF','XOF','RWF','KES','UGX','ETB','TZS'];

export default function AdminPackagesPage() {
  const [packages, setPackages]   = useState<AdminPackage[]>([]);
  const [courses,  setCourses]    = useState<PlatformCourse[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cohorts,  setCohorts]    = useState<Cohort[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving,   setSaving]     = useState(false);
  const [editId,   setEditId]     = useState<string | null>(null);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const blank = {
    name: '', description: '', priceAmount: '', currency: 'USD',
    countryId: '', validityDays: '', selectedCourseIds: [] as string[], categoryTags: '', cohortId: '',
  };
  const [form, setForm] = useState(blank);

  useEffect(() => {
    Promise.all([
      api.get('/admin/packages').then(r => setPackages(r.data)).catch(() => {}),
      api.get('/platform-courses').then(r => setCourses(r.data ?? [])).catch(() => {}),
      api.get('/countries/admin/countries').then(r => setCountries(r.data ?? [])).catch(() => {}),
      api.get('/portals/admin/cohorts').then(r => setCohorts(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function buildPayload() {
    return {
      name: form.name,
      description: form.description || undefined,
      priceAmount: parseFloat(form.priceAmount),
      currency: form.currency,
      countryId: form.countryId || undefined,
      validityDays: form.validityDays ? parseInt(form.validityDays) : undefined,
      courseIds: form.selectedCourseIds,
      categoryTags: form.categoryTags ? form.categoryTags.split(',').map(s => s.trim()).filter(Boolean) : [],
      cohortId: form.cohortId || null,
    };
  }

  async function savePackage(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) {
        await api.patch(`/admin/packages/${editId}`, buildPayload());
        notify.success('Package updated');
      } else {
        await api.post('/admin/packages', buildPayload());
        notify.success('Package created');
      }
      const r = await api.get('/admin/packages');
      setPackages(r.data); setShowForm(false); setEditId(null); setForm(blank);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  function startEdit(pkg: AdminPackage) {
    setEditId(pkg.id);
    setForm({
      name: pkg.name, description: pkg.description ?? '',
      priceAmount: pkg.priceAmount?.toString() ?? '',
      currency: pkg.currency ?? 'USD',
      countryId: pkg.countryId ?? '',
      validityDays: pkg.validityDays?.toString() ?? '',
      selectedCourseIds: pkg.courseIds ?? [],
      categoryTags: pkg.categoryTags?.join(', ') ?? '',
      cohortId: pkg.cohortId ?? '',
    });
    setShowForm(true);
  }

  async function deletePackage() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/packages/${deleteId}`);
      setPackages(prev => prev.filter(p => p.id !== deleteId));
      setDeleteId(null);
      notify.success('Package deleted');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to delete');
    } finally { setDeleting(false); }
  }

  function toggleCourse(id: string) {
    setForm(f => ({
      ...f,
      selectedCourseIds: f.selectedCourseIds.includes(id)
        ? f.selectedCourseIds.filter(x => x !== id)
        : [...f.selectedCourseIds, id],
    }));
  }

  // Sync currency from selected country
  function handleCountryChange(countryId: string) {
    const country = countries.find(c => c.id === countryId);
    setForm(f => ({ ...f, countryId, currency: country?.currency ?? f.currency }));
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  // Group courses by programme for the checklist
  const coursesByProg: Record<string, PlatformCourse[]> = {};
  courses.forEach(c => {
    const key = c.programme?.shortName ?? c.programme?.name ?? 'Untagged';
    if (!coursesByProg[key]) coursesByProg[key] = [];
    coursesByProg[key].push(c);
  });

  return (
    <>
    <div className="flex flex-col min-h-full">
      <Topbar title="Packages" subtitle="Create and manage learning packages" />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PACKAGES</p>
            <h2 className="text-base font-bold text-navy">{packages.length} package{packages.length !== 1 ? 's' : ''}</h2>
          </div>
          <Button size="sm" onClick={() => { setShowForm(v => !v); setEditId(null); setForm(blank); }}>
            <Icon name="add" size={14} /> New package
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">
              {editId ? 'EDIT PACKAGE' : 'NEW PACKAGE'}
            </p>
            <form onSubmit={savePackage} className="space-y-5">

              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-navy">Package name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                    placeholder="WASSCE Science Bundle – Nigeria"
                    className="w-full rounded-md border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-navy">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="What's included…"
                    className="w-full rounded-md border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none resize-none focus:border-azure placeholder:text-royal/40" />
                </div>

                {/* Country — drives currency */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Country <span className="font-normal text-royal/40">(sets currency)</span></label>
                  <Select
                    value={form.countryId}
                    onValueChange={handleCountryChange}
                    placeholder="— Any country —"
                    options={countries.map(c => ({ value: c.id, label: `${c.name} (${c.currency})` }))}
                  />
                </div>

                {/* Currency — auto-filled but editable */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Currency *</label>
                  <Select
                    value={form.currency}
                    onValueChange={v => setForm(f => ({ ...f, currency: v }))}
                    options={CURRENCIES.map(c => ({ value: c, label: c }))}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Price *</label>
                  <input value={form.priceAmount} onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))}
                    required type="number" placeholder="150"
                    className="w-full rounded-md border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Validity (days)</label>
                  <input value={form.validityDays} onChange={e => setForm(f => ({ ...f, validityDays: e.target.value }))}
                    type="number" placeholder="90"
                    className="w-full rounded-md border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-navy">Category tags <span className="font-normal text-royal/40">(comma-separated)</span></label>
                  <input value={form.categoryTags} onChange={e => setForm(f => ({ ...f, categoryTags: e.target.value }))}
                    placeholder="Science, WASSCE, West Africa"
                    className="w-full rounded-md border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-navy">
                    Linked cohort <span className="font-normal text-royal/40">(students auto-enrolled on purchase)</span>
                  </label>
                  <Select
                    value={form.cohortId}
                    onValueChange={v => setForm(f => ({ ...f, cohortId: v }))}
                    placeholder="— No cohort —"
                    options={cohorts.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>
              </div>

              {/* Course checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-navy">
                    Courses in this package
                    {form.selectedCourseIds.length > 0 && (
                      <span className="ml-2 rounded bg-azure px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {form.selectedCourseIds.length} selected
                      </span>
                    )}
                  </label>
                  {form.selectedCourseIds.length > 0 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, selectedCourseIds: [] }))}
                      className="text-[10px] text-royal/40 hover:text-navy transition">
                      Clear all
                    </button>
                  )}
                </div>

                {courses.length === 0 ? (
                  <div className="rounded-md border border-cloud bg-surface px-4 py-3 text-xs text-royal/40">
                    No platform courses yet — create some in Course Management first.
                  </div>
                ) : (
                  <div className="rounded-md border border-cloud bg-surface divide-y divide-cloud max-h-64 overflow-y-auto">
                    {Object.entries(coursesByProg).map(([progName, progCourses]) => (
                      <div key={progName}>
                        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-royal/40 bg-cloud/50 sticky top-0">
                          {progName}
                        </p>
                        {progCourses.map(c => {
                          const checked = form.selectedCourseIds.includes(c.id);
                          return (
                            <label key={c.id}
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-cloud transition ${checked ? 'bg-azure/5' : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCourse(c.id)}
                                className="rounded accent-azure" />
                              <span className="flex-1 text-sm text-navy">{c.title}</span>
                              <Badge variant={c.status === 'PUBLISHED' ? 'active' : 'default'}>
                                {c.status === 'PUBLISHED' ? 'Published' : c.status.replace('_', ' ')}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button type="submit" loading={saving} size="sm">{editId ? 'Save changes' : 'Create package'}</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setShowForm(false); setEditId(null); setForm(blank); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Package list */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {packages.map((pkg, i) => {
            const country = countries.find(c => c.id === pkg.countryId);
            const soldCount = pkg._count?.purchases ?? null;
            const revenue = pkg.totalRevenue != null ? pkg.totalRevenue : (soldCount != null ? soldCount * Number(pkg.priceAmount) : null);
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, ...spring.smooth }}
              >
              <Card padding="none" className="overflow-hidden flex flex-col h-full">
                <div className="bg-navy p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-azure/20">
                      <Icon name="packages" size={20} className="text-azure" />
                    </div>
                    <div className="text-right">
                      <Badge variant="active">{pkg.currency} {Number(pkg.priceAmount).toLocaleString()}</Badge>
                      {country && (
                        <p className="text-[10px] text-white/40 mt-1">{country.name}</p>
                      )}
                    </div>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-white leading-snug">{pkg.name}</h3>
                  {pkg.description && <p className="mt-1 text-xs text-white/40 line-clamp-2">{pkg.description}</p>}
                </div>
                <div className="flex-1 p-4 space-y-3">
                  {/* Sales + revenue strip */}
                  {(soldCount != null || revenue != null) && (
                    <div className="grid grid-cols-2 gap-2">
                      {soldCount != null && (
                        <div className="rounded-lg bg-azure/8 border border-azure/15 px-3 py-2 text-center">
                          <p className="text-sm font-black text-navy">{soldCount.toLocaleString()}</p>
                          <p className="text-[9px] uppercase tracking-widest text-royal/50 mt-0.5">Sold</p>
                        </div>
                      )}
                      {revenue != null && (
                        <div className="rounded-lg bg-azure/8 border border-azure/15 px-3 py-2 text-center">
                          <p className="text-sm font-black text-navy">{Number(revenue).toLocaleString()}</p>
                          <p className="text-[9px] uppercase tracking-widest text-royal/50 mt-0.5">{pkg.currency} Revenue</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-royal/60 flex-wrap">
                    <span className="flex items-center gap-1">
                      <IconBox className="h-5 w-5 rounded"><Icon name="courses" size={10} /></IconBox>
                      {pkg.courseIds?.length ?? 0} courses
                    </span>
                    {pkg.validityDays && (
                      <span className="flex items-center gap-1">
                        <IconBox className="h-5 w-5 rounded"><Icon name="clock" size={10} /></IconBox>
                        {pkg.validityDays}d
                      </span>
                    )}
                    {pkg.cohort && (
                      <span className="flex items-center gap-1 text-azure font-semibold">
                        <IconBox className="h-5 w-5 rounded"><Icon name="mentorship" size={10} /></IconBox>
                        {pkg.cohort.name}
                      </span>
                    )}
                  </div>
                  {(pkg.categoryTags?.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {pkg.categoryTags.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="rounded bg-cloud px-2 py-0.5 text-[10px] font-medium text-royal/60">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(pkg)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-cloud py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                      <Icon name="edit" size={13} /> Edit
                    </button>
                    <button onClick={() => setDeleteId(pkg.id)}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </Card>
              </motion.div>
            );
          })}
          {packages.length === 0 && (
            <div className="col-span-3">
              <Card padding="lg">
                <EmptyState icon="packages" title="No packages yet" description="Create your first learning package" />
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>

    <ConfirmDialog
      open={!!deleteId}
      onOpenChange={open => { if (!open) setDeleteId(null); }}
      title="Delete package?"
      description="This cannot be undone. Students with active purchases won't lose access, but the package will be removed from sale."
      confirmLabel="Delete package"
      variant="danger"
      loading={deleting}
      onConfirm={deletePackage}
    />
    </>
  );
}
