'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type State = 'website' | 'empty' | 'failed' | 'queued' | 'running' | 'imported' | 'changed' | 'check' | 'edited';
interface Row {
  id: string; title: string; wpCourseId: number; status: string; tag: string | null; students: number; state: State;
  importedAt: string | null; wpModifiedAt: string | null; counts: { lessons: number; quizzes: number } | null; warnings: number;
  run: { id: string; status: string; step: string | null; error: string | null; finishedAt: string | null } | null;
}
interface Data {
  connected: boolean; quizzes: boolean; rows: Row[];
  stats: { website: number; empty: number; imported: number; changed: number; check: number; edited: number };
  queue: { waiting: number; running: { courseId: string; title: string; step: string | null; startedAt: string } | null; done: number };
}
type Tab = 'website' | 'imported' | 'changed' | 'check';

const TAB_OF: Record<State, Tab> = { website: 'website', empty: 'website', failed: 'website', queued: 'website', running: 'website', imported: 'imported', changed: 'changed', check: 'check', edited: 'imported' };
const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('z') ? 'zes' : 's'}`;

export default function TutorImportPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('website');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => api.get('/admin/tutor-import').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load courses')), []);
  useEffect(() => { load(); }, [load]);
  // While something is importing, keep the page current
  const active = !!d && (d.queue.waiting > 0 || !!d.queue.running);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  // Rows in the current tab, but a course being imported stays where it was picked
  const rows = useMemo(() => (d?.rows ?? [])
    .filter(r => TAB_OF[r.state] === tab || (tab !== 'website' && (r.state === 'queued' || r.state === 'running') && r.importedAt))
    .filter(r => !q.trim() || `${r.title} ${r.tag ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [d, tab, q]);
  const selectable = rows.filter(r => r.state !== 'queued' && r.state !== 'running');
  const allPicked = selectable.length > 0 && selectable.every(r => picked.has(r.id));

  async function start(ids: string[], force = false) {
    if (force && !confirm('Teachers have changed this course on the portal. Re-importing replaces their changes to lessons and questions that came from Tutor with Tutor’s version (lessons they added stay). Continue?')) return;
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/tutor-import/queue', { courseIds: ids, force });
      notify.success(`${plural(r.data.queued, 'course')} queued`, { description: 'They import one at a time in the background — you can leave this page.' });
      setPicked(new Set()); await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start the import'); }
    finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { const r = await api.post('/admin/tutor-import/cancel'); notify.success(r.data.cancelled ? `Stopped — ${plural(r.data.cancelled, 'course')} taken off the queue` : 'Nothing was waiting'); await load(); }
    catch { notify.error('Could not stop the queue'); }
    finally { setBusy(false); }
  }

  const running = d?.queue.running;
  const totalBatch = d ? d.queue.done + d.queue.waiting + (running ? 1 : 0) : 0;
  const position = d ? d.queue.done + 1 : 0;
  const pickedRows = (d?.rows ?? []).filter(r => picked.has(r.id));

  const badge = (s: State) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold',
    s === 'imported' || s === 'running' ? 'bg-accent-soft text-navy' : s === 'changed' || s === 'check' || s === 'failed' || s === 'edited' ? 'border border-dashed border-azure text-azure-strong' : 'border border-line bg-subtle text-ink2');
  const label: Record<State, string> = { website: 'Website only', empty: 'Nothing in Tutor', failed: 'Import failed', queued: 'Waiting', running: 'Importing…', imported: 'Imported', changed: 'Changed on website', check: 'To check', edited: 'Edited on the portal' };
  const td = 'border-b border-line px-4 py-3 align-top';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Course content from Tutor" subtitle={d ? (d.connected ? `Tutor LMS · connected${d.quizzes ? '' : ' (lessons only — add the WordPress login to copy quizzes)'}` : 'Tutor LMS is not connected') : ' '}
        backHref="/admin/courses/manage" backLabel="Course management" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        {!d ? <div className="h-[84px] animate-pulse rounded-lg border border-line bg-white" /> : (
          <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-4">
            <div className="min-w-0 flex-1">
              {running ? <>
                <p className="text-[16px] font-extrabold text-navy">Importing {position} of {totalBatch} · {running.title}</p>
                <p className="mt-0.5 text-[13px] text-ink2">{running.step ?? 'Starting'} — each course takes about a minute. You can leave this page; it carries on.</p>
                <span className="mt-2.5 block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure transition-all" style={{ width: `${Math.round(((position - 1) / Math.max(1, totalBatch)) * 100) + 3}%` }} /></span>
              </> : picked.size ? <>
                <p className="text-[16px] font-extrabold text-navy">{plural(picked.size, 'course')} selected</p>
                <p className="mt-0.5 text-[13px] text-ink2">{plural(pickedRows.reduce((n, r) => n + r.students, 0), 'student')} enrolled. Courses already imported are updated in place — anything added on the portal stays.</p>
              </> : <>
                <p className="text-[16px] font-extrabold text-navy">{d.stats.website ? `${plural(d.stats.website, 'WordPress course')} still open on the website` : 'Every WordPress course plays in the portal'}</p>
                <p className="mt-0.5 text-[13px] text-ink2">Import their content so students learn in the portal’s player, with progress, notes and quizzes that count.</p>
              </>}
            </div>
            {running || d.queue.waiting
              ? <button onClick={stop} disabled={busy || !d.queue.waiting} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">{d.queue.waiting ? 'Stop after this course' : 'Finishing the last course'}</button>
              : <Button size="sm" onClick={() => start([...picked])} loading={busy} disabled={!picked.size || !d.connected}>{picked.size ? `Import ${picked.size} selected` : 'Select courses to import'}</Button>}
          </section>
        )}

        <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'On the website only', v: d?.stats.website, sub: d?.stats.empty ? `${d.stats.empty} with nothing in Tutor yet` : 'play in an embedded page' },
            { l: 'Imported', v: d?.stats.imported, sub: 'play in the portal' },
            { l: 'Changed since import', v: d?.stats.changed, sub: 'edited on WordPress' },
            { l: 'To check', v: d?.stats.check, sub: 'questions we changed or couldn’t copy' },
          ].map(s => (
            <div key={s.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
              <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{s.v ?? '—'}</dd>
              <dd className="mt-0.5 text-[12px] text-muted">{s.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 text-[13.5px]">
            {([['website', 'Not imported', d?.stats.website], ['imported', 'Imported', d?.rows.filter(r => r.state === 'imported').length], ['changed', 'Changed', d?.stats.changed], ['check', 'To check', d?.stats.check]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => { setTab(k); setPicked(new Set()); }} aria-pressed={tab === k}
                className={clsx('-mb-px border-b-2 px-2.5 py-[13px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{l} {n ?? ''}</button>
            ))}
            <span className="flex-1" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses"
              className="my-2 h-8 w-56 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure max-sm:w-full" />
          </div>
          {!d ? <div className="m-4 h-48 animate-pulse rounded-md bg-subtle" /> : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                <thead><tr>
                  <th className="w-10 border-b border-line px-4 py-2.5 text-left">
                    <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map(r => r.id)))} className="h-4 w-4 accent-[#3F6FE8]" />
                  </th>
                  {['Course', 'In Tutor', 'Content', 'Students', ''].map((h, i) => <th key={i} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}
                </tr></thead>
                <tbody>{rows.map(r => {
                  const busyRow = r.state === 'queued' || r.state === 'running';
                  return (
                    <tr key={r.id} className={clsx('hover:bg-subtle', picked.has(r.id) && 'bg-subtle')}>
                      <td className={td}>
                        <input type="checkbox" aria-label={`Select ${r.title}`} disabled={busyRow} checked={picked.has(r.id)}
                          onChange={() => setPicked(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} className="h-4 w-4 accent-[#3F6FE8]" />
                      </td>
                      <td className={td}><strong className="text-navy">{r.title}</strong><br /><span className="text-[12.5px] text-muted">{r.tag ?? 'Not tagged yet'}{r.status !== 'PUBLISHED' ? ` · ${r.status.toLowerCase().replace('_', ' ')}` : ''}</span></td>
                      <td className={clsx(td, 'text-ink2')}>{r.counts ? `${plural(r.counts.lessons, 'lesson')} · ${plural(r.counts.quizzes, 'quiz')}` : <span className="text-muted">Read when imported</span>}</td>
                      <td className={td}>
                        <span className={badge(r.state)}>{label[r.state]}</span><br />
                        <span className="text-[12px] text-muted">
                          {r.state === 'running' ? r.run?.step ?? '' : r.state === 'failed' ? r.run?.error ?? '' : r.state === 'empty' ? 'no lessons to copy yet' : r.state === 'edited' ? 'teachers work on it here now' : r.state === 'changed' && r.importedAt && r.wpModifiedAt ? `imported ${short(r.importedAt)} · edited ${short(r.wpModifiedAt)}` : r.state === 'check' ? plural(r.warnings, 'thing') + ' to check' : r.importedAt ? `imported ${short(r.importedAt)}` : ''}
                        </span>
                      </td>
                      <td className={clsx(td, 'text-ink2')}>{r.students ? `${r.students} enrolled` : '—'}</td>
                      <td className={clsx(td, 'whitespace-nowrap text-right')}>
                        {busyRow ? null : <>
                          {r.importedAt && <button onClick={() => setOpen(r.id)} className="mr-3 font-semibold text-azure-strong hover:underline">{r.state === 'check' ? 'See result' : 'Result'}</button>}
                          <button onClick={() => start([r.id], r.state === 'edited')} disabled={busy || !d.connected} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">{r.state === 'edited' ? 'Re-import anyway' : r.state === 'changed' ? 'Update' : r.importedAt ? 'Re-import' : r.state === 'failed' ? 'Try again' : 'Import'}</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <p className="px-4 py-10 text-center text-[13px] text-ink2">{q.trim() ? 'Nothing matches.' : tab === 'website' ? 'Every WordPress course has been imported.' : tab === 'imported' ? 'Nothing imported yet.' : tab === 'changed' ? 'Nothing has changed on the website since it was imported.' : 'Nothing to check.'}</p>}
        </section>
        <p className="text-[12.5px] text-muted">
          Importing copies topics, lessons (text, pictures, video links, attachments) and quizzes into the portal, so students learn in the portal’s player.
          From then on the course is built here: its teacher edits it, adds lessons and proposes a price in their course builder, not in Tutor.
          Importing again only updates courses nobody has changed on the portal (anything a teacher added always stays); otherwise it stops and asks before replacing their work. Lessons students have started are never deleted.
          {' '}New courses come from <Link href="/admin/courses/wordpress" className="font-semibold text-azure-strong hover:underline">Pull from WordPress</Link>.
        </p>
      </div>
      <Result courseId={open} onClose={() => setOpen(null)} onReimport={id => { setOpen(null); start([id]); }} />
    </div>
  );
}

interface ResultData {
  course: { id: string; title: string; importedAt: string | null; wpCourseUrl: string | null; firstLessonId: string | null } | null;
  run: { status: string; error: string | null; finishedAt: string | null; by: string | null };
  summary: {
    modules: number; lessons: number; videos: number; quizzes: number; attachments: number; images: number;
    questions: { auto: number; teacher: number; skipped: number }; outline: { title: string; items: { title: string; kind: string; meta: string }[] }[];
    warnings: string[]; notes?: string[];
  } | null;
}

function Result({ courseId, onClose, onReimport }: { courseId: string | null; onClose: () => void; onReimport: (id: string) => void }) {
  const [r, setR] = useState<ResultData | null>(null);
  useEffect(() => {
    setR(null);
    if (courseId) api.get(`/admin/tutor-import/${courseId}`).then(x => setR(x.data)).catch(() => notify.error('Could not open the result'));
  }, [courseId]);
  const s = r?.summary;
  const ago = (iso: string) => { const m = Math.round((Date.now() - +new Date(iso)) / 60_000); return m < 60 ? `${m || 1} minute${m === 1 ? '' : 's'} ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : short(iso); };
  return (
    <Drawer open={!!courseId} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={r?.course?.title ?? 'Import result'} description={r?.run.finishedAt ? `Imported ${ago(r.run.finishedAt)}${r.run.by ? ` by ${r.run.by}` : ''}` : ' '}
        footer={r?.course && <>
          <Link href={`/admin/courses/${r.course.id}`} className="inline-flex h-9 items-center rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Open the course</Link>
          {r.course.wpCourseUrl && <a href={r.course.wpCourseUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Compare with the website</a>}
          <span className="flex-1" />
          <button onClick={() => onReimport(r.course!.id)} className="text-[13.5px] font-semibold text-azure-strong hover:underline">Re-import</button>
        </>}>
        {!r ? <div className="h-64 animate-pulse rounded bg-subtle" /> : r.run.status === 'FAILED' ? (
          <p className="rounded-md border border-dashed border-azure px-3 py-2.5 text-[13px] text-ink2">The last import failed: {r.run.error}</p>
        ) : !s ? <p className="text-[13px] text-ink2">No result yet.</p> : <>
          <dl className="grid grid-cols-3 gap-2.5">
            {[['Modules', s.modules], ['Lessons', s.lessons], ['Quizzes', s.quizzes]].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-line px-3 py-2.5"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l}</dt><dd className="mt-0.5 text-[18px] font-extrabold text-navy">{v}</dd></div>
            ))}
          </dl>
          <p className="text-[13px] text-ink2">
            {[s.videos && plural(s.videos, 'video'), s.images && plural(s.images, 'picture'), s.attachments && plural(s.attachments, 'attachment'),
              s.questions.auto && `${s.questions.auto} questions marked automatically`, s.questions.teacher && `${s.questions.teacher} marked by the teacher`].filter(Boolean).join(' · ') || 'Text lessons only.'}
          </p>
          <DrawerSection title="What came across">
            <div className="flex flex-col gap-1.5">
              {s.outline.map((m, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <p className="text-[13.5px] font-bold text-navy">{m.title}</p>
                  {m.items.map((it, j) => (
                    <p key={j} className="ml-3.5 flex justify-between gap-3 text-[13px] text-navy"><span className="min-w-0 truncate">{it.title}</span><span className="shrink-0 text-[12px] text-muted">{it.kind === 'quiz' ? `quiz · ${it.meta}` : it.meta}</span></p>
                  ))}
                </div>
              ))}
            </div>
          </DrawerSection>
          {s.warnings.length > 0 && (
            <DrawerSection title="Check these" count={s.warnings.length}>
              <div className="flex flex-col gap-2">{s.warnings.map((w, i) => <p key={i} className="rounded-md border border-dashed border-azure px-3 py-2.5 text-[13px] text-ink2">{w}</p>)}</div>
            </DrawerSection>
          )}
          {!!s.notes?.length && (
            <DrawerSection title="Good to know">
              <div className="flex flex-col gap-1.5">{s.notes.map((w, i) => <p key={i} className="text-[13px] text-ink2">{w}</p>)}</div>
            </DrawerSection>
          )}
        </>}
      </DrawerContent>
    </Drawer>
  );
}
