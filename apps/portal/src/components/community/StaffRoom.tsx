'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? 'yesterday' : m < 10080 ? `${Math.round(m / 1440)} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const initials = (n: string) => n.split(/\s+/).map(w => w[0]?.toUpperCase()).join('').slice(0, 2);

/* The staff room: teachers, reviewers and CareerPath talking to each other, apart from students */
interface Who { id: string; name: string; avatarUrl: string | null; badge: string | null; isAdmin: boolean }
interface Reply { id: string; body: string; createdAt: string; upvotes: number; myUpvote: boolean; author: Who; mine: boolean }
interface Post extends Reply { room: string; roomLabel: string; isPinned: boolean; replies: Reply[] }
interface Staff { rooms: { key: string; label: string; count: number; adminOnly?: boolean }[]; room: string; canPostAnnouncements: boolean; isAdmin: boolean; latestNews: { id: string; body: string; createdAt: string } | null; posts: Post[] }

function Avatar({ who }: { who: Who }) {
  // eslint-disable-next-line @next/next/no-img-element
  return who.avatarUrl ? <img src={who.avatarUrl} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
    : <span className={clsx('inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold', who.isAdmin ? 'bg-navy text-white' : 'bg-accent-soft text-navy')}>{who.isAdmin ? 'CP' : initials(who.name)}</span>;
}

export function StaffRoom() {
  const [d, setD] = useState<Staff | null>(null);
  const [room, setRoom] = useState('all');
  const [body, setBody] = useState('');
  const [postRoom, setPostRoom] = useState('tips');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const load = useCallback(() => api.get('/staff-room', { params: room === 'all' ? {} : { room } }).then(r => setD(r.data)).catch(() => notify.error('Could not load the staff room')), [room]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (room !== 'all') setPostRoom(room); }, [room]);

  const postable = d?.rooms.filter(r => r.key !== 'all' && (!r.adminOnly || d.canPostAnnouncements)) ?? [];
  async function post() {
    setSending(true);
    try { await api.post('/staff-room', { room: postRoom, body: body.trim() }); setBody(''); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not post'); }
    finally { setSending(false); }
  }
  async function sendReply(id: string) {
    try { await api.post('/staff-room', { parentId: id, body: reply.trim() }); setReply(''); setReplyTo(null); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not reply'); }
  }
  async function act(path: string, method: 'post' | 'delete' = 'post') {
    try { await (method === 'post' ? api.post(path) : api.delete(path)); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not do that'); }
  }

  return (
    <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-[22px]">
      <nav aria-label="Rooms" className="flex flex-[0_0_200px] flex-col gap-0.5 text-[13.5px] max-md:flex-[1_1_100%] max-md:flex-row max-md:flex-wrap">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted max-md:hidden">Rooms</p>
        {(d?.rooms ?? []).map(r => (
          <button key={r.key} onClick={() => setRoom(r.key)} aria-current={room === r.key ? 'page' : undefined}
            className={clsx('flex justify-between gap-3 rounded-md px-2.5 py-2 text-left text-navy', room === r.key ? 'bg-accent-soft font-semibold' : 'hover:bg-white')}>
            <span>{r.label}</span><span className="text-[12px] text-muted">{r.count}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
        <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white px-4 py-3.5">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Ask other teachers, share what works in your classes…" className="input-base min-h-[70px] py-2" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] text-muted">Posting in{' '}
              <select value={postRoom} onChange={e => setPostRoom(e.target.value)} aria-label="Room" className="cursor-pointer bg-transparent font-semibold text-navy outline-none">
                {postable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>{' '}· only teachers, reviewers and CareerPath see this</span>
            <Button size="sm" onClick={post} loading={sending} disabled={!body.trim()}>Post</Button>
          </div>
        </section>
        {!d ? <div className="h-48 animate-pulse rounded-lg bg-white" /> : d.posts.length ? d.posts.map(p => (
          <article key={p.id} className={clsx('flex flex-col gap-2.5 rounded-lg border bg-white px-4 py-3.5', p.isPinned ? 'border-azure' : 'border-line')}>
            <div className="flex items-center gap-2.5">
              <Avatar who={p.author} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-navy">{p.author.name}{p.author.badge && <span className={clsx('ml-1.5 rounded px-1.5 py-px text-[11px] font-semibold', p.author.isAdmin ? 'bg-navy text-white' : 'bg-accent-soft text-navy')}>{p.author.badge}</span>}</p>
                <p className="text-[12px] text-muted">{p.roomLabel} · {ago(p.createdAt)}</p>
              </div>
              {p.isPinned && <span className="text-[12px] font-semibold text-azure-strong">Pinned</span>}
            </div>
            <p className="whitespace-pre-wrap text-[14px] text-navy">{p.body}</p>
            <div className="flex flex-wrap gap-4 text-[12.5px] text-muted">
              <button onClick={() => !p.mine && act(`/staff-room/${p.id}/upvote`)} disabled={p.mine} className={clsx(p.myUpvote && 'font-semibold text-azure-strong', !p.mine && 'hover:text-navy')}>▲ {p.upvotes} found this useful</button>
              <span>{p.replies.length} repl{p.replies.length === 1 ? 'y' : 'ies'}</span>
              <button onClick={() => { setReplyTo(replyTo === p.id ? null : p.id); setReply(''); }} className="font-semibold text-azure-strong hover:underline">Reply</button>
              {d.isAdmin && <button onClick={() => act(`/staff-room/${p.id}/pin`)} className="hover:text-navy">{p.isPinned ? 'Unpin' : 'Pin'}</button>}
              {(p.mine || d.isAdmin) && <button onClick={() => confirm('Remove this post and its replies?') && act(`/staff-room/${p.id}`, 'delete')} className="hover:text-navy">Remove</button>}
            </div>
            {p.replies.map(r => (
              <div key={r.id} className="ml-11 rounded-md bg-subtle px-3 py-2.5 text-[13px]">
                <strong className="text-navy">{r.author.name}</strong> · <span className="text-muted">{ago(r.createdAt)}</span>
                {(r.mine || d.isAdmin) && <button onClick={() => act(`/staff-room/${r.id}`, 'delete')} className="float-right text-[12px] text-muted hover:text-navy">Remove</button>}
                <p className="mt-0.5 whitespace-pre-wrap text-ink2">{r.body}</p>
              </div>
            ))}
            {replyTo === p.id && (
              <div className="ml-11 flex gap-2">
                <input autoFocus value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && reply.trim() && sendReply(p.id)} placeholder="Write a reply" className="input-base h-9 flex-1" />
                <Button size="sm" onClick={() => sendReply(p.id)} disabled={!reply.trim()}>Reply</Button>
              </div>
            )}
          </article>
        )) : <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">Nothing here yet. Start the conversation.</p>}
      </div>

      <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5">
        <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
          <h3 className="text-[15px] font-semibold text-navy">From CareerPath</h3>
          <p className="line-clamp-4 text-[13px] text-ink2">{d?.latestNews ? d.latestNews.body : 'Announcements from the CareerPath team show here.'}</p>
          {d?.latestNews && <button onClick={() => setRoom('announcements')} className="self-start text-[13px] font-semibold text-azure-strong hover:underline">All announcements</button>}
        </section>
        <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
          <h3 className="text-[15px] font-semibold text-navy">House rules</h3>
          <p className="text-[13px] text-ink2">Be kind, keep student details private, and no selling. CareerPath can remove posts.</p>
        </section>
      </aside>
    </div>
  );
}

