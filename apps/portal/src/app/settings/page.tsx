'use client';
import { useEffect, useState, useRef } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

interface Me {
  id: string; email: string; role: string;
  firstName?: string | null; lastName?: string | null;
  phone?: string | null; avatarUrl?: string | null;
  approvalStatus?: string | null; createdAt?: string | null;
}

const ROLE_HOME: Record<string, string> = {
  STUDENT: '/student/dashboard', TEACHER: '/teacher/dashboard',
  ADMIN: '/admin/dashboard', COUNTRY_REP: '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
};

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin',
  COUNTRY_REP: 'Country Representative', SUBJECT_REVIEWER: 'Subject Reviewer',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => {
        setMe(r.data);
        setFirstName(r.data.firstName ?? '');
        setLastName(r.data.lastName ?? '');
        setPhone(r.data.phone ?? '');
        setAvatarUrl(r.data.avatarUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      notify.success('Profile updated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update profile');
    } finally { setSavingProfile(false); }
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/files/upload?folder=avatars', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = r.data?.url ?? r.data;
      await api.patch('/auth/me', { avatarUrl: url });
      setAvatarUrl(url);
      notify.success('Photo updated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to upload photo');
    } finally { setUploadingAvatar(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { notify.error('Passwords do not match'); return; }
    if (newPw.length < 8) { notify.error('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      notify.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to change password');
    } finally { setSavingPw(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6 max-w-2xl w-full mx-auto">
        <div className="rounded-2xl bg-cloud animate-pulse h-56" />
        <div className="rounded-2xl bg-cloud animate-pulse h-48" />
        <div className="rounded-2xl bg-cloud animate-pulse h-32" />
      </div>
    </div>
  );

  const pwStrength = newPw.length === 0 ? 0
    : newPw.length < 6 ? 1
    : newPw.length < 8 ? 2
    : /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) ? 4
    : 3;
  const pwColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-azure', 'bg-green-500'];
  const pwLabels = ['', 'Too short', 'Weak', 'Good', 'Strong'];

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Settings" subtitle="Manage your account and preferences"
        backHref={ROLE_HOME[user?.role ?? ''] ?? '/student/dashboard'} backLabel="Dashboard" />

      <div className="flex-1 p-6 space-y-6 max-w-2xl w-full mx-auto">

        {/* Profile card */}
        <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-5">Profile</p>

          {/* Avatar section */}
          <div className="flex items-center gap-5 pb-5 mb-5 border-b border-cloud">
            <div className="relative flex-shrink-0">
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover border-2 border-cloud" />
                : <Avatar name={me?.firstName ? `${me.firstName} ${me.lastName ?? ''}`.trim() : me?.email} size="xl" />
              }
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-navy/60">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-navy">
                {me?.firstName || me?.lastName ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() : me?.email}
              </p>
              <p className="text-xs text-royal/50 mt-0.5">{ROLE_LABELS[me?.role ?? ''] ?? me?.role}</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-2 text-xs font-semibold text-azure hover:text-royal transition">
                Change photo
              </button>
            </div>
          </div>

          {/* Profile form */}
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">First name</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Last name</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Phone number</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-navy">Email address</label>
                <input
                  value={me?.email ?? ''}
                  disabled
                  className="w-full rounded-xl border border-cloud bg-surface px-4 py-2.5 text-sm text-royal/40 cursor-not-allowed"
                />
                <p className="text-[10px] text-royal/40">Email cannot be changed. Contact support if needed.</p>
              </div>
            </div>
            <Button type="submit" size="sm" loading={savingProfile}>
              <Icon name="check" size={13} /> Save profile
            </Button>
          </form>
        </Card>

        {/* Change password */}
        <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-5">Change password</p>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">Current password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 pr-10 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/40 hover:text-navy transition">
                  <Icon name={showPw ? 'eye' : 'eyeOff'} size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">New password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
                />
                {newPw && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex gap-1 flex-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwStrength ? pwColors[pwStrength] : 'bg-cloud'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold text-royal/50">{pwLabels[pwStrength]}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Confirm new password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  required
                  placeholder="Re-enter new password"
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30 ${
                    confirmPw && newPw !== confirmPw ? 'border-red-300 focus:border-red-400' : 'border-cloud'
                  }`}
                />
                {confirmPw && newPw !== confirmPw && (
                  <p className="text-[10px] text-red-400 font-semibold">Passwords do not match</p>
                )}
              </div>
            </div>

            <Button type="submit" size="sm" loading={savingPw}>Update password</Button>
          </form>
        </Card>

        {/* Account info */}
        <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Account info</p>
          <div className="divide-y divide-cloud">
            {[
              { label: 'Account type', value: ROLE_LABELS[me?.role ?? ''] ?? me?.role ?? '—' },
              { label: 'Status', value: me?.approvalStatus === 'APPROVED' || !me?.approvalStatus ? 'Active' : (me?.approvalStatus ?? '—') },
              { label: 'Member since', value: me?.createdAt ? new Date(me.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
              { label: 'User ID', value: me?.id ? `${me.id.slice(0, 8)}…` : '—', mono: true },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-3">
                <p className="text-xs text-royal/50">{row.label}</p>
                <p className={`text-xs font-semibold text-navy ${row.mono ? 'font-mono' : 'capitalize'}`}>{row.value}</p>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
}
