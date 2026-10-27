'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface ProfileData {
  email: string; firstName?: string | null; lastName?: string | null;
  phone?: string | null; subjectAreas?: string[];
}
interface ReviewQueueItem {
  id: string; courseId?: string; reviewStatus?: string; status?: string;
}

export default function ReviewerProfilePage() {
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [queue,   setQueue]     = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');

  const [bankName,      setBankName]      = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode,      setBankCode]      = useState('');
  const [bankCountry,   setBankCountry]   = useState('');
  const [bankVerified,  setBankVerified]  = useState(false);
  const [savingBank,    setSavingBank]    = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').catch(() => ({ data: null })),
      api.get('/reviewer/queue').catch(() => ({ data: [] })),
      api.get('/payout-accounts/me').catch(() => ({ data: null })),
    ]).then(([pr, qr, bankRes]) => {
      const p = pr.data;
      setProfile(p);
      setQueue(qr.data ?? []);
      if (p) {
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName   ?? '');
        setPhone(p.phone         ?? '');
      }
      const b = bankRes.data;
      if (b) {
        setBankName(b.bankName ?? '');
        setAccountNumber(b.accountNumber ?? '');
        setBankCode(b.bankCode ?? '');
        setBankCountry(b.country ?? '');
        setBankVerified(b.isVerified ?? false);
      }
    }).finally(() => setLoading(false));
  }, []);

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !bankCountry.trim()) {
      notify.error('Bank name, account number, and country are required');
      return;
    }
    setSavingBank(true);
    try {
      await api.post('/payout-accounts/me', {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        bankCode: bankCode.trim() || undefined,
        country: bankCountry.trim(),
      });
      setBankVerified(false);
      notify.success('Bank details saved — awaiting admin verification');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save bank details');
    } finally { setSavingBank(false); }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/auth/me', {
        firstName: firstName.trim() || undefined,
        lastName:  lastName.trim()  || undefined,
        phone:     phone.trim()     || undefined,
      });
      notify.success('Profile updated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">
        <div className="rounded-2xl border border-cloud bg-white h-40 animate-pulse" />
        <div className="rounded-2xl border border-cloud bg-white h-48 animate-pulse" />
      </div>
    </div>
  );

  const reviewed   = queue.filter(c => c.reviewStatus === 'APPROVED' || c.reviewStatus === 'REJECTED' || c.status === 'APPROVED' || c.status === 'REJECTED');
  const approvals  = reviewed.filter(c => c.reviewStatus === 'APPROVED' || c.status === 'APPROVED').length;
  const rejections = reviewed.filter(c => c.reviewStatus === 'REJECTED' || c.status === 'REJECTED').length;
  const pending    = queue.filter(c => !c.reviewStatus || c.reviewStatus === 'PENDING').length;

  // Use subject areas from the profile — more reliable than scraping queue item metadata
  const subjects: string[] = profile?.subjectAreas ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Profile" subtitle="Account details and review activity" />

      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">

        {/* Identity hero */}
        <Card padding="none" className="overflow-hidden">
          <div className="bg-navy px-6 py-5 flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-azure text-2xl font-black text-white">
              {(profile?.firstName?.[0] ?? profile?.email?.[0] ?? 'R').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black text-white leading-tight">
                {profile?.firstName ? `${profile.firstName} ${profile.lastName ?? ''}`.trim() : profile?.email}
              </p>
              <p className="text-sm text-white/50 mt-0.5">{profile?.email}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Icon name="assignments" size={12} className="text-azure" />
                <span className="text-xs font-semibold text-azure">Subject Reviewer</span>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 divide-x divide-cloud bg-white">
            {[
              { label: 'In queue',   value: String(pending),    icon: 'assignments' as const },
              { label: 'Reviewed',   value: String(reviewed.length), icon: 'check' as const },
              { label: 'Approved',   value: String(approvals),  icon: 'check' as const },
              { label: 'Rejected',   value: String(rejections), icon: 'close' as const },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 px-4 py-4">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-cloud text-azure">
                  <Icon name={s.icon} size={14} />
                </span>
                <div>
                  <p className="text-base font-black text-navy leading-none">{s.value}</p>
                  <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-widest">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Subject areas */}
        {subjects.length > 0 && (
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Assigned subject areas</p>
            <div className="flex flex-wrap gap-2">
              {subjects.map(s => (
                <Badge key={s} variant="default">{s}</Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Edit form */}
        <form onSubmit={saveProfile} className="space-y-5">

          {/* Personal info */}
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Personal information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">First name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Amara"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Last name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Osei"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Email</label>
                <input value={profile?.email ?? ''} readOnly
                  className="w-full rounded-xl border border-cloud bg-surface px-4 py-2.5 text-sm text-royal/50 cursor-not-allowed" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Phone number</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+234 801 000 0000"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
            </div>
          </Card>

          <Button type="submit" loading={saving}>
            <Icon name="check" size={14} /> Save changes
          </Button>
        </form>

        {/* Bank / payout details */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Bank / payout details</p>
            {bankVerified && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600">
                <Icon name="check" size={11} /> Verified
              </span>
            )}
          </div>
          <form onSubmit={saveBank} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Bank name</label>
                <input value={bankName} onChange={e => setBankName(e.target.value)}
                  placeholder="e.g. First Bank Nigeria"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Account number</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                  placeholder="0123456789"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">
                  Bank code / sort code <span className="font-normal text-royal/40">(optional)</span>
                </label>
                <input value={bankCode} onChange={e => setBankCode(e.target.value)}
                  placeholder="011"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Country</label>
                <input value={bankCountry} onChange={e => setBankCountry(e.target.value)}
                  placeholder="NG"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </div>
            </div>
            <p className="text-[10px] text-royal/40">
              Details are reviewed and verified by the admin team before your first payout. You'll receive an email once verified.
            </p>
            <Button type="submit" size="sm" loading={savingBank}>
              <Icon name="check" size={13} /> Save bank details
            </Button>
          </form>
        </Card>

      </div>
    </div>
  );
}
