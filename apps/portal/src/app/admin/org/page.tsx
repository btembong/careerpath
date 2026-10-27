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
import api from '@/lib/api';

interface Enrollment {
  id: string;
  organizationName: string;
  contactEmail: string;
  packageId: string;
  seatsPurchased: number;
  createdAt: string;
  package: { name: string } | null;
  seats: { claimedAt: string | null }[];
  _count: { seats: number };
}

export default function AdminOrgPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string; currency: string; priceAmount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [orgName, setOrgName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [packageId, setPackageId] = useState('');
  const [emailList, setEmailList] = useState('');
  const [emailError, setEmailError] = useState('');

  async function load() {
    try {
      const [er, pr] = await Promise.all([
        api.get('/org/admin/org-enrollments').catch(() => ({ data: [] })),
        api.get('/admin/packages').catch(() => ({ data: [] })),
      ]);
      setEnrollments(er.data);
      setPackages(pr.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    const inviteEmails = emailList
      .split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@'));

    if (inviteEmails.length === 0) {
      setEmailError('Enter at least one valid email address.');
      return;
    }
    setEmailError('');

    setSaving(true);
    try {
      await api.post('/org/admin/org-enrollments', {
        organizationName: orgName.trim(),
        contactEmail: contactEmail.trim(),
        packageId: packageId.trim(),
        inviteEmails,
      });
      setOrgName(''); setContactEmail(''); setPackageId(''); setEmailList('');
      setShowForm(false);
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to create enrollment');
    } finally { setSaving(false); }
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
      <Topbar title="Org Enrollments" subtitle="Bulk-purchase seats for organizations" />

      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">ORGANIZATIONS</p>
            <h2 className="text-base font-bold text-navy">
              {enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Icon name="add" size={14} /> New enrollment
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">NEW ORG ENROLLMENT</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Organization name</label>
                  <input value={orgName} onChange={e => setOrgName(e.target.value)} required
                    placeholder="Accenture Nigeria"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Contact email</label>
                  <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} required
                    placeholder="hr@company.com"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Package *</label>
                {packages.length > 0 ? (
                  <Select
                    value={packageId}
                    onValueChange={setPackageId}
                    placeholder="— Select package —"
                    options={packages.map(p => ({
                      value: p.id,
                      label: `${p.name} (${p.currency} ${Number(p.priceAmount).toLocaleString()})`,
                    }))}
                  />
                ) : (
                  <input value={packageId} onChange={e => setPackageId(e.target.value)} required
                    placeholder="Package UUID (no packages found)"
                    className="w-full rounded-md border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40 font-mono text-xs" />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Invite emails</label>
                <textarea rows={5} value={emailList} onChange={e => setEmailList(e.target.value)} required
                  placeholder="One email per line, or comma-separated:&#10;alice@company.com&#10;bob@company.com"
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40 resize-none" />
                <p className="text-[10px] text-royal/40">
                  {emailList.split(/[\n,;]+/).filter(s => s.trim().includes('@')).length} valid email(s) detected
                </p>
                {emailError && (
                  <p className="text-xs text-red-500 font-medium">{emailError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" loading={saving} size="sm">Create enrollment</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Enrollment list */}
        {enrollments.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="graduate" title="No org enrollments yet" description="Create bulk-seat enrollments for corporate clients" />
          </Card>
        ) : (
          <Card padding="none">
            <div className="px-5 py-3 border-b border-cloud">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALL ENROLLMENTS</p>
            </div>
            <ul className="divide-y divide-cloud">
              {enrollments.map((e) => {
                const claimed = e.seats.filter(s => s.claimedAt).length;
                const total = e._count.seats;
                const pct = total > 0 ? Math.round((claimed / total) * 100) : 0;
                const joinUrl = `/join/${e.id}`;

                return (
                  <li key={e.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-navy">{e.organizationName}</p>
                          <Badge variant={claimed === total && total > 0 ? 'active' : 'muted'}>
                            {claimed}/{total} claimed
                          </Badge>
                        </div>
                        <p className="text-xs text-royal/50 mt-0.5">{e.contactEmail}</p>
                        {e.package && (
                          <p className="text-xs text-azure mt-0.5">{e.package.name}</p>
                        )}
                      </div>
                      <p className="text-[10px] text-royal/30 flex-shrink-0">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Seat progress bar */}
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-cloud overflow-hidden">
                        <div className="h-full rounded-full bg-azure transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Join link */}
                    <div className="flex items-center gap-2 rounded-lg bg-surface border border-cloud px-3 py-2">
                      <Icon name="live" size={11} className="text-royal/40 flex-shrink-0" />
                      <p className="text-[11px] font-mono text-royal/50 truncate flex-1">
                        {typeof window !== 'undefined' ? `${window.location.origin}${joinUrl}` : joinUrl}
                      </p>
                      <button
                        onClick={() => navigator.clipboard.writeText(
                          `${window.location.origin}${joinUrl}`
                        )}
                        className="text-[10px] font-semibold text-azure hover:underline flex-shrink-0">
                        Copy
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
