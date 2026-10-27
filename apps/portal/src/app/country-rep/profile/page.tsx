'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface ProfileData {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}
interface CountryInfo {
  name: string; currency: string; repCommissionPercent: number; perStudentBonus: number;
}
interface DashboardData {
  country: CountryInfo;
  activeStudents: number;
}

export default function CountryRepProfilePage() {
  const [profile,   setProfile]   = useState<ProfileData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

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
      api.get('/countries/country-rep/dashboard').catch(() => ({ data: null })),
      api.get('/payout-accounts/me').catch(() => ({ data: null })),
    ]).then(([pr, dr, bankRes]) => {
      const p = pr.data;
      setProfile(p);
      setDashboard(dr.data);
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

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">
        <div className="rounded-2xl border border-cloud bg-white h-40 animate-pulse" />
        <div className="rounded-2xl border border-cloud bg-white h-48 animate-pulse" />
      </div>
    </div>
  );

  const country    = (dashboard?.country ?? {}) as Partial<CountryInfo>;
  const commission = Number(country.repCommissionPercent ?? 0);
  const perStudent = Number(country.perStudentBonus      ?? 0);
  const currency   = country.currency ?? 'USD';

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Profile" subtitle="Account details, bank information and commission overview" />

      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">

        {/* Identity + country card */}
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
              {country.name && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Icon name="countries" size={12} className="text-azure" />
                  <span className="text-xs font-semibold text-azure">{country.name} Country Rep</span>
                </div>
              )}
            </div>
          </div>

          {/* Commission strip */}
          <div className="grid grid-cols-3 divide-x divide-cloud bg-white">
            {[
              { label: 'Commission rate',   value: `${commission}%`,                      icon: 'income'    as const },
              { label: 'Per-student bonus', value: `${currency} ${perStudent}`,           icon: 'graduate'  as const },
              { label: 'Active students',   value: String(dashboard?.activeStudents ?? 0), icon: 'mentorship' as const },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 px-5 py-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-cloud text-azure">
                  <Icon name={s.icon} size={16} />
                </span>
                <div>
                  <p className="text-base font-black text-navy leading-none">{s.value}</p>
                  <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-widest">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Personal info form */}
        <form onSubmit={saveProfile} className="space-y-5">
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

        {/* Country info (read-only) */}
        {country.name && (
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Your country assignment</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Country',     value: country.name    ?? '—' },
                { label: 'Currency',    value: country.currency ?? '—' },
                { label: 'Commission',  value: `${commission}%` },
                { label: 'Per student', value: `${currency} ${perStudent}` },
              ].map(row => (
                <div key={row.label} className="rounded-xl bg-surface p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-1">{row.label}</p>
                  <p className="text-sm font-bold text-navy">{row.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-royal/30 mt-3">
              Commission rates are set by admin. Contact support if you need an update.
            </p>
          </Card>
        )}

      </div>
    </div>
  );
}
