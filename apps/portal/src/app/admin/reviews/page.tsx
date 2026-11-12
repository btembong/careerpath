'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { MentorRates } from '@/components/admin/MentorRates';
import api from '@/lib/api';

interface Row {
  id: string; title: string; source: string; status: string; tag: string; subjectId: string | null;
  teacher: { id: string; name: string } | null; teacherPct: number | null; paysTo: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null; reviewerPct: number | null;
  review: 'PENDING' | 'APPROVED' | 'REJECTED' | null; submittedAt: string | null; reviewedAt: string | null; waitingDays: number | null;
}
interface Reviewer { id: string; name: string; email: string; subjects: { id: string; name: string }[] }
interface Data {
  rows: Row[]; reviewers: Reviewer[];
  stats: { courses: number; fromWordPress: number; noReviewer: number; waiting: number; oldestWaitingDays: number | null; teacherPending: number; wrongPayee: number; defaultTeacherPct: number | null; usualReviewerPct: number | null };
}

const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

/** Commissions: who earns what from courses (shares of sales) and from mentoring (a fee per session) */
export default function CommissionsPage() {
  const [section, setSection] = useState<'courses' | 'mentors'>('courses');
  const switcher = (
    <span role="group" aria-label="Commissions for" className="flex gap-0.5 rounded-lg border border-line bg-white p-[3px] text-[12.5px]">
      {([['courses', 'Courses'], ['mentors', 'Mentors']] as const).map(([k, l]) => (
        <button key={k} onClick={() => setSection(k)} aria-pressed={section === k} className={clsx('h-7 rounded-md px-2.5 text-navy', section === k ? 'bg-accent-soft font-bold' : 'hover:bg-subtle')}>{l}</button>
      ))}
    </span>
  );
  return section === 'mentors' ? <MentorRates switcher={switcher} /> : <CourseCommissions switcher={switcher} />;
}

