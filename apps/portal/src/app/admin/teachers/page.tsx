'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import api from '@/lib/api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Teacher {
  id: string;
  email: string;
  approvalStatus: Status;
  videoIntroUrl?: string | null;
  agreementAcceptedAt?: string | null;
  agreementVersion?: string | null;
  teacherApplication: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    subjectAreas: string[];
    yearsExperience?: number | null;
    qualification?: string | null;
    teachingModality?: string | null;
    bio: string;
    documentUrl?: string | null;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
    rejectionReason?: string | null;
    submittedAt: string;
  } | null;
}

const QUALIFICATION_LABEL: Record<string, string> = {
  HIGH_SCHOOL: 'High school', BACHELOR: "Bachelor's", MASTER: "Master's",
  PHD: 'PhD', PROFESSIONAL: 'Professional cert.',
};
const MODALITY_LABEL: Record<string, string> = {
  ONLINE: 'Online', IN_PERSON: 'In-person', HYBRID: 'Hybrid',
};

function initials(t: Teacher): string {
  const app = t.teacherApplication;
  if (app?.firstName && app?.lastName) return `${app.firstName[0]}${app.lastName[0]}`.toUpperCase();
  return t.email[0].toUpperCase();
}

function displayName(t: Teacher): string {
  const app = t.teacherApplication;
  if (app?.firstName && app?.lastName) return `${app.firstName} ${app.lastName}`;
  return t.email.split('@')[0];
}

// ─── Rejection modal ─────────────────────────────────────────────────────────

