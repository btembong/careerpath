'use client';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useDropzone } from 'react-dropzone';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { StudentAssignmentsHero } from '@/components/hero/StudentHeroes';

type State = 'todo' | 'overdue' | 'submitted' | 'graded';
interface Row {
  id: string; title: string; description: string; dueDate: string; maxPoints: number;
  cohort: { id: string; name: string }; teacher: string; state: State; late: boolean;
  submission: { id: string; fileUrl: string | null; grade: number | null; feedback: string | null; submittedAt: string; note: string | null } | null;
}
interface Overview {
  stats: { dueThisWeek: number; nextDue: Row | null; overdue: number; avgGradePct: number | null; graded: number; submitted: number; total: number };
  assignments: Row[];
}
type Tab = 'todo' | 'submitted' | 'graded';

const DAY = 86_400_000;
const due = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dueIn = (d: string) => {
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / DAY);
  return days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
};

export default function StudentAssignmentsPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('todo');
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() { const r = await api.get('/education/student/assignments-overview'); setD(r.data); }
  useEffect(() => {
    load().catch(() => setD({ stats: { dueThisWeek: 0, nextDue: null, overdue: 0, avgGradePct: null, graded: 0, submitted: 0, total: 0 }, assignments: [] }));
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setOpenId(id);
  }, []);

  const lists = useMemo(() => {
    const a = d?.assignments ?? [];
    return {
      todo: a.filter(x => x.state === 'todo' || x.state === 'overdue').sort((x, y) => Number(y.state === 'overdue') - Number(x.state === 'overdue') || +new Date(x.dueDate) - +new Date(y.dueDate)),
      submitted: a.filter(x => x.state === 'submitted'),
      graded: a.filter(x => x.state === 'graded').reverse(),
    } as Record<Tab, Row[]>;
  }, [d]);
  const s = d?.stats;
  const open = d?.assignments.find(a => a.id === openId) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Assignments" subtitle="Work from your teachers, what’s due and your grades" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <StudentAssignmentsHero stats={s ?? null} rows={d?.assignments ?? []} onOpen={setOpenId} />

        <section id="list" className="rounded-lg border border-line bg-white">
          <div role="tablist" aria-label="Assignments" className="flex gap-1 border-b border-line px-4">
            {([['todo', 'To do'], ['submitted', 'Handed in'], ['graded', 'Graded']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                {l} <span className="font-medium text-muted">{lists[k].length}</span>
              </button>
            ))}
          </div>
          {!d ? <div className="m-4 h-40 rounded-md bg-subtle animate-pulse" /> : !lists[tab].length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'todo' ? 'Nothing to do right now.' : tab === 'submitted' ? 'Nothing waiting for a grade.' : 'No grades yet.'}</p>
          ) : lists[tab].map(a => {
            const meta = a.state === 'graded' ? `Graded ${a.submission!.grade}/${a.maxPoints}${a.submission!.feedback ? ` · “${a.submission!.feedback.slice(0, 60)}${a.submission!.feedback.length > 60 ? '…' : ''}”` : ''}`
              : a.state === 'submitted' ? `Handed in ${new Date(a.submission!.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${a.late ? ' · late' : ''} · ${a.cohort.name}`
              : `${a.cohort.name} · ${a.state === 'overdue' ? 'was due' : 'due'} ${due(a.dueDate)} · ${a.maxPoints} marks`;
            const badge = a.state === 'overdue' ? 'Overdue' : a.state === 'todo' ? dueIn(a.dueDate) : a.state === 'submitted' ? 'Waiting for grade' : `${Math.round((a.submission!.grade! / a.maxPoints) * 100)}%`;
            const cta = a.state === 'todo' ? 'Start' : a.state === 'overdue' ? 'Hand in late' : a.state === 'submitted' ? 'View' : 'See feedback';
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{meta}</p>
                </div>
                <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', a.state === 'overdue' || a.state === 'submitted' ? 'border border-line bg-subtle text-ink2' : 'bg-accent-soft text-navy')}>{badge}</span>
                <button type="button" onClick={() => setOpenId(a.id)}
                  className={clsx('inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-semibold', a.state === 'todo' || a.state === 'overdue' ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle')}>{cta}</button>
              </div>
            );
          })}
        </section>
      </div>

      <AssignmentDrawer a={open} onClose={() => setOpenId(null)} onDone={load} />
    </div>
  );
}

