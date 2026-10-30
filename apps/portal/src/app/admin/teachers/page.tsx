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
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

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
const STATUS_LABEL: Record<Status, string> = { PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected', SUSPENDED: 'Suspended' };

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

// ─── Performance (active and suspended teachers) ─────────────────────────────

interface Money { currency: string; amount: number }
interface PerfRow {
  id: string; name: string; email: string; status: Status; subjects: string[]; courses: number; published: number; students: number;
  rating: number | null; ratings: number; earned30d: Money[]; profileComplete: boolean; missing: string[]; lastActive: string | null;
}
interface PerfOverview {
  stats: { active: number; suspended: number; applications: number; students: number; courses: number; avgRating: number | null; ratings: number; paidThisMonth: Money[] };
  teachers: PerfRow[];
}
interface PerfDetail {
  id: string; name: string; email: string; status: Status; joinedAt: string; lastActive: string | null; subjects: string[]; yearsExperience: number | null;
  profile: { video: boolean; bio: boolean };
  courses: { id: string; title: string; status: string; students: number; commissionPct: number | null }[];
  cohorts: { id: string; name: string; students: number; classesHeld: number; attendancePct: number | null; missingRecordings: number }[];
  mentorship: { freeSlots: number; booked: number; rating: number | null; ratings: number };
  earned30d: Money[];
}
const money = (m: Money[]) => m.length ? m.map(x => `${x.currency} ${minorToMajor(x.amount, x.currency).toLocaleString()}`).join(' · ') : '—';
const COURSE_STATUS: Record<string, string> = { PUBLISHED: 'Published', PENDING_REVIEW: 'In review', DRAFT: 'Draft', ARCHIVED: 'Archived' };

function PerfDrawer({ id, app, onClose, onChanged, onOpenApplication }: { id: string | null; app: Teacher | null; onClose: () => void; onChanged: () => Promise<void>; onOpenApplication: () => void }) {
  const [d, setD] = useState<PerfDetail | null>(null);
  const [busy, setBusy] = useState(false);
  async function load(tid: string) { const r = await api.get(`/portals/admin/teachers/${tid}/overview`); setD(r.data); }
  useEffect(() => { setD(null); if (id) load(id).catch(() => notify.error('Could not load this teacher')); }, [id]);
  async function suspend(on: boolean) {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/portals/admin/teachers/${id}/suspend`, { suspended: on });
      notify.success(on ? 'Teacher suspended' : 'Teacher reinstated', { description: on ? 'They can’t sign in and are hidden from students.' : undefined });
      await load(id); await onChanged();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'That didn’t work'); }
    finally { setBusy(false); }
  }
  return (
    <Drawer open={!!id} onOpenChange={o => { if (!o) onClose(); }}>
      {id && (
        <DrawerContent width="lg" title={d?.name ?? 'Teacher'}
          description={d ? [d.subjects.join(', '), `joined ${new Date(d.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`, d.email].filter(Boolean).join(' · ') : undefined}
          action={d && <a href={`/admin/messages?to=${d.id}`} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Message</a>}
          footer={d && <>
            {app && <Button size="sm" variant="secondary" onClick={onOpenApplication}>Application and intro video</Button>}
            <span className="flex-1" />
            {d.status === 'SUSPENDED'
              ? <Button size="sm" loading={busy} onClick={() => suspend(false)}>Reinstate</Button>
              : <Button size="sm" variant="danger" loading={busy} onClick={() => suspend(true)}>Suspend</Button>}
          </>}>
          {!d ? <div className="h-64 rounded-md bg-subtle animate-pulse" /> : <>
            {d.status === 'SUSPENDED' && <p className="rounded-md border border-line bg-subtle px-3.5 py-2.5 text-[13px] text-ink2"><strong className="text-navy">Suspended.</strong> They can’t sign in, and students can’t see or book them.</p>}
            <InfoGrid items={[
              { label: 'Courses', value: String(d.courses.filter(c => c.status !== 'ARCHIVED').length) },
              { label: 'Students', value: String(d.courses.reduce((n, c) => n + c.students, 0) + d.cohorts.reduce((n, c) => n + c.students, 0)) },
              { label: 'Mentorship rating', value: d.mentorship.rating ? `${d.mentorship.rating} ★ (${d.mentorship.ratings})` : '—' },
              { label: 'Earned, 30 days', value: money(d.earned30d) },
              { label: 'Experience', value: d.yearsExperience ? `${d.yearsExperience} years` : '—' },
              { label: 'Last active', value: d.lastActive ? new Date(d.lastActive).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Never' },
            ]} />
            <DrawerSection title="Courses" count={d.courses.length}>
              {!d.courses.length ? <p className="text-[13px] text-ink2">No courses yet.</p> : d.courses.map(c => (
                <a key={c.id} href={`/admin/courses/${c.id}/builder`} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] hover:bg-subtle">
                  <span className="truncate text-navy">{c.title}</span>
                  <strong className="whitespace-nowrap font-semibold text-navy">{COURSE_STATUS[c.status] ?? c.status}{c.commissionPct != null ? ` · ${c.commissionPct}%` : ''}</strong>
                </a>
              ))}
              <p className="text-xs text-muted">Change a course’s commission in Courses → course drawer.</p>
            </DrawerSection>
            <DrawerSection title="Teaching">
              {!d.cohorts.length ? <p className="text-[13px] text-ink2">No cohorts.</p> : d.cohorts.map(c => (
                <p key={c.id} className="text-[13px] text-ink2">
                  <strong className="text-navy">{c.name}</strong> · {c.students} students · {c.classesHeld} classes{c.attendancePct != null ? ` · ${c.attendancePct}% attendance` : ''}{c.missingRecordings ? ` · ${c.missingRecordings} recording${c.missingRecordings === 1 ? '' : 's'} missing` : ''}
                </p>
              ))}
              <p className="text-[13px] text-ink2">Mentorship: {d.mentorship.freeSlots} free time{d.mentorship.freeSlots === 1 ? '' : 's'} · {d.mentorship.booked} booked</p>
            </DrawerSection>
            <DrawerSection title="Profile">
              <p className="text-[13px] text-ink2">{d.profile.video ? 'Intro video added' : 'No intro video'} · {d.profile.bio ? 'bio added' : 'no bio'} · {d.profile.video && d.status === 'APPROVED' ? 'visible to students for mentorship' : 'not bookable for mentorship'}</p>
            </DrawerSection>
          </>}
        </DrawerContent>
      )}
    </Drawer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Tab = 'APPROVED' | 'PENDING' | 'SUSPENDED' | 'REJECTED';

export default function AdminTeachersPage() {
  const [all, setAll] = useState<Teacher[]>([]);
  const [perf, setPerf] = useState<PerfOverview | null>(null);
  const [tab, setTab] = useState<Tab>('APPROVED');
  const [q, setQ] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Teacher | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [perfId, setPerfId] = useState<string | null>(null);

  async function load() {
    const [a, p] = await Promise.all([
      api.get('/portals/admin/teachers').then(r => r.data as Teacher[]).catch(() => [] as Teacher[]),
      api.get('/portals/admin/teachers-overview').then(r => r.data as PerfOverview).catch(() => null),
    ]);
    setAll(a); setPerf(p);
    if (!p?.teachers.length && a.some(t => t.approvalStatus === 'PENDING')) setTab('PENDING');
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setDeciding(id);
    try {
      await api.patch(`/portals/admin/teachers/${id}/approve`, { decision: 'approve' });
      notify.success('Teacher approved');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not approve the application'); }
    finally { setDeciding(null); }
  }
  async function rejectConfirm(reason: string) {
    if (!rejectTarget) return;
    setDeciding(rejectTarget.id);
    try {
      await api.patch(`/portals/admin/teachers/${rejectTarget.id}/approve`, { decision: 'reject', rejectionReason: reason || undefined });
      setRejectTarget(null); notify.success('Application rejected'); await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not reject the application'); }
    finally { setDeciding(null); }
  }

  const s = perf?.stats;
  const counts: Record<Tab, number> = {
    APPROVED: perf?.teachers.filter(t => t.status === 'APPROVED').length ?? 0,
    PENDING: all.filter(t => t.approvalStatus === 'PENDING').length,
    SUSPENDED: perf?.teachers.filter(t => t.status === 'SUSPENDED').length ?? 0,
    REJECTED: all.filter(t => t.approvalStatus === 'REJECTED').length,
  };
  const match = (text: string) => !q.trim() || text.toLowerCase().includes(q.trim().toLowerCase());
  const perfRows = (perf?.teachers ?? []).filter(t => t.status === tab && match(`${t.name} ${t.email} ${t.subjects.join(' ')}`));
  const appRows = all.filter(t => t.approvalStatus === tab && match(`${displayName(t)} ${t.email}`));
  const app = all.find(t => t.id === appId) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Teachers" subtitle="Applications, active teachers and how they’re doing" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'Active teachers', v: s ? String(s.active) : '…', sub: s ? `${s.applications} application${s.applications === 1 ? '' : 's'} waiting` : '' },
            { l: 'Students taught', v: s ? s.students.toLocaleString() : '…', sub: s ? `Across ${s.courses} published course${s.courses === 1 ? '' : 's'}` : '' },
            { l: 'Average rating', v: s?.avgRating != null ? `${s.avgRating} ★` : '—', sub: s?.ratings ? `From ${s.ratings} rating${s.ratings === 1 ? '' : 's'}` : 'No ratings yet' },
            { l: 'Paid this month', v: s ? money(s.paidThisMonth) : '…', sub: 'Teacher commissions' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 truncate text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4">
            <div role="tablist" aria-label="Teachers" className="flex flex-1 gap-1 overflow-x-auto">
              {([['APPROVED', 'Active'], ['PENDING', 'Applications'], ['SUSPENDED', 'Suspended'], ['REJECTED', 'Rejected']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`-mb-px h-[46px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy ${tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium'}`}>
                  {l} <span className="font-medium text-muted">{counts[k]}</span>
                </button>
              ))}
            </div>
            <input type="search" aria-label="Search teachers" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or subject" className="input-base my-2 h-[34px] w-60" />
          </div>
          {tab === 'APPROVED' || tab === 'SUSPENDED' ? (
            !perf ? <div className="m-4 h-40 rounded-md bg-subtle animate-pulse" /> : !perfRows.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No {tab === 'APPROVED' ? 'active' : 'suspended'} teachers.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                  <thead><tr>{['Teacher', 'Subjects', 'Courses', 'Students', 'Rating', 'Earned (30 days)', 'Profile'].map(h => <th key={h} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
                  <tbody>
                    {perfRows.map(t => (
                      <tr key={t.id} onClick={() => setPerfId(t.id)} className="cursor-pointer hover:bg-subtle">
                        <td className="border-b border-line px-4 py-3"><strong className="block font-semibold text-navy">{t.name}</strong><span className="text-xs text-muted">{t.email}</span></td>
                        <td className="border-b border-line px-4 py-3 text-ink2">{t.subjects.slice(0, 2).join(', ') || '—'}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{t.published}{t.courses > t.published ? <span className="text-muted"> (+{t.courses - t.published})</span> : ''}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{t.students}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{t.rating ? `${t.rating} ★` : '—'}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{money(t.earned30d)}</td>
                        <td className="border-b border-line px-4 py-3">
                          <span className={`inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold ${t.profileComplete ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2'}`}>{t.profileComplete ? 'Complete' : `No ${t.missing.join(' or ')}`}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : !appRows.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'PENDING' ? 'No applications waiting. New teacher applications appear here.' : 'No rejected applications.'}</p>
          ) : appRows.map(t => <TeacherRow key={t.id} teacher={t} onOpen={() => setAppId(t.id)} />)}
        </section>
      </div>

      <PerfDrawer id={perfId} app={all.find(t => t.id === perfId) ?? null} onClose={() => setPerfId(null)} onChanged={load}
        onOpenApplication={() => { const id = perfId; setPerfId(null); setAppId(id); }} />
      <TeacherDrawer teacher={app} onClose={() => setAppId(null)}
        onApprove={approve} onReject={setRejectTarget} deciding={!!app && deciding === app.id} />
      <RejectDialog teacher={rejectTarget} onClose={() => setRejectTarget(null)}
        onConfirm={rejectConfirm} loading={!!rejectTarget && deciding === rejectTarget.id} />
    </div>
  );
}
