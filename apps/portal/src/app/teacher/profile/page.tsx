'use client';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useDropzone } from 'react-dropzone';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { notify } from '@/lib/notify';
import { uploadVideo } from '@/lib/uploadVideo';
import api from '@/lib/api';
import { parseVideoUrl } from '@cpa/shared';

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED:      'bg-green-100 text-green-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  DRAFT:          'bg-cloud text-royal/60',
  ARCHIVED:       'bg-red-100 text-red-600',
};

interface Me {
  email: string; firstName?: string | null; lastName?: string | null;
  phone?: string | null; avatarUrl?: string | null; bio?: string | null;
  linkedinUrl?: string | null; websiteUrl?: string | null;
  subjectAreas?: string[]; qualification?: string | null;
  yearsExperience?: number | null;
  agreementAcceptedAt?: string | null;
  agreementVersion?: string | null;
}
interface TeacherProfileData {
  videoIntroUrl?: string | null; avgRating?: number | null;
  reviewCount: number;
  platformCourses?: Array<{
    id: string; title: string; status: string;
    createdAt: string; wpCourseId?: string | null;
  }>;
}

export default function TeacherProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Basic info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingBasic, setSavingBasic] = useState(false);

  // Professional
  const [bio, setBio] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [savingPro, setSavingPro] = useState(false);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Video intro
  const [videoIntroUrl, setVideoIntroUrl] = useState('');       // link input
  const [savedVideoUrl, setSavedVideoUrl] = useState('');       // what students see
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);
  const uploadingVideo = videoProgress !== null;

  const handleVideoFile = useCallback(async (file: File) => {
    setVideoProgress(0);
    try {
      const url = await uploadVideo(file, setVideoProgress);
      await api.patch('/teachers/me/profile', { videoIntroUrl: url });
      setSavedVideoUrl(url);
      setVideoIntroUrl('');
      notify.success('Intro video uploaded');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? err?.message ?? 'Upload failed');
    } finally { setVideoProgress(null); }
  }, []);

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps, isDragActive: isVideoDrag } = useDropzone({
    accept: { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'], 'video/webm': ['.webm'] },
    maxSize: 100 * 1024 * 1024,
    multiple: false,
    disabled: uploadingVideo,
    onDropAccepted: ([file]) => handleVideoFile(file),
    onDropRejected: ([r]) => notify.error(r?.errors[0]?.code === 'file-too-large' ? 'Video must be 100 MB or smaller' : 'Use an MP4, MOV or WebM video'),
  });

  const removeVideo = () => saveVideoUrl('');

  async function saveVideoUrl(value = videoIntroUrl) {
    const link = value.trim();
    if (link && !parseVideoUrl(link)) { notify.error('Paste a YouTube or Vimeo link'); return; }
    setSavingVideo(true);
    try {
      const { data } = await api.patch('/teachers/me/profile', { videoIntroUrl: link || null });
      setSavedVideoUrl(data?.videoIntroUrl ?? '');
      setVideoIntroUrl('');
      notify.success(link ? 'Intro video saved' : 'Intro video removed');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save');
    } finally { setSavingVideo(false); }
  }

  const uploadAvatar = useCallback(async (file: File) => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/files/upload?folder=avatars', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = r.data?.url ?? r.data?.fileUrl ?? r.data;
      await api.patch('/auth/me', { avatarUrl: url });
      setMe(prev => prev ? { ...prev, avatarUrl: url } : prev);
      notify.success('Avatar updated');
    } catch {
      notify.error('Upload failed');
    } finally { setUploadingAvatar(false); }
  }, []);

  const { getRootProps: getAvatarRootProps, getInputProps: getAvatarInputProps, isDragActive: isAvatarDrag } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    onDropAccepted: ([file]) => uploadAvatar(file),
  });

  // Bank / payout
  const [bankName, setBankName]       = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode]       = useState('');
  const [bankCountry, setBankCountry] = useState('');
  const [bankVerified, setBankVerified] = useState(false);
  const [savingBank, setSavingBank]   = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').catch(() => ({ data: null })),
      api.get('/payout-accounts/me').catch(() => ({ data: null })),
      api.get('/teachers/me/profile').catch(() => ({ data: null })),
    ]).then(([meRes, bankRes, tpRes]) => {
      const d = meRes.data;
      if (d) {
        setMe(d);
        setFirstName(d.firstName ?? '');
        setLastName(d.lastName ?? '');
        setPhone(d.phone ?? '');
        setBio(d.bio ?? '');
        setLinkedinUrl(d.linkedinUrl ?? '');
        setWebsiteUrl(d.websiteUrl ?? '');
      }
      const b = bankRes.data;
      if (b) {
        setBankName(b.bankName ?? '');
        setAccountNumber(b.accountNumber ?? '');
        setBankCode(b.bankCode ?? '');
        setBankCountry(b.country ?? '');
        setBankVerified(b.isVerified ?? false);
      }
      if (tpRes.data) {
        setTeacherProfile(tpRes.data);
        setSavedVideoUrl(tpRes.data.videoIntroUrl ?? '');
      } else {
        // WP-created teachers have no teacherProfile record yet.
        // Send a no-op PATCH to initialise the row on the backend.
        api.patch('/teachers/me/profile', {}).catch(() => {});
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
      setBankVerified(false); // reset verification since details changed
      notify.success('Bank details saved — awaiting admin verification');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save bank details');
    } finally { setSavingBank(false); }
  }

  async function saveBasic(e: React.FormEvent) {
    e.preventDefault();
    setSavingBasic(true);
    try {
      await api.patch('/auth/me', {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      notify.success('Profile updated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update profile');
    } finally { setSavingBasic(false); }
  }

  async function saveProfessional(e: React.FormEvent) {
    e.preventDefault();
    if (bio.trim().length < 100) {
      notify.error('Bio must be at least 100 characters');
      return;
    }
    setSavingPro(true);
    try {
      await api.patch('/auth/me', {
        bio: bio.trim() || undefined,
        linkedinUrl: linkedinUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });
      notify.success('Professional profile updated');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update professional profile');
    } finally { setSavingPro(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 p-6 space-y-6 max-w-2xl w-full mx-auto">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );

  const completionItems = [
    { label: 'Profile photo',    done: !!me?.avatarUrl },
    { label: 'Bio (100+ chars)', done: bio.trim().length >= 100 },
    { label: 'Bank details',     done: !!(bankName && accountNumber) },
    { label: 'Intro video',      done: !!savedVideoUrl },
  ];
  const completionPct = Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100);
  const isComplete = completionPct === 100;
  const hasVideo = !!savedVideoUrl;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Profile" subtitle="Update your teaching profile visible to students"
        backHref="/teacher/dashboard" backLabel="Dashboard" />

      <div className="flex-1 p-6 space-y-6 max-w-2xl w-full mx-auto">

        {/* Completeness banner */}
        {!isComplete && (
          <Card padding="md" className="border-cloud bg-surface">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-navy">Profile completeness</p>
                <p className="text-sm font-medium text-royal/60 mt-0.5">
                  {completionPct}% complete{!hasVideo ? ' — add an intro video to make your mentorship slots visible to students' : ' — finish your profile to appear in student searches'}
                </p>
              </div>
              <span className="flex-shrink-0 text-2xl font-bold text-navy">{completionPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-cloud overflow-hidden mb-3">
              <div className="h-full rounded-full bg-azure transition-all duration-500" style={{ width: `${completionPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {completionItems.map(item => (
                <span key={item.label}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    item.done ? 'bg-green-100 text-green-700' : 'bg-cloud text-royal/60'
                  }`}>
                  {item.done
                    ? <Icon name="check" size={12} />
                    : <span className="h-2 w-2 rounded-full bg-royal/30" />
                  }
                  {item.label}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Avatar upload */}
        <Card padding="md">
          <p className="text-sm font-semibold text-navy mb-4">Profile photo</p>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {me?.avatarUrl ? (
                <Image src={me.avatarUrl} alt="Avatar" width={72} height={72}
                  className="w-18 h-18 rounded-2xl object-cover" />
              ) : (
                <div className="w-18 h-18 rounded-2xl bg-cloud flex items-center justify-center text-azure font-bold text-2xl">
                  {(me?.firstName?.[0] ?? me?.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <div {...(getAvatarRootProps() as React.HTMLAttributes<HTMLDivElement>)}
              className={`flex-1 border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-colors
                ${isAvatarDrag ? 'border-azure bg-cloud' : 'border-cloud hover:border-azure/50'}`}>
              <input {...getAvatarInputProps()} />
              {uploadingAvatar ? (
                <p className="text-xs text-royal/40">Uploading…</p>
              ) : (
                <>
                  <Icon name="upload" size={18} className="text-azure mx-auto mb-1" />
                  <p className="text-xs font-semibold text-navy">Drop photo or click to browse</p>
                  <p className="text-[10px] text-royal/40 mt-0.5">JPG, PNG, WebP — max 5 MB</p>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Video intro */}
        <Card padding="md" className={!hasVideo ? 'border-amber-200 bg-amber-50/30' : undefined}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-navy">Intro video</p>
              {!hasVideo && (
                <p className="text-[10px] font-semibold text-amber-600 mt-0.5 flex items-center gap-1">
                  <span>⚠</span> Required — your slots are hidden from students until this is added
                </p>
              )}
            </div>
            {hasVideo && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700 flex-shrink-0">
                <Icon name="check" size={11} />
                Live on your profile
              </span>
            )}
          </div>
          <p className="text-xs text-royal/50 mb-4">
            A 60–90 second intro video is required before your availability slots appear to students. It helps them choose you with confidence.
          </p>
          {savedVideoUrl && <VideoEmbed url={savedVideoUrl} className="mb-4" />}
          <div {...(getVideoRootProps() as React.HTMLAttributes<HTMLDivElement>)}
            className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors mb-4
              ${isVideoDrag ? 'border-azure bg-cloud' : 'border-cloud hover:border-azure/50'}`}>
            <input {...getVideoInputProps()} />
            {uploadingVideo ? (
              <div className="space-y-2">
                <p className="text-xs text-royal/60">Uploading video… {videoProgress}%</p>
                <div className="h-1.5 rounded-full bg-cloud overflow-hidden">
                  <div className="h-full bg-azure transition-all" style={{ width: `${videoProgress}%` }} />
                </div>
              </div>
            ) : (
              <>
                <Icon name="live" size={20} className="text-azure mx-auto mb-2" />
                <p className="text-xs font-semibold text-navy">Drop video or click to upload</p>
                <p className="text-[10px] text-royal/40 mt-0.5">MP4, MOV, WebM — max 100 MB</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input value={videoIntroUrl} onChange={e => setVideoIntroUrl(e.target.value)}
              type="url" placeholder="Or paste a YouTube / Vimeo link"
              className="flex-1 input-base" />
            <Button size="sm" loading={savingVideo} disabled={!videoIntroUrl.trim()} onClick={() => saveVideoUrl()}>Save</Button>
            {savedVideoUrl && (
              <Button size="sm" variant="ghost" loading={savingVideo} onClick={removeVideo}>Remove</Button>
            )}
          </div>
        </Card>

        {/* Basic info */}
        <Card padding="md">
          <p className="text-sm font-semibold text-navy mb-5">Basic information</p>
          <form onSubmit={saveBasic} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">First name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Last name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Phone number</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Email address</label>
                <input value={me?.email ?? ''} disabled
                  className="input-base" />
              </div>
            </div>
            <Button type="submit" size="sm" loading={savingBasic}>
              <Icon name="check" size={13} /> Save
            </Button>
          </form>
        </Card>

        {/* Professional profile */}
        <Card padding="md">
          <p className="text-sm font-semibold text-navy mb-5">Professional profile</p>
          <form onSubmit={saveProfessional} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">
                Bio <span className="font-normal text-royal/40">(min. 100 characters)</span>
              </label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={5}
                placeholder="Describe your expertise, teaching style, and experience…"
                className="input-base resize-none" />
              <p className={`text-[10px] ${bio.length < 100 && bio.length > 0 ? 'text-amber-500' : 'text-royal/40'}`}>
                {bio.length} / 100 minimum characters
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">
                LinkedIn URL <span className="font-normal text-royal/40">(optional)</span>
              </label>
              <input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                type="url" placeholder="https://linkedin.com/in/yourname"
                className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">
                Website <span className="font-normal text-royal/40">(optional)</span>
              </label>
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                type="url" placeholder="https://yourwebsite.com"
                className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30" />
            </div>
            <Button type="submit" size="sm" loading={savingPro}>
              <Icon name="check" size={13} /> Save professional profile
            </Button>
          </form>
        </Card>

        {/* Bank / payout details */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-navy">Bank / payout details</p>
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
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Account number</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                  placeholder="0123456789"
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">
                  Bank code / sort code <span className="font-normal text-royal/40">(optional)</span>
                </label>
                <input value={bankCode} onChange={e => setBankCode(e.target.value)}
                  placeholder="011"
                  className="input-base" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Country</label>
                <input value={bankCountry} onChange={e => setBankCountry(e.target.value)}
                  placeholder="NG"
                  className="input-base" />
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

        {/* Teaching info (read-only) */}
        {(!!me?.subjectAreas?.length || me?.qualification || me?.yearsExperience) && (
          <Card padding="md">
            <p className="text-sm font-semibold text-navy mb-4">Teaching credentials</p>
            <div className="divide-y divide-cloud">
              {me?.qualification && (
                <div className="flex items-center justify-between py-3">
                  <p className="text-xs text-royal/50">Qualification</p>
                  <p className="text-xs font-semibold text-navy capitalize">{me.qualification.toLowerCase().replace('_', ' ')}</p>
                </div>
              )}
              {me?.yearsExperience !== undefined && me?.yearsExperience !== null && (
                <div className="flex items-center justify-between py-3">
                  <p className="text-xs text-royal/50">Years of experience</p>
                  <p className="text-xs font-semibold text-navy">{me.yearsExperience} year{me.yearsExperience !== 1 ? 's' : ''}</p>
                </div>
              )}
              {!!me?.subjectAreas?.length && (
                <div className="flex items-start justify-between py-3 gap-4">
                  <p className="text-xs text-royal/50 flex-shrink-0">Subject areas</p>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {(me?.subjectAreas ?? []).map((s: string) => (
                      <span key={s} className="rounded-full bg-cloud px-2.5 py-1 text-[10px] font-semibold text-navy">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-royal/40 mt-3">
              Teaching credentials are set during registration. Contact support to update them.
            </p>
          </Card>
        )}

        {/* Rating summary */}
        {teacherProfile && (
          <Card padding="md">
            <p className="text-sm font-semibold text-navy mb-4">Student ratings</p>
            {teacherProfile.reviewCount === 0 ? (
              <p className="text-sm text-royal/40">No reviews yet. Students can leave reviews on your public profile.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-4xl font-black text-navy">{teacherProfile.avgRating}</p>
                  <div className="flex gap-0.5 mt-1 justify-center">
                    {[1,2,3,4,5].map(s => (
                      <Icon key={s} name="star" size={14}
                        className={s <= Math.round(teacherProfile.avgRating ?? 0) ? 'text-amber-400' : 'text-cloud'} />
                    ))}
                  </div>
                </div>
                <div className="text-sm text-royal/40">
                  Based on <span className="font-semibold text-navy">{teacherProfile.reviewCount}</span> student review{teacherProfile.reviewCount !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Agreement */}
        <Card padding="md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">Legal</p>
              <p className="text-sm font-bold text-navy">Content Ownership Agreement</p>
              <p className="text-xs text-royal/50 mt-0.5">Tutor Offer Letter &amp; Content Ownership Agreement {me?.agreementVersion ?? 'v1.0 · 2026'}</p>
            </div>
            {me?.agreementAcceptedAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-bold text-green-700 flex-shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700 flex-shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Not signed
              </span>
            )}
          </div>

          {me?.agreementAcceptedAt && (
            <p className="text-xs text-royal/50 mt-3">
              Accepted on {new Date(me.agreementAcceptedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-cloud">
            <a href="/legal/tutor-agreement" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
              <Icon name="file" size={12} />
              View agreement
            </a>
            {!me?.agreementAcceptedAt && (
              <p className="text-xs text-amber-600">
                Please review and accept the agreement to continue using the platform.
              </p>
            )}
          </div>
        </Card>

        {/* My courses */}
        {!!teacherProfile?.platformCourses?.length && (
          <Card padding="md">
            <p className="text-sm font-semibold text-navy mb-4">
              My courses ({teacherProfile?.platformCourses?.length ?? 0})
            </p>
            <div className="divide-y divide-cloud">
              {(teacherProfile?.platformCourses ?? []).map(course => (
                <div key={course.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy line-clamp-1">{course.title}</p>
                    <p className="text-xs text-royal/40">
                      {new Date(course.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {course.wpCourseId ? ' · WordPress' : ' · Native'}
                    </p>
                  </div>
                  <span className={`ml-4 text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLORS[course.status] ?? 'bg-cloud text-royal/60'}`}>
                    {course.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