function AssignmentDrawer({ a, onClose, onDone }: { a: Row | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFile(null); setNote(a?.submission?.note ?? ''); }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false, maxSize: 20 * 1024 * 1024,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    onDropRejected: () => notify.error('Use a PDF, photo or Word file up to 20 MB'),
    onDropAccepted: async ([f]) => {
      setUploading(true);
      try {
        const fd = new FormData(); fd.append('file', f);
        const r = await api.post('/files/upload?folder=submissions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setFile({ name: f.name, url: r.data?.url ?? r.data?.fileUrl ?? r.data });
      } catch { notify.error('Upload failed. Please try again.'); }
      finally { setUploading(false); }
    },
  });

  if (!a) return <Drawer open={false} onOpenChange={() => {}}>{null}</Drawer>;
  const canHandIn = a.state === 'todo' || a.state === 'overdue' || a.state === 'submitted';

  async function handIn() {
    setBusy(true);
    try {
      await api.post(`/education/assignments/${a!.id}/submit`, { fileUrl: file?.url ?? a!.submission?.fileUrl ?? undefined, note: note.trim() || undefined });
      notify.success(a!.state === 'submitted' ? 'Updated' : 'Handed in', { description: 'Your teacher will grade it and you’ll get a notification.' });
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not hand it in'); }
    finally { setBusy(false); }
  }

  return (
    <Drawer open onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title={a.title} description={`${a.teacher} · ${a.cohort.name}`}
        footer={canHandIn ? <>
          <span className="flex-1 self-center text-[12.5px] text-muted">{a.state === 'overdue' ? 'This will be marked late.' : a.state === 'submitted' ? 'You can replace your work until it’s graded.' : ''}</span>
          <Button loading={busy} disabled={uploading || (!file && !a.submission?.fileUrl && !note.trim())} onClick={handIn}>{a.state === 'submitted' ? 'Update hand-in' : 'Hand in'}</Button>
        </> : undefined}>
        <InfoGrid items={[
          { label: 'Due', value: due(a.dueDate) },
          { label: 'Marks', value: String(a.maxPoints) },
          { label: 'Status', value: a.state === 'graded' ? `Graded ${a.submission!.grade}/${a.maxPoints}` : a.state === 'submitted' ? (a.late ? 'Handed in late' : 'Handed in') : a.state === 'overdue' ? 'Overdue' : 'To do' },
        ]} />
        <DrawerSection title="Instructions">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink2">{a.description}</p>
        </DrawerSection>
        {a.state === 'graded' && (
          <DrawerSection title="Feedback">
            <p className="rounded-md border border-azure bg-accent-soft px-3.5 py-3 text-[13.5px] text-navy">
              <strong>{a.submission!.grade}/{a.maxPoints}</strong>{a.submission!.feedback ? ` — ${a.submission!.feedback}` : ''}
            </p>
          </DrawerSection>
        )}
        <DrawerSection title="Your work">
          {a.submission?.fileUrl && <a href={a.submission.fileUrl} target="_blank" rel="noopener noreferrer" className="block text-[13.5px] font-semibold text-azure-strong hover:underline">Open what you handed in</a>}
          {canHandIn && (
            <div {...(getRootProps() as React.HTMLAttributes<HTMLDivElement>)} className={clsx('cursor-pointer rounded-md border border-dashed px-4 py-5 text-center text-[13.5px]', isDragActive ? 'border-azure bg-accent-soft' : 'border-azure bg-subtle')}>
              <input {...getInputProps()} />
              {uploading ? 'Uploading…' : file ? <><strong className="text-navy">{file.name}</strong> <span className="text-muted">· ready to hand in</span></> : <span className="text-ink2">Upload a photo or PDF of your work — or drop it here</span>}
            </div>
          )}
          {canHandIn && (
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Note to your teacher (optional)</span>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
            </label>
          )}
          {!canHandIn && a.submission?.note && <p className="text-[13px] text-ink2">Your note: “{a.submission.note}”</p>}
        </DrawerSection>
      </DrawerContent>
    </Drawer>
  );
}
