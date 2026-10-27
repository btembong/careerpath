'use client';
import { notify } from '@/lib/notify';
import { useEffect, useMemo, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { FileUpload } from '@/components/ui/FileUpload';
import api from '@/lib/api';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxPoints: number;
  cohortId: string;
  cohortName: string | null;
  submission: {
    id: string;
    status: string;
    score: number | null;
    feedback: string | null;
    fileUrl: string | null;
    submittedAt: string;
  } | null;
}

type FilterTab = 'all' | 'pending' | 'submitted';

function dueDateLabel(dueDate: string): { text: string; urgent: boolean; overdue: boolean } {
  const diff = new Date(dueDate).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (diff < 0) return { text: `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`, urgent: true, overdue: true };
  if (days === 0) return { text: 'Due today', urgent: true, overdue: false };
  if (days === 1) return { text: 'Due tomorrow', urgent: true, overdue: false };
  if (days <= 3) return { text: `Due in ${days} days`, urgent: true, overdue: false };
  return {
    text: `Due ${new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    urgent: false, overdue: false,
  };
}

function scoreBadgeClass(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return 'bg-green-50 text-green-700 border border-green-100';
  if (pct >= 50) return 'bg-amber-50 text-amber-700 border border-amber-100';
  return 'bg-red-50 text-red-600 border border-red-100';
}

function statusLabel(status: string): { text: string; variant: 'default' | 'active' | 'muted' } {
  const map: Record<string, { text: string; variant: 'default' | 'active' | 'muted' }> = {
    PENDING_REVIEW: { text: 'Under review', variant: 'muted' },
    GRADED:         { text: 'Graded',        variant: 'active' },
    PASSED:         { text: 'Passed',         variant: 'active' },
    FAILED:         { text: 'Failed',         variant: 'muted' },
  };
  return map[status] ?? { text: status.replace(/_/g, ' '), variant: 'muted' };
}

function SubmitForm({
  assignment, fileUrl, submissionNote, uploading, submitting,
  onFile, onNoteChange, onSubmit, onClose,
}: {
  assignment: Assignment | null;
  fileUrl: string;
  submissionNote: string;
  uploading: boolean;
  submitting: boolean;
  onFile: (f: File) => void;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!assignment) return null;
  return (
    <div className="p-5 space-y-4">
      {assignment.description && (
        <div className="rounded-xl bg-surface border border-cloud px-4 py-3 text-sm text-navy/70 leading-relaxed">
          {assignment.description}
        </div>
      )}
      {assignment.submission && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">
          You previously submitted this assignment. Uploading a new file will replace your current submission.
        </div>
      )}
      <FileUpload
        accept={{
          'application/pdf': ['.pdf'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'image/*': ['.jpg', '.jpeg', '.png'],
        }}
        maxSize={10 * 1024 * 1024}
        label="Upload assignment file"
        hint="PDF, DOCX, JPG or PNG · max 10 MB"
        onFile={onFile}
        preview={fileUrl || null}
        uploading={uploading}
      />
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-navy block">
          Note to instructor
          <span className="font-normal text-royal/40 ml-1">(optional)</span>
        </label>
        <textarea
          value={submissionNote}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="e.g. I focused on part B as discussed in class..."
          rows={2}
          className="input-base resize-none"
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button
          disabled={submitting || uploading}
          onClick={onSubmit}
          className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting || uploading
            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            : <Icon name="upload" size={14} />
          }
          {assignment.submission ? 'Resubmit' : 'Submit assignment'}
        </button>
        <button onClick={onClose} className="btn-secondary px-4">Cancel</button>
      </div>
    </div>
  );
}

function AssignmentsContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [assignments,     setAssignments]     = useState<Assignment[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [submitSheet,     setSubmitSheet]     = useState<Assignment | null>(null);
  const [fileUrl,         setFileUrl]         = useState('');
  const [submissionNote,  setSubmissionNote]  = useState('');
  const [uploading,       setUploading]       = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [filterTab,       setFilterTabState]  = useState<FilterTab>(() => (searchParams.get('filter') as FilterTab) ?? 'all');

  function setFilterTab(t: FilterTab) {
    setFilterTabState(t);
    const p = new URLSearchParams(searchParams.toString());
    if (t === 'all') p.delete('filter'); else p.set('filter', t);
    // preserve cohortId if present
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ''}`, { scroll: false });
  }

  async function load() {
    try {
      const r = await api.get('/education/assignments/mine').catch(() => ({ data: [] }));
      setAssignments(r.data ?? []);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Auto-open submit sheet when ?id= is present
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || assignments.length === 0) return;
    const target = assignments.find(a => a.id === targetId && !a.submission);
    if (target) { openSheet(target); }
  }, [searchParams, assignments]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/files/upload?folder=submissions', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFileUrl(data.url);
      notify.success('File uploaded');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!submitSheet) return;
    if (!fileUrl) { notify.error('Please upload a file before submitting'); return; }
    setSubmitting(true);
    try {
      await api.post(`/education/assignments/${submitSheet.id}/submit`, {
        fileUrl,
        notes: submissionNote.trim() || undefined,
      });
      notify.success(submitSheet.submission ? 'Resubmitted successfully!' : 'Assignment submitted!');
      setSubmitSheet(null);
      setFileUrl('');
      setSubmissionNote('');
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const openSheet  = (a: Assignment) => { setSubmitSheet(a); setFileUrl(''); setSubmissionNote(''); };
  const closeSheet = () => { setSubmitSheet(null); setFileUrl(''); setSubmissionNote(''); };

  // Stats
  const totalToSubmit = assignments.filter(a => !a.submission && !(a.dueDate && new Date(a.dueDate) < new Date())).length;
  const totalOverdue  = assignments.filter(a => !a.submission && a.dueDate && new Date(a.dueDate) < new Date()).length;
  const totalSubmitted = assignments.filter(a => !!a.submission).length;

  // Filter
  const filtered = useMemo(() => {
    if (filterTab === 'pending')   return assignments.filter(a => !a.submission);
    if (filterTab === 'submitted') return assignments.filter(a => !!a.submission);
    return assignments;
  }, [assignments, filterTab]);

  // Group by cohort — respect ?cohortId= by sorting that cohort first
  const focusCohortId = searchParams.get('cohortId');
  const byCohort = useMemo(() => {
    const map = new Map<string, { cohortName: string; pending: Assignment[]; submitted: Assignment[] }>();
    for (const a of filtered) {
      const key = a.cohortId;
      if (!map.has(key)) map.set(key, { cohortName: a.cohortName ?? 'Your cohort', pending: [], submitted: [] });
      const group = map.get(key)!;
      if (!a.submission) group.pending.push(a);
      else group.submitted.push(a);
    }
    // Sort: focusCohortId first
    const entries = [...map.entries()];
    if (focusCohortId) {
      entries.sort(([a], [b]) => (a === focusCohortId ? -1 : b === focusCohortId ? 1 : 0));
    }
    return entries;
  }, [filtered, focusCohortId]);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cloud bg-white p-4 flex flex-col items-center gap-2">
              <div className="h-8 w-10 rounded bg-cloud animate-pulse" />
              <div className="h-2 w-14 rounded bg-cloud animate-pulse" />
            </div>
          ))}
        </div>
        {/* Filter pills */}
        <div className="flex gap-2">
          {[1,2,3].map(i => <div key={i} className="h-8 w-20 rounded-full bg-cloud animate-pulse" />)}
        </div>
        {/* Cards */}
        <div className="space-y-3">
          <div className="h-2.5 w-36 rounded bg-cloud animate-pulse" />
          {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Assignments" subtitle="Submit and track your work" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl w-full mx-auto">

        {assignments.length === 0 ? (
          <Card>
            <EmptyState
              icon="assignments"
              title="No assignments yet"
              description="Assignments from your enrolled courses will appear here."
              action={{ label: 'Browse courses', href: '/student/catalogue' }}
            />
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="flex flex-col items-center py-4 text-center">
                <p className="text-2xl font-black text-navy tabular-nums">{totalToSubmit}</p>
                <p className="text-[10px] font-bold text-royal/50 mt-0.5">To submit</p>
              </Card>
              <Card className={`flex flex-col items-center py-4 text-center ${totalOverdue > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className={`text-2xl font-black tabular-nums ${totalOverdue > 0 ? 'text-red-600' : 'text-navy'}`}>{totalOverdue}</p>
                <p className={`text-[10px] font-bold mt-0.5 ${totalOverdue > 0 ? 'text-red-400' : 'text-royal/50'}`}>Overdue</p>
              </Card>
              <Card className="flex flex-col items-center py-4 text-center">
                <p className="text-2xl font-black text-navy tabular-nums">{totalSubmitted}</p>
                <p className="text-[10px] font-bold text-royal/50 mt-0.5">Submitted</p>
              </Card>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                ['all',       'All',       assignments.length],
                ['pending',   'Pending',   assignments.filter(a => !a.submission).length],
                ['submitted', 'Submitted', totalSubmitted],
              ] as [FilterTab, string, number][]).map(([t, label, count]) => (
                <button key={t} onClick={() => setFilterTab(t)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition border ${
                    filterTab === t
                      ? 'bg-azure text-white border-azure'
                      : 'bg-white border-cloud text-royal/60 hover:border-azure/40'
                  }`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    filterTab === t ? 'bg-white/20 text-white' : 'bg-cloud text-royal/50'
                  }`}>{count}</span>
                </button>
              ))}
            </div>

            {/* No results for filter */}
            {byCohort.length === 0 && (
              <Card>
                <EmptyState
                  icon="assignments"
                  title={filterTab === 'pending' ? 'No pending assignments' : 'No submitted assignments yet'}
                  description={filterTab === 'pending' ? 'All caught up!' : 'Submit your first assignment to see it here.'}
                />
              </Card>
            )}

            {/* Grouped by cohort */}
            {byCohort.map(([cohortId, group]) => (
              <div key={cohortId} id={`cohort-${cohortId}`} className="space-y-3">

                <div className="flex items-center gap-2 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">{group.cohortName}</p>
                  <Badge>{group.pending.length + group.submitted.length}</Badge>
                  {focusCohortId === cohortId && (
                    <span className="text-[10px] text-royal/40 ml-1">← from cohort</span>
                  )}
                </div>

                {/* ── PENDING ── */}
                {group.pending.map(a => {
                  const due = a.dueDate ? dueDateLabel(a.dueDate) : null;
                  return (
                    <Card key={a.id} padding="none" className={due?.overdue ? 'border-red-200' : ''}>
                      {due?.overdue && <div className="h-1 w-full bg-red-400 rounded-t-2xl" />}
                      <div className="p-4 flex items-start gap-4">
                        <IconBox className={due?.overdue ? 'bg-red-50 text-red-400' : ''}>
                          <Icon name="assignments" size={18} />
                        </IconBox>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy">{a.title}</p>
                          {a.description && (
                            <p className="text-xs text-royal/50 mt-1 leading-relaxed line-clamp-2">{a.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {due && (
                              <span className={`flex items-center gap-1 text-xs font-medium ${due.overdue ? 'text-red-500' : due.urgent ? 'text-amber-500' : 'text-royal/50'}`}>
                                <Icon name="clock" size={11} />
                                {due.text}
                              </span>
                            )}
                            <span className="text-xs text-royal/40">{a.maxPoints} pts</span>
                          </div>
                        </div>
                        <button
                          onClick={() => openSheet(a)}
                          className="flex-shrink-0 btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                          <Icon name="upload" size={13} /> Submit
                        </button>
                      </div>
                    </Card>
                  );
                })}

                {/* ── SUBMITTED ── */}
                {group.submitted.map(a => {
                  const sub         = a.submission!;
                  const status      = sub.status ?? 'PENDING_REVIEW';
                  const sl          = statusLabel(status);
                  const canResubmit = status === 'FAILED' ||
                    (status === 'PENDING_REVIEW' && (!a.dueDate || new Date(a.dueDate) > new Date()));
                  const scorePct    = sub.score != null && a.maxPoints > 0
                    ? Math.round((sub.score / a.maxPoints) * 100)
                    : null;
                  const submittedLate = a.dueDate && new Date(sub.submittedAt) > new Date(a.dueDate);

                  return (
                    <Card key={a.id} padding="none">
                      <div className="p-4 flex items-start gap-4">
                        <IconBox className={status === 'GRADED' || status === 'PASSED' ? 'bg-azure/10 text-azure' : status === 'FAILED' ? 'bg-red-50 text-red-400' : ''}>
                          <Icon name={status === 'GRADED' || status === 'PASSED' ? 'check' : 'assignments'} size={18} />
                        </IconBox>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy">{a.title}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <p className="text-xs text-royal/50">
                              Submitted {new Date(sub.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            {submittedLate && (
                              <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                                Late
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                          {sub.score != null ? (
                            <span className={`rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums ${scoreBadgeClass(sub.score, a.maxPoints)}`}>
                              {sub.score}/{a.maxPoints}
                            </span>
                          ) : (
                            <Badge variant={sl.variant}>{sl.text}</Badge>
                          )}
                          {scorePct !== null && (
                            <span className="text-xs text-royal/40">{scorePct}%</span>
                          )}
                        </div>
                      </div>

                      {sub.feedback && (
                        <div className="mx-4 mb-4 rounded-xl bg-surface border border-cloud px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1.5">Instructor feedback</p>
                          <p className="text-sm text-navy/80 leading-relaxed">{sub.feedback}</p>
                        </div>
                      )}

                      {(sub.fileUrl || canResubmit) && (
                        <div className="border-t border-cloud px-4 py-3 flex items-center gap-4">
                          {sub.fileUrl && (
                            <a href={sub.fileUrl} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-azure hover:text-royal transition">
                              <Icon name="download" size={14} /> View submission
                            </a>
                          )}
                          {canResubmit && (
                            <button onClick={() => openSheet(a)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-royal/50 hover:text-azure transition">
                              <Icon name="upload" size={14} /> Resubmit
                            </button>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Mobile: bottom sheet */}
      <BottomSheet
        open={!!submitSheet}
        onClose={closeSheet}
        title={`${submitSheet?.submission ? 'Resubmit' : 'Submit'}: ${submitSheet?.title ?? ''}`}
        height="auto"
      >
        <SubmitForm
          assignment={submitSheet}
          fileUrl={fileUrl}
          submissionNote={submissionNote}
          uploading={uploading}
          submitting={submitting}
          onFile={handleFile}
          onNoteChange={setSubmissionNote}
          onSubmit={handleSubmit}
          onClose={closeSheet}
        />
      </BottomSheet>

      {/* Desktop modal */}
      {submitSheet && (
        <div className="fixed inset-0 z-50 hidden lg:flex items-center justify-center bg-navy/20 backdrop-blur-sm p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-card-lg overflow-hidden border border-cloud">
            <div className="px-5 py-4 flex items-center justify-between border-b border-cloud">
              <div>
                <p className="text-sm font-semibold text-navy">
                  {submitSheet.submission ? 'Resubmit Assignment' : 'Submit Assignment'}
                </p>
                <p className="text-xs text-royal/50 mt-0.5 truncate max-w-[280px]">{submitSheet.title}</p>
              </div>
              <button onClick={closeSheet}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cloud transition text-royal/40 hover:text-navy">
                <Icon name="close" size={16} />
              </button>
            </div>
            <SubmitForm
              assignment={submitSheet}
              fileUrl={fileUrl}
              submissionNote={submissionNote}
              uploading={uploading}
              submitting={submitting}
              onFile={handleFile}
              onNoteChange={setSubmissionNote}
              onSubmit={handleSubmit}
              onClose={closeSheet}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-full">
        <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
          <div className="h-8 w-48 rounded-xl bg-cloud animate-pulse" />
        </div>
      </div>
    }>
      <AssignmentsContent />
    </Suspense>
  );
}
