'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Person = { email: string; firstName?: string | null; lastName?: string | null; name?: string | null };
interface Story { id: string; story: string; consentToPublish: boolean; status: string; submittedAt: string; student: Person }
interface Post { id: string; body: string; createdAt: string; isPinned: boolean; upvotes: number; replies: number; course: { id: string; title: string }; author: { name: string; role: string } }
type Tab = 'stories' | 'discussions' | 'published';

const nameOf = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<Tab>('stories');
  const [queue, setQueue] = useState<Story[] | null>(null);
  const [published, setPublished] = useState<Story[] | null>(null);
  const [posts, setPosts] = useState<{ total: number; rows: Post[] } | null>(null);
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStories = useCallback(() => {
    api.get('/community/admin/success-stories').then(r => setQueue(r.data ?? [])).catch(() => setQueue([]));
    api.get('/community/success-stories/published').then(r => setPublished(r.data ?? [])).catch(() => setPublished([]));
  }, []);
  const loadPosts = useCallback((term: string) => api.get('/community/admin/discussions', { params: term ? { q: term } : {} }).then(r => setPosts(r.data)).catch(() => setPosts({ total: 0, rows: [] })), []);
  useEffect(() => { loadStories(); loadPosts(''); }, [loadStories, loadPosts]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => loadPosts(q.trim()), 300);
  }, [q, loadPosts]);

  async function review(s: Story, status: 'APPROVED' | 'REJECTED') {
    try { await api.patch(`/community/admin/success-stories/${s.id}`, { status }); notify.success(status === 'APPROVED' ? 'Published' : 'Declined'); loadStories(); }
    catch { notify.error('Could not save that'); }
  }
  async function pin(p: Post) {
    try { const r = await api.post(`/community/posts/${p.id}/pin`); setPosts(x => x && { ...x, rows: x.rows.map(y => (y.id === p.id ? { ...y, isPinned: r.data.isPinned } : y)) }); }
    catch { notify.error('Could not pin it'); }
  }
  async function remove(p: Post) {
    if (!confirm(`Remove this question${p.replies ? ` and its ${p.replies} repl${p.replies === 1 ? 'y' : 'ies'}` : ''}? This can’t be undone.`)) return;
    try { await api.delete(`/community/admin/discussions/${p.id}`); setPosts(x => x && { total: x.total - 1, rows: x.rows.filter(y => y.id !== p.id) }); notify.success('Removed'); }
    catch { notify.error('Could not remove it'); }
  }

  const tabs: [Tab, string, number | undefined][] = [['stories', 'Success stories to approve', queue?.length], ['discussions', 'Course discussions', posts?.total], ['published', 'Published stories', published?.length]];
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Community" subtitle="Success stories to approve, and course discussions" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 text-[13.5px]">
            {tabs.map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={clsx('-mb-px border-b-2 px-2.5 py-[13px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{l} {n ?? ''}</button>
            ))}
            <span className="flex-1" />
            {tab === 'discussions' && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search posts" aria-label="Search posts" className="my-2 h-8 w-56 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure max-sm:w-full" />}
          </div>

          {tab === 'stories' && (!queue ? <div className="m-4 h-32 animate-pulse rounded bg-subtle" /> : queue.length ? queue.map(s => (
            <div key={s.id} className="flex flex-wrap gap-3.5 border-b border-line px-[18px] py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-muted">{nameOf(s.student)} · {s.consentToPublish ? 'agreed to publishing' : 'did not agree to publishing — approving keeps it private'} · {date(s.submittedAt)}</p>
                <p className="mt-1 text-[14px] text-navy">“{s.story}”</p>
              </div>
              <div className="flex shrink-0 gap-3 text-[13px] font-semibold"><button onClick={() => review(s, 'APPROVED')} className="text-azure-strong hover:underline">Approve</button><button onClick={() => review(s, 'REJECTED')} className="text-muted hover:text-navy hover:underline">Decline</button></div>
            </div>
          )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">No stories waiting.</p>)}

          {tab === 'discussions' && (!posts ? <div className="m-4 h-32 animate-pulse rounded bg-subtle" /> : posts.rows.length ? posts.rows.map(p => (
            <div key={p.id} className="flex flex-wrap gap-3.5 border-b border-line px-[18px] py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-muted">{p.isPinned && <strong className="text-azure-strong">Pinned · </strong>}{p.course.title} · {p.author.name}{p.author.role === 'TEACHER' ? ' (teacher)' : ''} · {p.replies} repl{p.replies === 1 ? 'y' : 'ies'} · {p.upvotes} upvote{p.upvotes === 1 ? '' : 's'} · {date(p.createdAt)}</p>
                <p className="mt-1 text-[14px] text-navy">{p.body}</p>
              </div>
              <div className="flex shrink-0 gap-3 text-[13px] font-semibold"><button onClick={() => pin(p)} className="text-azure-strong hover:underline">{p.isPinned ? 'Unpin' : 'Pin'}</button><button onClick={() => remove(p)} className="text-muted hover:text-navy hover:underline">Remove</button></div>
            </div>
          )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">{q ? 'Nothing matches.' : 'No questions yet.'}</p>)}

          {tab === 'published' && (!published ? <div className="m-4 h-32 animate-pulse rounded bg-subtle" /> : published.length ? published.map(s => (
            <div key={s.id} className="border-b border-line px-[18px] py-3.5 last:border-b-0">
              <p className="text-[12.5px] text-muted">{nameOf(s.student)} · {date(s.submittedAt)}</p>
              <p className="mt-1 text-[14px] text-navy">“{s.story}”</p>
              <button onClick={() => review(s, 'REJECTED')} className="mt-1.5 text-[13px] font-semibold text-muted hover:text-navy hover:underline">Unpublish</button>
            </div>
          )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">No published stories yet.</p>)}
        </section>
        <p className="text-[12.5px] text-muted">Approved stories appear on the website’s success stories and the student dashboard. Only stories with the student’s consent are published.</p>
      </div>
    </div>
  );
}
