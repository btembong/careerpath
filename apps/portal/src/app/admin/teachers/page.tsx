'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection, InfoGrid, Stepper } from '@/components/ui/Dialog';
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
const STATUS_LABEL: Record<Status, string> = { PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected' };

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

// ─── Rejection dialog ────────────────────────────────────────────────────────

function RejectDialog({
  teacher, onClose, onConfirm, loading,
}: {
  teacher: Teacher | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { setReason(''); }, [teacher?.id]);

  return (
    <Dialog open={!!teacher} onOpenChange={o => { if (!o) onClose(); }}>
      {teacher && (
        <DialogContent title="Reject application" description={displayName(teacher)}>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-navy">Reason <span className="font-normal text-muted">(sent to the applicant by email)</span></span>
            <textarea rows={4} value={reason} maxLength={500} onChange={e => setReason(e.target.value)}
              placeholder="For example: we need at least two years of classroom experience. You're welcome to apply again later."
              className="w-full resize-none rounded-md border border-line bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-muted" />
            <span className="block text-xs text-muted">{reason.length} / 500</span>
          </label>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="danger" size="sm" loading={loading} onClick={() => onConfirm(reason)}>Reject application</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Application drawer ──────────────────────────────────────────────────────

function TeacherDrawer({
  teacher, onClose, onApprove, onReject, deciding,
}: {
  teacher: Teacher | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (t: Teacher) => void;
  deciding: boolean;
}) {
  const [videoUrl, setVideoUrl] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);
  useEffect(() => { setVideoUrl(teacher?.videoIntroUrl ?? ''); }, [teacher?.id, teacher?.videoIntroUrl]);

  async function saveVideoUrl() {
    if (!teacher) return;
    setSavingVideo(true);
    try {
      await api.patch(`/teachers/admin/${teacher.id}/video`, { videoIntroUrl: videoUrl.trim() || null });
      notify.success('Intro video saved');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not save the video link');
    } finally { setSavingVideo(false); }
  }

  const app = teacher?.teacherApplication;
  const step = !teacher ? 0
    : teacher.approvalStatus === 'PENDING' ? 1
    : teacher.approvalStatus === 'REJECTED' ? 2
    : teacher.agreementAcceptedAt ? 4 : 3;
  const isFile = videoUrl.startsWith('http') && !/youtube|youtu\.be|vimeo/.test(videoUrl);

  return (
    <Drawer open={!!teacher} onOpenChange={o => { if (!o) onClose(); }}>
      {teacher && (
        <DrawerContent title={displayName(teacher)} description={teacher.email}
          action={app?.documentUrl ? (
            <a href={app.documentUrl} target="_blank" rel="noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle transition-colors">
              View CV
            </a>
          ) : undefined}>

          <Stepper steps={['Applied', 'Under review', teacher.approvalStatus === 'REJECTED' ? 'Rejected' : 'Approved', 'Agreement signed']} current={step} />

          <InfoGrid items={[
            { label: 'Status', value: STATUS_LABEL[teacher.approvalStatus] },
            { label: 'Qualification', value: app?.qualification ? (QUALIFICATION_LABEL[app.qualification] ?? app.qualification) : '—' },
            { label: 'Experience', value: app?.yearsExperience != null ? `${app.yearsExperience} years` : '—' },
            { label: 'Teaches', value: app?.teachingModality ? (MODALITY_LABEL[app.teachingModality] ?? app.teachingModality) : '—' },
            { label: 'Phone', value: app?.phone || '—' },
            { label: 'Applied', value: app?.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
          ]} />

          {app && app.subjectAreas.length > 0 && (
            <DrawerSection title="Subjects" count={app.subjectAreas.length}>
              <div className="flex flex-wrap gap-1.5">
                {app.subjectAreas.map(s => <Badge key={s} variant="default">{s}</Badge>)}
              </div>
            </DrawerSection>
          )}

          {app?.bio && (
            <DrawerSection title="About">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink2">{app.bio}</p>
            </DrawerSection>
          )}

          {teacher.approvalStatus === 'REJECTED' && app?.rejectionReason && (
            <DrawerSection title="Reason for rejection">
              <p className="rounded-md border border-line bg-subtle px-3 py-2.5 text-sm text-ink2">{app.rejectionReason}</p>
            </DrawerSection>
          )}

          <DrawerSection title="Content agreement">
            <p className="text-sm text-ink2">
              {teacher.agreementAcceptedAt
                ? <>Signed on <strong className="text-navy">{new Date(teacher.agreementAcceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>{teacher.agreementVersion ? ` (version ${teacher.agreementVersion})` : ''}.</>
                : 'Not signed yet. Teachers sign it when they first open their portal after approval.'}
            </p>
          </DrawerSection>

          <DrawerSection title="Intro video">
            {videoUrl && isFile && <video src={videoUrl} controls className="max-h-48 w-full rounded-md bg-black" />}
            <div className="flex gap-2">
              <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} type="url" aria-label="Intro video link"
                placeholder="YouTube, Vimeo or a direct video link" className="input-base" />
              <Button size="sm" variant="secondary" loading={savingVideo} onClick={saveVideoUrl} className="h-[38px]">Save</Button>
            </div>
            <p className="text-xs text-muted">Shown on the teacher&apos;s public profile and when students browse mentors.</p>
          </DrawerSection>

          {(app?.linkedinUrl || app?.websiteUrl) && (
            <DrawerSection title="Links">
              <div className="flex flex-wrap gap-4">
                {app?.linkedinUrl && <a href={app.linkedinUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-azure-strong hover:underline">LinkedIn</a>}
                {app?.websiteUrl && <a href={app.websiteUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-azure-strong hover:underline">Website</a>}
              </div>
            </DrawerSection>
          )}

          {teacher.approvalStatus === 'PENDING' && (
            <div className="flex gap-2 border-t border-line pt-4">
              <Button size="sm" loading={deciding} onClick={() => onApprove(teacher.id)}>Approve</Button>
              <Button size="sm" variant="danger" disabled={deciding} onClick={() => onReject(teacher)}>Reject</Button>
            </div>
          )}
        </DrawerContent>
      )}
    </Drawer>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TeacherRow({ teacher, onOpen }: { teacher: Teacher; onOpen: () => void }) {
  const app = teacher.teacherApplication;
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center gap-4 border-b border-line px-5 py-3.5 text-left last:border-b-0 hover:bg-subtle transition-colors">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-bold text-navy">
        {initials(teacher)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-navy">{displayName(teacher)}</span>
        <span className="block truncate text-[13px] text-muted">{teacher.email}</span>
      </span>
      <span className="hidden min-w-0 max-w-[260px] flex-wrap gap-1 md:flex">
        {app?.subjectAreas.slice(0, 2).map(s => <Badge key={s} variant="default">{s}</Badge>)}
        {(app?.subjectAreas.length ?? 0) > 2 && <span className="self-center text-xs text-muted">+{app!.subjectAreas.length - 2}</span>}
      </span>
      <span className="hidden w-20 text-[13px] text-ink2 sm:block">{app?.yearsExperience != null ? `${app.yearsExperience} yrs` : '—'}</span>
      <Badge variant={teacher.approvalStatus === 'APPROVED' ? 'active' : 'default'}>{STATUS_LABEL[teacher.approvalStatus]}</Badge>
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminTeachersPage() {
  const [all, setAll] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status>('PENDING');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Teacher | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
      notify.success('Teacher approved', { description: teacher ? displayName(teacher) : undefined });
      setAll(prev => prev.map(t => t.id === id ? { ...t, approvalStatus: 'APPROVED' } : t));
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not approve the application');
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
      notify.success('Application rejected');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not reject the application');
    } finally { setDeciding(null); }
  }

  const counts = {
    PENDING:  all.filter(t => t.approvalStatus === 'PENDING').length,
    APPROVED: all.filter(t => t.approvalStatus === 'APPROVED').length,
    REJECTED: all.filter(t => t.approvalStatus === 'REJECTED').length,
  };
  const filtered = all.filter(t => t.approvalStatus === tab);
  const open = all.find(t => t.id === openId) ?? null;
  const TABS: { key: Status; label: string }[] = [
    { key: 'PENDING', label: 'Pending' }, { key: 'APPROVED', label: 'Approved' }, { key: 'REJECTED', label: 'Rejected' },
  ];

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-3">
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Teachers" subtitle="Review applications and manage the teaching roster" />
      <div className="flex-1 space-y-5 p-4 lg:px-7 lg:py-6">

        <div className="grid grid-cols-3 gap-4">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ${tab === t.key ? 'border-azure bg-accent-soft' : 'border-line bg-white hover:bg-subtle'}`}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{t.label}</span>
              <span className="text-2xl font-extrabold text-navy">{counts[t.key]}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon={tab === 'PENDING' ? 'assignments' : tab === 'APPROVED' ? 'check' : 'close'}
              title={tab === 'PENDING' ? 'No applications waiting' : `No ${tab.toLowerCase()} teachers`}
              description={tab === 'PENDING' ? 'New teacher applications appear here for review.' : `There are no ${tab.toLowerCase()} applications yet.`}
            />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            {filtered.map(t => <TeacherRow key={t.id} teacher={t} onOpen={() => setOpenId(t.id)} />)}
          </Card>
        )}
      </div>

      <TeacherDrawer teacher={open} onClose={() => setOpenId(null)}
        onApprove={approve} onReject={setRejectTarget} deciding={!!open && deciding === open.id} />
      <RejectDialog teacher={rejectTarget} onClose={() => setRejectTarget(null)}
        onConfirm={rejectConfirm} loading={!!rejectTarget && deciding === rejectTarget.id} />
    </div>
  );
}
