'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

interface Teacher { id: string; email: string; name: string | null; }
interface Cohort {
  id: string; name: string; teacherId: string;
  sittingLabel: string | null; examDate: string | null; startDate: string | null;
  teacher: Teacher | null;
  linkedPackage: { id: string; name: string } | null;
  _count: { students: number; liveClasses: number };
}
interface Roster {
  id: string; name: string; teacher: Teacher | null;
  students: { student: { id: string; email: string; name: string | null } }[];
  liveClasses: { id: string; title: string; scheduledAt: string; status: string }[];
}

export default function AdminCohortsPage() {
  const [cohorts,  setCohorts]  = useState<Cohort[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roster,   setRoster]   = useState<Roster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Create form
  const [showForm,      setShowForm]      = useState(false);
  const [newName,       setNewName]       = useState('');
  const [newTeacher,    setNewTeacher]    = useState('');
  const [newSitting,    setNewSitting]    = useState('');
  const [newExamDate,   setNewExamDate]   = useState('');
  const [newStartDate,  setNewStartDate]  = useState('');
  const [saving,        setSaving]        = useState(false);

  // Edit exam fields inline
  const [editingExam,   setEditingExam]   = useState<string | null>(null);
  const [editSitting,   setEditSitting]   = useState('');
  const [editExamDate,  setEditExamDate]  = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [savingExam,    setSavingExam]    = useState(false);

  // Add student
  const [addEmail,  setAddEmail]  = useState('');
  const [adding,    setAdding]    = useState(false);
  const [removing,  setRemoving]  = useState<string | null>(null);

  // Bulk-add students
  const [showBulk,      setShowBulk]      = useState(false);
  const [bulkEmails,    setBulkEmails]    = useState('');
  const [bulkAdding,    setBulkAdding]    = useState(false);
  const [bulkResults,   setBulkResults]   = useState<{ email: string; ok: boolean; msg: string }[] | null>(null);

  // Schedule class
  const [showSchedule,   setShowSchedule]   = useState(false);
  const [classTitle,     setClassTitle]     = useState('');
  const [classDate,      setClassDate]      = useState('');
  const [scheduling,     setScheduling]     = useState(false);

  async function load() {
    try {
      const [cr, tr] = await Promise.all([
        api.get('/portals/admin/cohorts'),
        api.get('/portals/admin/teachers?status=APPROVED').catch(() => api.get('/portals/admin/teachers')),
      ]);
      setCohorts(cr.data ?? []);
      setTeachers((tr.data ?? []).filter((t: any) => t.approvalStatus === 'APPROVED'));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function loadRoster(id: string) {
    if (expanded === id) { setExpanded(null); setRoster(null); return; }
    setExpanded(id);
    setRoster(null);
    setRosterLoading(true);
    try {
      const r = await api.get(`/portals/admin/cohorts/${id}`);
      setRoster(r.data);
    } catch { notify.error('Failed to load cohort'); }
    finally { setRosterLoading(false); }
  }

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeacher) { notify.error('Select a teacher'); return; }
    setSaving(true);
    try {
      await api.post('/portals/admin/cohorts', {
        name: newName.trim(),
        teacherId: newTeacher,
        sittingLabel: newSitting.trim() || undefined,
        examDate:    newExamDate  || undefined,
        startDate:   newStartDate || undefined,
      });
      notify.success('Cohort created');
      setNewName(''); setNewTeacher(''); setNewSitting(''); setNewExamDate(''); setNewStartDate('');
      setShowForm(false);
      load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  async function saveExamFields(cohortId: string) {
    setSavingExam(true);
    try {
      await api.patch(`/portals/admin/cohorts/${cohortId}`, {
        sittingLabel: editSitting.trim() || null,
        examDate:    editExamDate  || null,
        startDate:   editStartDate || null,
      });
      notify.success('Saved');
      setEditingExam(null);
      load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSavingExam(false); }
  }

  function openEditExam(c: Cohort) {
    setEditingExam(c.id);
    setEditSitting(c.sittingLabel ?? '');
    setEditExamDate(c.examDate ? c.examDate.slice(0, 10) : '');
    setEditStartDate(c.startDate ? c.startDate.slice(0, 10) : '');
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!expanded || !addEmail.trim()) return;
    setAdding(true);
    try {
      await api.post(`/portals/admin/cohorts/${expanded}/students`, { email: addEmail.trim().toLowerCase() });
      notify.success('Student added');
      setAddEmail('');
      const r = await api.get(`/portals/admin/cohorts/${expanded}`);
      setRoster(r.data);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setAdding(false); }
  }

  async function removeStudent(studentId: string) {
    if (!expanded) return;
    setRemoving(studentId);
    try {
      await api.delete(`/portals/admin/cohorts/${expanded}/students/${studentId}`);
      notify.success('Student removed');
      setRoster(r => r ? { ...r, students: r.students.filter(s => s.student.id !== studentId) } : r);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setRemoving(null); }
  }

  async function bulkAddStudents(e: React.FormEvent) {
    e.preventDefault();
    if (!expanded || !bulkEmails.trim()) return;
    const emails = bulkEmails.split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return;
    setBulkAdding(true);
    setBulkResults(null);
    const results = await Promise.all(
      emails.map(email =>
        api.post(`/portals/admin/cohorts/${expanded}/students`, { email })
          .then(() => ({ email, ok: true, msg: 'Added' }))
          .catch(err => ({ email, ok: false, msg: err?.response?.data?.message ?? 'Failed' }))
      )
    );
    setBulkResults(results);
    setBulkAdding(false);
    const added = results.filter(r => r.ok).length;
    if (added > 0) {
      notify.success(`Added ${added} student${added !== 1 ? 's' : ''}`);
      const r = await api.get(`/portals/admin/cohorts/${expanded}`);
      setRoster(r.data);
    }
  }

  async function scheduleClass(e: React.FormEvent) {
    e.preventDefault();
    if (!expanded) return;
    setScheduling(true);
    try {
      await api.post(`/live/cohorts/${expanded}/classes`, {
        title: classTitle.trim(),
        scheduledAt: new Date(classDate).toISOString(),
      });
      notify.success('Class scheduled');
      setClassTitle(''); setClassDate(''); setShowSchedule(false);
      const r = await api.get(`/portals/admin/cohorts/${expanded}`);
      setRoster(r.data);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setScheduling(false); }
  }

  const totalStudents = useMemo(() => cohorts.reduce((s, c) => s + c._count.students, 0), [cohorts]);
  const totalClasses  = useMemo(() => cohorts.reduce((s, c) => s + c._count.liveClasses, 0), [cohorts]);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6 max-w-5xl w-full mx-auto">
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-20 animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Cohorts" subtitle="Create groups, assign teachers, enroll students" />

      <div className="flex-1 p-6 space-y-6 max-w-5xl w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total cohorts',  value: cohorts.length,   icon: 'mentorship' as const },
            { label: 'Total students', value: totalStudents,    icon: 'graduate'   as const },
            { label: 'Total sessions', value: totalClasses,     icon: 'live'       as const },
          ].map(s => (
            <Card key={s.label} padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold text-navy">{s.value}</p>
                </div>
                <IconBox><Icon name={s.icon} size={16} /></IconBox>
              </div>
            </Card>
          ))}
        </div>

        {/* Header + create */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COHORTS</p>
            <h2 className="text-base font-bold text-navy">{cohorts.length} group{cohorts.length !== 1 ? 's' : ''}</h2>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Icon name="add" size={13} /> New cohort
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">NEW COHORT</p>
            <form onSubmit={createCohort} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Cohort name</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} required
                    placeholder="e.g. ACCA F3 — June 2026"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Assign teacher</label>
                  <Select
                    value={newTeacher}
                    onValueChange={setNewTeacher}
                    placeholder="— Select teacher —"
                    options={teachers.map(t => ({
                      value: t.id,
                      label: t.name ? `${t.name} (${t.email})` : t.email,
                      avatar: (t.name ?? t.email)[0].toUpperCase(),
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Sitting label <span className="font-normal text-royal/40">(optional)</span></label>
                  <input value={newSitting} onChange={e => setNewSitting(e.target.value)}
                    placeholder="e.g. June 2026 Sitting"
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Exam date <span className="font-normal text-royal/40">(optional)</span></label>
                  <input type="date" value={newExamDate} onChange={e => setNewExamDate(e.target.value)}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-navy">Start date <span className="font-normal text-royal/40">(optional)</span></label>
                  <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" size="sm" loading={saving}>Create cohort</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Cohort list */}
        {cohorts.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center py-12 text-center">
              <IconBox className="h-14 w-14 rounded-2xl mb-3"><Icon name="mentorship" size={24} /></IconBox>
              <p className="text-sm font-semibold text-navy">No cohorts yet</p>
              <p className="text-xs text-royal/50 mt-1">Create a cohort and assign an approved teacher to get started</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {cohorts.map(c => {
              const isOpen = expanded === c.id;
              return (
                <Card key={c.id} padding="none" className="overflow-hidden">
                  {/* Header */}
                  <button
                    onClick={() => loadRoster(c.id)}
                    className="flex items-center gap-4 px-5 py-4 w-full text-left hover:bg-cloud/30 transition">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy text-sm font-bold text-white">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy truncate">{c.name}</p>
                      <p className="text-xs text-royal/50 truncate">
                        {c.teacher?.name ?? c.teacher?.email?.split('@')[0] ?? 'No teacher assigned'}
                        {c.sittingLabel && <> · <span className="text-azure font-semibold">{c.sittingLabel}</span></>}
                        {c.linkedPackage && <> · <span className="text-emerald-600 font-semibold">{c.linkedPackage.name}</span></>}
                      </p>
                      {c.examDate && (() => {
                        const days = Math.ceil((new Date(c.examDate).getTime() - Date.now()) / 86400000);
                        return days > 0 ? (
                          <p className="text-[10px] font-semibold text-amber-600 mt-0.5">
                            Exam in {days} day{days !== 1 ? 's' : ''} · {new Date(c.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        ) : (
                          <p className="text-[10px] font-semibold text-royal/40 mt-0.5">
                            Exam passed · {new Date(c.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="hidden sm:flex items-center gap-4 flex-shrink-0 mr-2">
                      <div className="flex items-center gap-1.5 text-xs text-royal/50">
                        <Icon name="graduate" size={12} />
                        <span>{c._count.students}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-royal/50">
                        <Icon name="live" size={12} />
                        <span>{c._count.liveClasses}</span>
                      </div>
                    </div>
                    <Badge variant="active">Active</Badge>
                    <Icon name="chevronDown" size={14} className={`text-royal/40 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded panel */}
                  <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                    <div className="border-t border-cloud">
                      {rosterLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-azure border-t-transparent" />
                        </div>
                      ) : roster && (
                        <>
                        {/* Exam fields editor */}
                        <div className="px-5 py-4 border-b border-cloud bg-surface">
                          {editingExam === c.id ? (
                            <div className="space-y-3">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">EXAM / SITTING DETAILS</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-navy">Sitting label</label>
                                  <input value={editSitting} onChange={e => setEditSitting(e.target.value)}
                                    placeholder="e.g. June 2026 Sitting"
                                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-navy">Exam date</label>
                                  <input type="date" value={editExamDate} onChange={e => setEditExamDate(e.target.value)}
                                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-navy">Start date</label>
                                  <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" loading={savingExam} onClick={() => saveExamFields(c.id)}>Save</Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingExam(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-wrap text-xs text-royal/50">
                                {c.sittingLabel
                                  ? <span className="font-semibold text-azure">{c.sittingLabel}</span>
                                  : <span className="italic">No sitting label</span>}
                                {c.examDate && (
                                  <span className="flex items-center gap-1">
                                    <Icon name="clock" size={11} className="text-amber-500" />
                                    Exam: {new Date(c.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                )}
                                {c.startDate && (
                                  <span className="flex items-center gap-1">
                                    <Icon name="calendar" size={11} className="text-azure" />
                                    Starts: {new Date(c.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              <button onClick={() => openEditExam(c)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-azure hover:text-royal transition flex-shrink-0">
                                <Icon name="settings" size={11} /> Edit exam info
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-cloud">

                          {/* Students panel */}
                          <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                                STUDENTS ({roster.students.length})
                              </p>
                            </div>

                            {/* Add student form */}
                            <form onSubmit={addStudent} className="flex gap-2">
                              <input
                                value={addEmail}
                                onChange={e => setAddEmail(e.target.value)}
                                placeholder="student@email.com"
                                type="email"
                                className="flex-1 rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                              />
                              <Button type="submit" size="sm" loading={adding}>
                                <Icon name="add" size={12} /> Add
                              </Button>
                              <button type="button"
                                onClick={() => { setShowBulk(v => !v); setBulkResults(null); setBulkEmails(''); }}
                                className="flex items-center gap-1 rounded-xl border border-cloud px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition flex-shrink-0">
                                Bulk
                              </button>
                            </form>

                            {/* Bulk-add panel */}
                            {showBulk && (
                              <form onSubmit={bulkAddStudents} className="space-y-2 rounded-xl border border-azure/20 bg-azure/5 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">BULK ADD</p>
                                <p className="text-[10px] text-royal/50">Paste emails separated by commas, semicolons or new lines</p>
                                <textarea
                                  value={bulkEmails}
                                  onChange={e => setBulkEmails(e.target.value)}
                                  rows={4}
                                  placeholder={"alice@example.com\nbob@example.com, carol@example.com"}
                                  className="w-full rounded-lg border border-cloud bg-white px-3 py-2 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/30 resize-none"
                                />
                                <Button type="submit" size="sm" loading={bulkAdding} fullWidth>
                                  Add all
                                </Button>
                                {bulkResults && (
                                  <div className="max-h-40 overflow-y-auto space-y-1 mt-1">
                                    {bulkResults.map(r => (
                                      <div key={r.email} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                        <Icon name={r.ok ? 'check' : 'close'} size={10} />
                                        <span className="font-semibold truncate flex-1">{r.email}</span>
                                        <span>{r.msg}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </form>
                            )}

                            {roster.students.length === 0 ? (
                              <p className="text-xs text-royal/40 text-center py-4">No students enrolled yet</p>
                            ) : (
                              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                {roster.students.map(({ student }) => (
                                  <div key={student.id} className="flex items-center gap-3 rounded-xl border border-cloud px-3 py-2.5 bg-surface">
                                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-xs font-bold text-azure">
                                      {(student.name ?? student.email)[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-navy truncate">{student.name ?? student.email}</p>
                                      {student.name && <p className="text-[10px] text-royal/40 truncate">{student.email}</p>}
                                    </div>
                                    <button
                                      onClick={() => removeStudent(student.id)}
                                      disabled={removing === student.id}
                                      className="text-royal/30 hover:text-red-500 transition flex-shrink-0">
                                      {removing === student.id
                                        ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" />
                                        : <Icon name="close" size={13} />
                                      }
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Sessions panel */}
                          <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                                SESSIONS ({roster.liveClasses.length})
                              </p>
                              <button
                                onClick={() => setShowSchedule(v => !v)}
                                className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                                <Icon name="add" size={11} /> Schedule
                              </button>
                            </div>

                            {showSchedule && (
                              <form onSubmit={scheduleClass} className="space-y-2 rounded-xl border border-azure/20 bg-azure/5 p-3">
                                <input value={classTitle} onChange={e => setClassTitle(e.target.value)} required
                                  placeholder="Class title"
                                  className="w-full rounded-lg border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                                <input type="datetime-local" value={classDate} onChange={e => setClassDate(e.target.value)} required
                                  min={new Date().toISOString().slice(0, 16)}
                                  className="w-full rounded-lg border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                                <Button type="submit" size="sm" fullWidth loading={scheduling}>Confirm</Button>
                              </form>
                            )}

                            {roster.liveClasses.length === 0 ? (
                              <p className="text-xs text-royal/40 text-center py-4">No sessions scheduled yet</p>
                            ) : (
                              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                {roster.liveClasses.map(cls => {
                                  const isLive = cls.status === 'ACTIVE';
                                  const isPast = new Date(cls.scheduledAt) < new Date() && !isLive;
                                  return (
                                    <div key={cls.id} className="flex items-center gap-3 rounded-xl border border-cloud px-3 py-2.5">
                                      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${isLive ? 'bg-azure' : 'bg-cloud'}`}>
                                        <Icon name="live" size={12} className={isLive ? 'text-white' : 'text-royal/40'} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-navy truncate">{cls.title}</p>
                                        <p className="text-[10px] text-royal/40">
                                          {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                          {' · '}
                                          {new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                      <Badge variant={isLive ? 'active' : isPast ? 'default' : 'muted'}>
                                        {isLive ? 'Live' : isPast ? 'Done' : 'Upcoming'}
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        </>
                      )}
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