function CourseCommissions({ switcher }: { switcher: React.ReactNode }) {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row[] | null>(null);
  const [defaults, setDefaults] = useState(false);

  const load = useCallback(() => api.get('/admin/commissions').then(r => setD(r.data)).catch(() => notify.error('Could not load courses')), []);
  useEffect(() => { load(); }, [load]);

  const filters: Record<string, (r: Row) => boolean> = {
    all: () => true, noReviewer: r => !r.reviewer, waiting: r => r.review === 'PENDING' && !!r.submittedAt,
    teacherPending: r => !r.teacher, wrongPayee: r => !!r.paysTo,
  };
  const rows = (d?.rows ?? []).filter(filters[tab]).filter(r => !q.trim() || `${r.title} ${r.teacher?.name ?? ''} ${r.reviewer?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;
  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id));

  return (
    <>
      <RepTable title="Teachers, reviewers & commissions" subtitle="Who teaches and reviews each course, and their share of its sales"
        actions={<div className="flex gap-2">
          {switcher}
          {picked.size > 0 && <Button size="sm" onClick={() => setEditing((d?.rows ?? []).filter(r => picked.has(r.id)))}>Change {picked.size} selected</Button>}
          <button onClick={() => setDefaults(true)} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Default share</button>
        </div>}
        stats={[
          { l: 'Courses', v: s ? String(s.courses) : '—', sub: s ? `${s.fromWordPress} from WordPress` : '' },
          { l: 'No reviewer', v: s ? String(s.noReviewer) : '—', sub: 'can’t be approved yet' },
          { l: 'Waiting for review', v: s ? String(s.waiting) : '—', sub: s?.oldestWaitingDays != null ? `oldest ${s.oldestWaitingDays} day${s.oldestWaitingDays === 1 ? '' : 's'}` : 'none waiting' },
          { l: 'Default shares', v: s ? `${pct(s.defaultTeacherPct)} · ${pct(s.usualReviewerPct)}` : '—', sub: 'teacher · usual reviewer' },
        ]}
        tabs={[
          { key: 'all', label: 'All', count: d?.rows.length ?? 0 },
          { key: 'noReviewer', label: 'No reviewer', count: d?.rows.filter(filters.noReviewer).length ?? 0 },
          { key: 'waiting', label: 'Waiting for review', count: d?.rows.filter(filters.waiting).length ?? 0 },
          { key: 'teacherPending', label: 'Teacher pending', count: d?.rows.filter(filters.teacherPending).length ?? 0 },
          ...(s?.wrongPayee ? [{ key: 'wrongPayee', label: 'Paid to someone else', count: s.wrongPayee }] : []),
        ]}
        tab={tab} onTab={k => { setTab(k); setPicked(new Set()); }} search={q} onSearch={setQ} searchLabel="Search courses or people"
        cols={['', 'Course', 'Teacher', 'Reviewer', 'Review', '']}
        loading={!d} empty={d && !rows.length ? (q ? 'Nothing matches.' : 'Nothing here.') : null}
        note="Shares are a percentage of each sale after fees. Changing them affects new sales only. Teachers are changed in Course management.">
        {rows.length > 0 && (
          <tr><td colSpan={6} className="border-b border-line px-4 py-2 text-[12.5px] text-muted">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.id)))} className="h-4 w-4 accent-[#3F6FE8]" /> Select all {rows.length}</label>
          </td></tr>
        )}
        {rows.map(r => (
          <tr key={r.id} className={clsx('hover:bg-subtle', picked.has(r.id) && 'bg-subtle')}>
            <td className={clsx(td, 'w-10')}><input type="checkbox" aria-label={`Select ${r.title}`} checked={picked.has(r.id)} onChange={() => setPicked(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} className="h-4 w-4 accent-[#3F6FE8]" /></td>
            <td className={td}><strong className="text-navy">{r.title}</strong><br /><span className="text-[12.5px] text-muted">{[r.tag, r.source === 'WORDPRESS' ? 'from WordPress' : null, r.status !== 'PUBLISHED' ? r.status.toLowerCase().replace('_', ' ') : null].filter(Boolean).join(' · ') || '—'}</span></td>
            <td className={clsx(td, 'text-navy')}>
              {r.teacher ? r.teacher.name : <span className="text-muted">CareerPath (no teacher yet)</span>}<br />
              <span className="text-[12.5px] text-muted">{r.teacher ? `${pct(r.teacherPct)} share` : '—'}</span>
              {r.paysTo && <><br /><span className="text-[12px] font-semibold text-azure-strong">Sales still pay {r.paysTo.name} — save to fix</span></>}
            </td>
            <td className={clsx(td, 'text-navy')}>{r.reviewer ? <>{r.reviewer.name}<br /><span className="text-[12.5px] text-muted">{pct(r.reviewerPct)} share</span></> : <span className="inline-flex rounded border border-dashed border-azure px-2 py-0.5 text-[12.5px] font-semibold text-azure-strong">No reviewer</span>}</td>
            <td className={td}>
              <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', r.review === 'APPROVED' ? 'bg-accent-soft text-navy' : r.review === 'PENDING' && r.submittedAt ? 'border border-dashed border-azure text-azure-strong' : 'border border-line bg-subtle text-ink2')}>
                {r.review === 'APPROVED' ? 'Approved' : r.review === 'REJECTED' ? 'Sent back' : r.submittedAt ? 'Waiting' : 'Not submitted'}
              </span><br />
              <span className="text-[12px] text-muted">{r.review === 'APPROVED' && r.reviewedAt ? `approved ${short(r.reviewedAt)}` : r.waitingDays != null ? `sent ${r.waitingDays ? `${r.waitingDays} day${r.waitingDays === 1 ? '' : 's'} ago` : 'today'}` : ''}</span>
            </td>
            <td className={clsx(td, 'whitespace-nowrap text-right')}>
              <button onClick={() => setEditing([r])} className="font-semibold text-azure-strong hover:underline">{r.reviewer ? 'Change' : 'Assign'}</button>
              <Link href={`/admin/courses/${r.id}`} className="ml-3 font-semibold text-muted hover:text-navy hover:underline">Open</Link>
            </td>
          </tr>
        ))}
      </RepTable>
      <EditShares rows={editing} reviewers={d?.reviewers ?? []} usualReviewerPct={s?.usualReviewerPct ?? null} defaultTeacherPct={s?.defaultTeacherPct ?? null}
        onClose={() => setEditing(null)} onDone={() => { setEditing(null); setPicked(new Set()); load(); }} />
      <Defaults open={defaults} current={s?.defaultTeacherPct ?? null} onClose={() => setDefaults(false)} onDone={() => { setDefaults(false); load(); }} />
    </>
  );
}

function EditShares({ rows, reviewers, usualReviewerPct, defaultTeacherPct, onClose, onDone }: { rows: Row[] | null; reviewers: Reviewer[]; usualReviewerPct: number | null; defaultTeacherPct: number | null; onClose: () => void; onDone: () => void }) {
  const one = rows?.length === 1 ? rows[0] : null;
  const [teacherPct, setTeacherPct] = useState(''), [reviewerId, setReviewerId] = useState(''), [reviewerPct, setReviewerPct] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!rows) return;
    const same = <T,>(f: (r: Row) => T) => (rows.every(r => f(r) === f(rows[0])) ? f(rows[0]) : undefined);
    const tp = same(r => r.teacherPct), rid = same(r => r.reviewer?.id ?? ''), rp = same(r => r.reviewerPct);
    setTeacherPct(tp != null ? String(tp) : tp === null && defaultTeacherPct != null ? String(defaultTeacherPct) : '');
    setReviewerId(rid ?? ''); setReviewerPct(rp != null ? String(rp) : usualReviewerPct != null ? String(usualReviewerPct) : '');
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reviewers who cover the course's subject first
  const subjects = new Set((rows ?? []).map(r => r.subjectId).filter(Boolean));
  const sorted = [...reviewers].sort((a, b) => Number(b.subjects.some(x => subjects.has(x.id))) - Number(a.subjects.some(x => subjects.has(x.id))) || a.name.localeCompare(b.name));
  async function save() {
    if (!rows) return;
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const tp = num(teacherPct), rp = num(reviewerPct);
    if ((tp != null && (!Number.isFinite(tp) || tp < 0 || tp > 100)) || (rp != null && (!Number.isFinite(rp) || rp < 0 || rp > 100))) { notify.error('Shares are 0 to 100%'); return; }
    setSaving(true);
    try {
      await api.put('/admin/commissions', { courseIds: rows.map(r => r.id), teacherPct: tp, reviewerId: reviewerId || null, reviewerPct: reviewerId ? rp : null });
      notify.success(rows.length === 1 ? 'Saved' : `${rows.length} courses saved`); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={!!rows} onOpenChange={o => !o && onClose()}>
      <DialogContent title={one ? one.title : `${rows?.length ?? 0} courses`} description={one ? `Teacher: ${one.teacher?.name ?? 'none yet'}` : 'The same teacher share and reviewer for all of them. Blank leaves a value as it is only when they already match.'}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Teacher’s share (%)</span>
            <input inputMode="decimal" value={teacherPct} onChange={e => setTeacherPct(e.target.value)} placeholder="blank = paid outside the portal" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reviewer</span>
            <select value={reviewerId} onChange={e => setReviewerId(e.target.value)} className="input-base">
              <option value="">No reviewer</option>
              {sorted.map(r => <option key={r.id} value={r.id}>{r.name}{r.subjects.length ? ` · ${r.subjects.map(x => x.name).join(', ')}` : ''}</option>)}
            </select></label>
          {reviewerId && <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reviewer’s share (%)</span>
            <input inputMode="decimal" value={reviewerPct} onChange={e => setReviewerPct(e.target.value)} placeholder="e.g. 10" className="input-base" /></label>}
          <p className="text-[12.5px] text-muted">New sales use these shares. A new reviewer is told the course is theirs.</p>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Defaults({ open, current, onClose, onDone }: { open: boolean; current: number | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setV(current != null ? String(current) : ''); }, [open, current]);
  async function save(applyToMissing: boolean) {
    const n = v.trim() === '' ? null : Number(v);
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) { notify.error('0 to 100%'); return; }
    setSaving(true);
    try {
      await api.patch('/platform-courses/pricing-settings', { defaultTeacherCommissionPct: n });
      if (applyToMissing && n != null) { const r = await api.post('/platform-courses/pricing-settings/apply-commission'); notify.success(`Default saved and given to ${r.data.updated} course${r.data.updated === 1 ? '' : 's'} without a share`); }
      else notify.success('Default saved');
      onDone();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Default teacher share" description="New courses start with this share of each sale. Courses that already have a share keep it.">
        <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Teacher’s share (%)</span><input inputMode="decimal" value={v} onChange={e => setV(e.target.value)} placeholder="e.g. 40" className="input-base" /></label>
        <DialogFooter><Button variant="secondary" size="sm" onClick={() => save(true)} loading={saving} disabled={!v.trim()}>Save and fill courses with none</Button><Button size="sm" onClick={() => save(false)} loading={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
