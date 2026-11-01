'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import { StaffRoom } from '@/components/community/StaffRoom';
import api from '@/lib/api';

type Tab = 'staff' | 'qna';
const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? 'yesterday' : m < 10080 ? `${Math.round(m / 1440)} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function TeacherCommunityPage() {
  const [tab, setTab] = useState<Tab>('staff');
  const [waiting, setWaiting] = useState<number | null>(null);
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Community" subtitle={tab === 'staff' ? 'Talk with other teachers and CareerPath' : 'Questions students ask in your courses'} />
      <div role="tablist" className="flex gap-1 border-b border-line bg-white px-4 text-[14px] lg:px-7">
        {([['staff', 'Staff room'], ['qna', `Course Q&A${waiting ? ` · ${waiting} waiting` : ''}`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={clsx('-mb-px border-b-2 px-3 py-[13px]', tab === k ? 'border-azure-strong font-semibold text-navy' : 'border-transparent text-ink2 hover:text-navy')}>{l}</button>
        ))}
      </div>
      {tab === 'staff' ? <StaffRoom /> : <CourseQna onCount={setWaiting} />}
      {tab === 'staff' && <QnaCount onCount={setWaiting} />}
    </div>
  );
}

/* ─── Course Q&A ─────────────────────────────────────────────────────────── */

interface QReply { id: string; body: string; createdAt: string; upvotes: number; author: { id: string; name: string; isTeacher: boolean } }
interface Thread {
  id: string; body: string; createdAt: string; isPinned: boolean; course: { id: string; title: string }; lesson: { id: string; title: string } | null;
  author: { id: string; name: string; isTeacher: boolean }; upvotes: number; answered: boolean; teacherAnswer: QReply | null; replies: QReply[];
}
interface Feed { courses: { id: string; title: string }[]; threads: Thread[]; counts: { all: number; unanswered: number } }

function QnaCount({ onCount }: { onCount: (n: number) => void }) {
  useEffect(() => { api.get('/community/feed', { params: { show: 'unanswered' } }).then(r => onCount(r.data.counts?.unanswered ?? 0)).catch(() => {}); }, [onCount]);
  return null;
}

function CourseQna({ onCount }: { onCount: (n: number) => void }) {
  const [d, setD] = useState<Feed | null>(null);
  const [courseId, setCourseId] = useState('');
  const [tab, setTab] = useState<'waiting' | 'answered' | 'pinned'>('waiting');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api.get('/community/feed', { params: { show: 'recent', ...(courseId ? { courseId } : {}) } }).then(r => { setD(r.data); onCount(r.data.counts?.unanswered ?? 0); }).catch(() => notify.error('Could not load questions')), [courseId, onCount]);
  useEffect(() => { load(); }, [load]);

  const threads = d?.threads ?? [];
  const lists = {
    waiting: threads.filter(t => !t.answered).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    answered: threads.filter(t => t.answered && !t.author.isTeacher),
    pinned: threads.filter(t => t.isPinned),
  };
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const answeredThisMonth = threads.filter(t => t.teacherAnswer && new Date(t.teacherAnswer.createdAt) >= monthStart);
  const hours = answeredThisMonth.map(t => (+new Date(t.teacherAnswer!.createdAt) - +new Date(t.createdAt)) / 3_600_000).sort((a, b) => a - b);
  const median = hours.length ? hours[Math.floor(hours.length / 2)] : null;
  const oldest = lists.waiting[0];

  async function answer(t: Thread) {
    const body = (answers[t.id] ?? '').trim();
    if (!body) return;
    setBusy(t.id);
    try { await api.post('/community/posts', { courseId: t.course.id, parentId: t.id, body }); setAnswers(a => ({ ...a, [t.id]: '' })); notify.success('Answer posted'); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not post your answer'); }
    finally { setBusy(null); }
  }
  async function pin(t: Thread) {
    try { await api.post(`/community/posts/${t.id}/pin`); load(); } catch { notify.error('Could not pin it'); }
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
      <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {[
          { l: 'Waiting for you', v: d ? String(lists.waiting.length) : '—', sub: oldest ? `oldest ${ago(oldest.createdAt)}` : 'all answered' },
          { l: 'Answered this month', v: d ? String(answeredThisMonth.length) : '—', sub: median != null ? `median ${median < 1 ? `${Math.max(1, Math.round(median * 60))} min` : `${Math.round(median)} h`} to answer` : '' },
          { l: 'Upvotes on your answers', v: d ? String(answeredThisMonth.reduce((n, t) => n + (t.teacherAnswer?.upvotes ?? 0), 0)) : '—', sub: 'this month' },
          { l: 'Pinned', v: d ? String(lists.pinned.length) : '—', sub: 'across your courses' },
        ].map(s => (
          <div key={s.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
            <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{s.v}</dd>
            <dd className="mt-0.5 text-[12px] text-muted">{s.sub}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 text-[13.5px]">
          {([['waiting', 'Waiting for you'], ['answered', 'Answered'], ['pinned', 'Pinned']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={clsx('-mb-px border-b-2 px-2.5 py-[13px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{l} {lists[k].length}</button>
          ))}
          <span className="flex-1" />
          <select value={courseId} onChange={e => setCourseId(e.target.value)} aria-label="Course" className="my-2 h-8 rounded-md border border-line bg-white px-2 text-[13px] text-navy">
            <option value="">All my courses</option>
            {d?.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        {!d ? <div className="m-4 h-40 animate-pulse rounded bg-subtle" /> : lists[tab].length ? lists[tab].map(t => (
          <div key={t.id} className="flex flex-col gap-2 border-b border-line px-[18px] py-3.5 last:border-b-0">
            <p className="text-[12.5px] text-muted">{t.course.title}{t.lesson ? ` · ${t.lesson.title}` : ''} · {t.author.name} · {ago(t.createdAt)}{t.upvotes ? ` · ${t.upvotes} upvote${t.upvotes === 1 ? '' : 's'}` : ''}{t.teacherAnswer ? ' · answered by you' : ''}</p>
            <p className="text-[14.5px] font-semibold text-navy">{t.body}</p>
            {t.teacherAnswer && <p className="rounded-md bg-subtle px-3 py-2 text-[13px] text-ink2"><strong className="text-navy">You:</strong> {t.teacherAnswer.body}</p>}
            {!t.answered && (
              <div className="flex gap-2">
                <input value={answers[t.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [t.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && answer(t)} placeholder="Write your answer…" className="input-base h-10 flex-1" />
                <Button size="sm" onClick={() => answer(t)} loading={busy === t.id} disabled={!(answers[t.id] ?? '').trim()}>Answer</Button>
              </div>
            )}
            <div className="flex gap-3.5 text-[13px] font-semibold">
              <button onClick={() => pin(t)} className="text-muted hover:text-navy">{t.isPinned ? 'Unpin' : 'Pin'}</button>
              {t.lesson && <Link href={`/teacher/courses/${t.course.id}`} className="text-muted hover:text-navy">Open course</Link>}
            </div>
          </div>
        )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'waiting' ? 'No questions waiting. Nice.' : 'Nothing here yet.'}</p>}
      </section>
    </div>
  );
}
