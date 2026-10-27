'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';

interface Coupon {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  packageId: string | null;
  package?: { name: string } | null;
}

const blankForm = { code: '', discountType: 'PERCENT', discountValue: '', maxUses: '', packageId: '', expiresAt: '' };

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const [cr, pr] = await Promise.all([
        api.get('/admin/coupons').catch(() => ({ data: [] })),
        api.get('/packages').catch(() => ({ data: [] })),
      ]);
      setCoupons(cr.data ?? []);
      setPackages(pr.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function openCreate() {
    setEditId(null);
    setForm(blankForm);
    setShowForm(true);
  }

  function openEdit(c: Coupon) {
    setEditId(c.id);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      maxUses: c.maxUses != null ? String(c.maxUses) : '',
      packageId: c.packageId ?? '',
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : '',
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        ...(form.maxUses && { maxUses: parseInt(form.maxUses) }),
        ...(form.packageId && { packageId: form.packageId }),
        ...(form.expiresAt && { expiresAt: new Date(form.expiresAt).toISOString() }),
      };
      if (editId) {
        await api.patch(`/admin/coupons/${editId}`, payload);
        notify.success('Coupon updated');
      } else {
        await api.post('/admin/coupons', payload);
        notify.success('Coupon created');
      }
      setShowForm(false);
      setEditId(null);
      setForm(blankForm);
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    setToggling(c.id);
    try {
      await api.patch(`/admin/coupons/${c.id}`, { isActive: !c.isActive });
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
      notify.success(c.isActive ? 'Coupon deactivated' : 'Coupon activated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed');
    } finally { setToggling(null); }
  }

  async function deleteCoupon() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/coupons/${deleteId}`);
      setCoupons(prev => prev.filter(c => c.id !== deleteId));
      setDeleteId(null);
      notify.success('Coupon deleted');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to delete');
    } finally { setDeleting(false); }
  }

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

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Coupon Management" subtitle="Create and manage discount codes" />
      <div className="flex-1 p-6 space-y-5">

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold text-navy">{coupons.length} coupons</p>
            <div className="flex gap-1.5">
              {coupons.filter(c => c.isActive).length > 0 && (
                <Badge variant="active">{coupons.filter(c => c.isActive).length} active</Badge>
              )}
            </div>
          </div>
          <Button onClick={openCreate}>
            <Icon name="add" size={14} /> New Coupon
          </Button>
        </div>

        {/* Create / Edit form */}
        {showForm && (
          <Card padding="none" className="overflow-hidden border-2 border-azure/20">
            <div className="bg-azure/5 px-5 py-3 flex items-center justify-between border-b border-cloud">
              <p className="text-sm font-bold text-navy">{editId ? 'Edit Coupon' : 'Create Coupon'}</p>
              <button onClick={() => setShowForm(false)} className="text-royal/40 hover:text-navy">
                <Icon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Coupon Code *</label>
                  <input value={form.code} onChange={set('code')} required
                    placeholder="e.g. SAVE20"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm font-mono font-bold text-navy outline-none focus:border-azure placeholder:text-royal/40 placeholder:font-normal uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Discount Type *</label>
                  <Select
                    value={form.discountType}
                    onValueChange={v => setForm(f => ({ ...f, discountType: v }))}
                    options={[
                      { value: 'PERCENT', label: 'Percentage (%)' },
                      { value: 'FIXED',   label: 'Fixed amount ($)' },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">
                    {form.discountType === 'PERCENT' ? 'Percent off *' : 'Amount off *'}
                  </label>
                  <input type="number" step="any" min="0" value={form.discountValue} onChange={set('discountValue')} required
                    placeholder={form.discountType === 'PERCENT' ? '20' : '5.00'}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Max uses <span className="font-normal">(blank = unlimited)</span></label>
                  <input type="number" min="1" value={form.maxUses} onChange={set('maxUses')}
                    placeholder="e.g. 100"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Restrict to package <span className="font-normal">(optional)</span></label>
                  <Select
                    value={form.packageId}
                    onValueChange={v => setForm(f => ({ ...f, packageId: v }))}
                    placeholder="— Any package —"
                    options={packages.map(p => ({ value: p.id, label: p.name }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Expires at <span className="font-normal">(optional)</span></label>
                  <input type="datetime-local" value={form.expiresAt} onChange={set('expiresAt')}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={saving}>{editId ? 'Save changes' : 'Create Coupon'}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Coupon list */}
        {coupons.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="tag" title="No coupons yet" description="Create discount codes to offer students" />
          </Card>
        ) : (
          <Card padding="none">
            <div className="px-5 py-2.5 border-b border-cloud">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                <span className="col-span-3">Code</span>
                <span className="col-span-2">Discount</span>
                <span className="col-span-2">Uses</span>
                <span className="col-span-2">Package</span>
                <span className="col-span-1">Expires</span>
                <span className="col-span-2 text-right">Actions</span>
              </div>
            </div>
            <ul className="divide-y divide-cloud">
              {coupons.map((c) => (
                <li key={c.id} className="grid grid-cols-12 gap-2 items-center px-5 py-3.5">
                  <div className="col-span-3 flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-navy">{c.code}</span>
                    <Badge variant={c.isActive ? 'active' : 'default'} className="text-[9px]">
                      {c.isActive ? 'On' : 'Off'}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-semibold text-navy">
                      {c.discountType === 'PERCENT' ? `${c.discountValue}%` : `$${c.discountValue}`}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-royal/60">
                      {c.usedCount} / {c.maxUses ?? '∞'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-royal/60 truncate">
                      {c.package?.name ?? (c.packageId ? 'Specific' : 'All')}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-[10px] text-royal/40">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={toggling === c.id}
                      title={c.isActive ? 'Deactivate' : 'Activate'}
                      className={`flex h-7 w-7 items-center justify-center rounded-md border transition disabled:opacity-50
                        ${c.isActive ? 'border-azure/30 bg-azure/10 text-azure hover:bg-azure/20' : 'border-cloud bg-surface text-royal/40 hover:bg-cloud'}`}>
                      {toggling === c.id
                        ? <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        : <Icon name={c.isActive ? 'check' : 'close'} size={11} />
                      }
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => openEdit(c)}
                      title="Edit"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-cloud bg-surface text-royal/40 hover:bg-cloud hover:text-navy transition">
                      <Icon name="edit" size={11} />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => setDeleteId(c.id)}
                      title="Delete"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition">
                      <Icon name="close" size={11} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null); }}
        title="Delete coupon?"
        description="This cannot be undone. Students who have already applied it won't be affected."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={deleteCoupon}
      />
    </div>
  );
}