function RejectModal({
  teacher, onClose, onConfirm, loading,
}: {
  teacher: Teacher;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-cloud bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Reject application</p>
            <p className="text-xs text-royal/50 mt-0.5">{displayName(teacher)}</p>
          </div>
          <button onClick={onClose} className="text-royal/40 hover:text-navy transition">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-navy">
            Rejection reason <span className="font-normal text-royal/40">(sent to applicant by email)</span>
          </label>
          <textarea rows={4} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Insufficient teaching experience for this platform at this time. Please reapply after gaining more credentials."
            className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-red-400 resize-none placeholder:text-royal/40" />
          <p className="text-[10px] text-royal/40">{reason.length} / 500 max</p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => onConfirm(reason)}
            loading={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600">
            Reject application
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Teacher card ────────────────────────────────────────────────────────────

function TeacherCard({
  teacher, onApprove, onReject, deciding,
}: {
  teacher: Teacher;
  onApprove?: (id: string) => void;
  onReject?: (t: Teacher) => void;
  deciding: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [videoUrl, setVideoUrl] = useState(teacher.videoIntroUrl ?? '');
  const [savingVideo, setSavingVideo] = useState(false);
  const app = teacher.teacherApplication;

  async function saveVideoUrl() {
    setSavingVideo(true);
    try {
      await api.patch(`/teachers/admin/${teacher.id}/video`, {
        videoIntroUrl: videoUrl.trim() || null,
      });
      notify.success('Intro video saved');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save video');
    } finally { setSavingVideo(false); }
  }

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header row */}
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-4 px-5 py-4 w-full text-left hover:bg-cloud/30 transition">
        {/* Avatar */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-azure text-sm font-bold text-white flex-shrink-0">
          {initials(teacher)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{displayName(teacher)}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <p className="text-xs text-royal/50 truncate">{teacher.email}</p>
            {app?.teachingModality && (
              <span className="text-[10px] font-semibold text-royal/40 bg-cloud px-2 py-0.5 rounded-full">
                {MODALITY_LABEL[app.teachingModality] ?? app.teachingModality}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {(app?.subjectAreas?.length ?? 0) > 0 && app && (
            <div className="hidden sm:flex gap-1 flex-wrap max-w-[180px]">
              {app.subjectAreas.slice(0, 2).map(s => (
                <span key={s} className="text-[10px] font-semibold bg-azure/10 text-azure px-2 py-0.5 rounded-full">{s}</span>
              ))}
              {app.subjectAreas.length > 2 && (
                <span className="text-[10px] text-royal/40">+{app.subjectAreas.length - 2}</span>
              )}
            </div>
          )}
          {app?.yearsExperience != null && (
            <span className="text-xs text-royal/40 hidden sm:block">{app.yearsExperience}y exp</span>
          )}
          <Badge variant={
            teacher.approvalStatus === 'APPROVED' ? 'active' :
            teacher.approvalStatus === 'REJECTED' ? 'default' : 'muted'
          }>
            {teacher.approvalStatus}
          </Badge>
          <Icon name="chevronDown" size={14} className={`text-royal/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
      {expanded && app && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
        <div className="border-t border-cloud px-5 pb-5 pt-4 space-y-5">
          {/* Meta row */}
          <div className="flex flex-wrap gap-3">
            {app.qualification && (
              <div className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5">
                <Icon name="graduate" size={12} className="text-royal/40" />
                <span className="text-xs text-navy">{QUALIFICATION_LABEL[app.qualification] ?? app.qualification}</span>
              </div>
            )}
            {app.phone && (
              <div className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5">
                <Icon name="phone" size={12} className="text-royal/40" />
                <span className="text-xs text-navy">{app.phone}</span>
              </div>
            )}
            {app.submittedAt && (
              <div className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5">
                <Icon name="calendar" size={12} className="text-royal/40" />
                <span className="text-xs text-navy">
                  Applied {new Date(app.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {/* All subject chips */}
          {app.subjectAreas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {app.subjectAreas.map(s => (
                <span key={s} className="text-xs font-semibold bg-azure/10 text-azure px-3 py-1 rounded-full">{s}</span>
              ))}
            </div>
          )}

          {/* Bio */}
          {app.bio && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40 mb-1.5">BIO</p>
              <p className="text-sm text-navy/80 leading-relaxed">{app.bio}</p>
            </div>
          )}

          {/* Rejection reason (for rejected) */}
          {teacher.approvalStatus === 'REJECTED' && app.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-1">REJECTION REASON</p>
              <p className="text-sm text-red-700">{app.rejectionReason}</p>
            </div>
          )}

          {/* Intro video */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">Intro video</p>
            {videoUrl && (
              <video src={videoUrl.startsWith('http') && !videoUrl.includes('youtube') && !videoUrl.includes('vimeo')
                ? videoUrl : undefined}
                controls={!videoUrl.includes('youtube') && !videoUrl.includes('vimeo')}
                className="w-full rounded-xl max-h-40 object-cover bg-black"
              />
            )}
            <div className="flex gap-2">
              <input
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                type="url"
                placeholder="YouTube, Vimeo, or direct video URL"
                className="flex-1 rounded-xl border border-cloud bg-white px-3 py-2 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/30"
              />
              <Button size="sm" loading={savingVideo} onClick={saveVideoUrl}>
                {videoUrl ? 'Update' : 'Set'}
              </Button>
            </div>
            <p className="text-[10px] text-royal/40">
              {videoUrl
                ? 'Visible on this teacher\'s public profile and in student mentor browse.'
                : 'Required for WP teachers — paste a YouTube/Vimeo link or a direct upload URL from Cloudflare R2.'}
            </p>
          </div>

          {/* Agreement status */}
          <div className="rounded-xl border border-cloud bg-surface px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon name="file" size={13} className="text-royal/40" />
              <p className="text-xs font-semibold text-navy">Content Ownership Agreement</p>
            </div>
            {teacher.agreementAcceptedAt ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Signed {new Date(teacher.agreementAcceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {teacher.agreementVersion && (
                  <span className="text-[10px] text-royal/40">{teacher.agreementVersion}</span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Not yet signed
              </span>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {app.linkedinUrl && (
              <a href={app.linkedinUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                <Icon name="mentorship" size={12} /> LinkedIn
              </a>
            )}
            {app.websiteUrl && (
              <a href={app.websiteUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                <Icon name="arrowRight" size={12} /> Website
              </a>
            )}
            {app.documentUrl && (
              <a href={app.documentUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                <Icon name="file" size={12} /> View CV
              </a>
            )}
          </div>

          {/* Actions — only shown for PENDING */}
          {teacher.approvalStatus === 'PENDING' && onApprove && onReject && (
            <div className="flex gap-3 pt-1 border-t border-cloud">
              <Button size="sm" loading={deciding} onClick={() => onApprove(teacher.id)}>
                <Icon name="check" size={13} /> Approve
              </Button>
              <Button size="sm" loading={deciding}
                className="bg-red-500 border-red-500 hover:bg-red-600 hover:border-red-600"
                onClick={() => onReject(teacher)}>
                <Icon name="close" size={13} /> Reject
              </Button>
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminTeachersPage() {
  const [all, setAll] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status>('PENDING');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Teacher | null>(null);

  async function load() {
    try {
      const r = await api.get('/portals/admin/teachers');
      setAll(r.data);
    } catch { setAll([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setDeciding(id);
    try {
      await api.patch(`/portals/admin/teachers/${id}/approve`, { decision: 'approve' });
      const teacher = all.find(t => t.id === id);
      notify.success('Teacher approved', { description: displayName(teacher!) });
      setAll(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: 'APPROVED' } : t));
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    } finally { setDeciding(null); }
  }

  async function rejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setDeciding(id);
    try {
      await api.patch(`/portals/admin/teachers/${id}/approve`, { decision: 'reject', rejectionReason: reason || undefined });
      setAll(prev => prev.map(t => t.id === id
        ? { ...t, approvalStatus: 'REJECTED', teacherApplication: t.teacherApplication ? { ...t.teacherApplication, rejectionReason: reason || null } : null }
        : t
      ));
      setRejectTarget(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    } finally { setDeciding(null); }
  }

  const counts = {
    PENDING:  all.filter(t => t.approvalStatus === 'PENDING').length,
    APPROVED: all.filter(t => t.approvalStatus === 'APPROVED').length,
    REJECTED: all.filter(t => t.approvalStatus === 'REJECTED').length,
  };

  const filtered = all.filter(t => t.approvalStatus === tab);

  const TABS: { key: Status; label: string; color: string }[] = [
    { key: 'PENDING',  label: 'Pending',  color: 'text-amber-500' },
    { key: 'APPROVED', label: 'Approved', color: 'text-azure' },
    { key: 'REJECTED', label: 'Rejected', color: 'text-red-500' },
  ];

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-20 animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col min-h-full">
        <Topbar title="Teachers" subtitle="Review applications and manage the teaching roster" />
        <div className="flex-1 p-6 space-y-5">

          {/* Stats header */}
          <div className="grid grid-cols-3 gap-3">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-2xl border p-4 text-left transition-all ${tab === t.key ? 'border-azure bg-azure/5' : 'border-cloud bg-white hover:bg-cloud/30'}`}>
                <p className={`text-2xl font-black ${t.color}`}>{counts[t.key]}</p>
                <p className="text-xs font-semibold text-royal/50 mt-0.5">{t.label}</p>
              </button>
            ))}
          </div>

          {/* Tab selector */}
          <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === t.key ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
                {t.label}
                {counts[t.key] > 0 && (
                  <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-azure text-white' : 'bg-cloud text-royal/40'}`}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={tab === 'PENDING' ? 'assignments' : tab === 'APPROVED' ? 'check' : 'close'}
                title={tab === 'PENDING' ? 'All caught up!' : `No ${tab.toLowerCase()} teachers`}
                description={tab === 'PENDING' ? 'No pending teacher applications to review' : `There are no ${tab.toLowerCase()} applications yet`}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(t => (
                <TeacherCard key={t.id} teacher={t}
                  onApprove={tab === 'PENDING' ? approve : undefined}
                  onReject={tab === 'PENDING' ? setRejectTarget : undefined}
                  deciding={deciding === t.id} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rejection modal */}
      {rejectTarget && (
        <RejectModal
          teacher={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={rejectConfirm}
          loading={deciding === rejectTarget.id} />
      )}
    </>
  );
}
