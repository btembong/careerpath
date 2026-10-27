'use client';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import api from '@/lib/api';
import { toast } from 'sonner';

interface Profile {
  id: string;
  name: string;
  email: string;
  bio?: string;
  location?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  joinedAt?: string;
  skills?: string[];
}

interface Certificate {
  id: string;
  title: string;
  issuedAt: string;
  course?: { title?: string };
  verifyUrl?: string;
}

interface EnrolledCourse {
  id: string;
  title: string;
  progress?: number;
  thumbnailUrl?: string;
}

const SKILL_COLORS = [
  'bg-azure/10 text-azure',
  'bg-purple-100 text-purple-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-cyan-100 text-cyan-600',
];

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', bio: '', location: '', linkedinUrl: '' });
  const [newSkill, setNewSkill] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then(r => {
        const u = r.data?.user ?? r.data;
        setProfile(u);
        setForm({
          name: u.name ?? '',
          bio: u.bio ?? '',
          location: u.location ?? '',
          linkedinUrl: u.linkedinUrl ?? '',
        });
      }).catch(() => {}),
      api.get('/certificates').then(r => setCerts((r.data ?? []).map((c: {
        id: string; courseName: string; issuedAt: string; verifyCode: string;
      }) => ({
        id: c.id,
        title: c.courseName,
        issuedAt: c.issuedAt,
        course: { title: c.courseName },
        verifyUrl: `/verify/${c.verifyCode}`,
      })))).catch(() => {}),
      api.get('/education/enrollments').then(r => setCourses(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', form);
      setProfile(prev => ({ ...prev!, ...data }));
      setEditing(false);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: uploaded } = await api.post('/files/upload?folder=avatars', fd);
      const url = uploaded?.url ?? uploaded?.fileUrl;
      if (!url) throw new Error('No URL returned');
      await api.patch('/auth/profile', { avatarUrl: url });
      setProfile(prev => prev ? { ...prev, avatarUrl: url } : prev);
      toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function addSkill() {
    const skill = newSkill.trim();
    if (!skill) return;
    const updated = [...(profile?.skills ?? []), skill];
    try {
      await api.patch('/auth/profile', { skills: updated });
      setProfile(prev => prev ? { ...prev, skills: updated } : prev);
      setNewSkill('');
    } catch {
      toast.error('Could not add skill');
    }
  }

  async function removeSkill(skill: string) {
    const updated = (profile?.skills ?? []).filter(s => s !== skill);
    try {
      await api.patch('/auth/profile', { skills: updated });
      setProfile(prev => prev ? { ...prev, skills: updated } : prev);
    } catch {
      toast.error('Could not remove skill');
    }
  }

  function copyProfileLink() {
    const url = `${window.location.origin}/profile/${profile?.id}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Profile link copied!'));
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 bg-cloud animate-pulse" />
      <div className="p-6 space-y-4">
        <div className="h-32 rounded-2xl bg-cloud animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {[1,2].map(i => <div key={i} className="h-48 rounded-2xl bg-cloud animate-pulse" />)}
          </div>
          <div className="space-y-4">
            {[1,2].map(i => <div key={i} className="h-32 rounded-2xl bg-cloud animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  );

  const joinYear = profile?.joinedAt ? new Date(profile.joinedAt).getFullYear() : null;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="My Profile"
        subtitle="Your public profile and achievements"
        backHref="/student/dashboard"
        backLabel="Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={copyProfileLink}
              className="flex items-center gap-1.5 rounded-xl border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
              <Icon name="community" size={13} /> Share
            </button>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-xl bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-azure/90 transition">
                <Icon name="settings" size={13} /> Edit
              </button>
            ) : (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-azure/90 transition disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl">

        {/* Hero card */}
        <Card padding="md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative group">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name ?? ''} className="h-16 w-16 rounded-full object-cover ring-2 ring-cloud" />
              ) : (
                <Avatar name={profile?.name ?? profile?.email} size="lg" />
              )}
              {certs.length > 0 && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-azure text-[10px] font-bold text-white ring-2 ring-white">
                  {certs.length}
                </span>
              )}
              {/* Avatar upload overlay */}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-navy/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingAvatar ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon name="upload" size={18} className="text-white" />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatar(file);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="text-xl font-bold text-navy border-b border-azure bg-transparent outline-none w-full max-w-sm"
                />
              ) : (
                <h1 className="text-xl font-bold text-navy">{profile?.name ?? 'Student'}</h1>
              )}
              <p className="text-xs text-royal/60 mt-0.5">{profile?.email}</p>
              {editing ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="City, Country"
                    className="w-full max-w-xs rounded-lg border border-cloud px-3 py-1.5 text-xs text-navy outline-none focus:border-azure"
                  />
                  <input
                    value={form.linkedinUrl}
                    onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                    placeholder="LinkedIn URL"
                    className="w-full max-w-xs rounded-lg border border-cloud px-3 py-1.5 text-xs text-navy outline-none focus:border-azure"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {profile?.location && (
                    <span className="flex items-center gap-1 text-xs text-royal/60">
                      <Icon name="countries" size={12} /> {profile.location}
                    </span>
                  )}
                  {joinYear && (
                    <span className="flex items-center gap-1 text-xs text-royal/60">
                      <Icon name="calendar" size={12} /> Member since {joinYear}
                    </span>
                  )}
                  {profile?.linkedinUrl && (
                    <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-azure hover:underline">
                      <Icon name="community" size={12} /> LinkedIn
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Stats pills */}
            <div className="flex sm:flex-col gap-3 sm:gap-2 ml-auto text-right">
              <div className="text-center">
                <p className="text-lg font-bold text-navy">{courses.length}</p>
                <p className="text-[10px] text-royal/50 uppercase tracking-wide">Courses</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-navy">{certs.length}</p>
                <p className="text-[10px] text-royal/50 uppercase tracking-wide">Certs</p>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-4 pt-4 border-t border-cloud">
            {editing ? (
              <div>
                <textarea
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  placeholder="Write a short bio about yourself…"
                  rows={3}
                  className="w-full rounded-xl border border-cloud px-3 py-2 text-sm text-navy outline-none focus:border-azure resize-none"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-royal/50 hover:text-navy px-3 py-1">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-royal/70 leading-relaxed">
                {profile?.bio || <span className="italic text-royal/40">No bio yet. Click Edit to add one.</span>}
              </p>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: courses + certs */}
          <div className="lg:col-span-2 space-y-5">

            {/* Enrolled courses */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Enrolled Courses</p>
              {courses.length === 0 ? (
                <p className="text-xs text-royal/40 text-center py-6">No courses yet</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {courses.map((c, i) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 rounded-xl border border-cloud p-3"
                    >
                      <div className="h-10 w-10 rounded-xl bg-azure/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {c.thumbnailUrl
                          ? <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover rounded-xl" />
                          : <Icon name="courses" size={16} className="text-azure" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{c.title}</p>
                        {c.progress !== undefined && (
                          <div className="mt-1.5 h-1 w-full rounded-full bg-cloud overflow-hidden">
                            <div className="h-full rounded-full bg-azure" style={{ width: `${c.progress}%` }} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

            {/* Certificate wall */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Certificates</p>
              {certs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Icon name="certificates" size={32} className="text-cloud mb-2" />
                  <p className="text-xs font-semibold text-navy">No certificates yet</p>
                  <p className="text-[11px] text-royal/40 mt-0.5">Complete a course to earn your first certificate</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {certs.map((cert, i) => (
                    <motion.div
                      key={cert.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative rounded-xl border border-azure/20 bg-gradient-to-br from-azure/5 to-royal/5 p-4"
                    >
                      <div className="absolute top-0 right-0 w-0 h-0 border-t-[32px] border-r-[32px] border-t-transparent border-r-azure/20 rounded-tr-xl" />
                      <Icon name="certificates" size={20} className="text-azure mb-2" />
                      <p className="text-xs font-bold text-navy leading-snug">{cert.title}</p>
                      {cert.course?.title && (
                        <p className="text-[10px] text-royal/50 mt-0.5 truncate">{cert.course.title}</p>
                      )}
                      <p className="text-[10px] text-royal/40 mt-1">
                        {new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {cert.verifyUrl && (
                        <a href={cert.verifyUrl} target="_blank" rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-azure hover:underline">
                          <Icon name="shield" size={10} /> Verify
                        </a>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>

          </div>

          {/* Right: Skills + quick links */}
          <div className="space-y-5">

            {/* Skills */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Skills</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(profile?.skills ?? []).length === 0 && (
                  <p className="text-[11px] text-royal/40 italic">No skills yet</p>
                )}
                {(profile?.skills ?? []).map((skill, i) => (
                  <motion.span
                    key={skill}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                  >
                    {skill}
                    <button
                      onClick={() => removeSkill(skill)}
                      className="ml-0.5 text-current opacity-40 hover:opacity-100 transition leading-none">×</button>
                  </motion.span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSkill()}
                  placeholder="Add skill…"
                  className="flex-1 rounded-lg border border-cloud px-2.5 py-1.5 text-xs text-navy outline-none focus:border-azure"
                />
                <button
                  onClick={addSkill}
                  disabled={!newSkill.trim()}
                  className="rounded-lg bg-azure px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 transition hover:bg-azure/90">+</button>
              </div>
            </Card>

            {/* Quick links */}
            <Card padding="md">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Quick Links</p>
              <div className="space-y-1.5">
                {[
                  { label: 'My Progress', href: '/student/progress', icon: 'reports' as const },
                  { label: 'Roadmap', href: '/student/roadmap', icon: 'notebook' as const },
                  { label: 'Certificates', href: '/student/certificates', icon: 'certificates' as const },
                  { label: 'Mentorship', href: '/student/mentorship', icon: 'mentorship' as const },
                ].map(link => (
                  <a key={link.href} href={link.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-cloud transition group">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cloud text-azure group-hover:bg-azure/10">
                      <Icon name={link.icon} size={14} />
                    </span>
                    <span className="text-xs font-semibold text-navy">{link.label}</span>
                    <Icon name="arrowRight" size={12} className="ml-auto text-royal/30" />
                  </a>
                ))}
              </div>
            </Card>

            {/* Share card */}
            <Card padding="md" className="bg-gradient-to-br from-azure to-royal text-white border-0">
              <Icon name="community" size={20} className="mb-2 text-white/80" />
              <p className="text-sm font-bold">Share your profile</p>
              <p className="text-[11px] text-white/70 mt-0.5 leading-snug">
                Show your certificates and skills to employers and peers.
              </p>
              <button
                onClick={copyProfileLink}
                className="mt-3 w-full rounded-xl bg-white/20 hover:bg-white/30 transition py-2 text-xs font-bold text-white">
                Copy profile link
              </button>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
