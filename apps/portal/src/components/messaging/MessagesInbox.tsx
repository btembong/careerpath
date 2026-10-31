'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { io, Socket } from 'socket.io-client';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { SOCKET_ORIGIN, shrinkPhoto, fileSize } from '@/lib/images';
import api from '@/lib/api';

type Role = 'student' | 'teacher' | 'admin' | 'rep' | 'reviewer';
interface Person { id: string; name: string; avatarUrl: string | null; role: string; context: string; online?: boolean; lastSeen?: string | null }
interface ThreadSummary {
  id: string; kind: 'direct' | 'group'; other: Person;
  lastMessage: { body: string; createdAt: string; isOwn: boolean; sender: string | null; readAt: string | null } | null;
  unread: number; lastMessageAt: string;
}
interface Message {
  id: string; body: string; senderId: string; senderName: string; senderRole: string; createdAt: string; isOwn: boolean; readAt: string | null;
  attachmentUrl: string | null; attachmentName: string | null; attachmentType: string | null; attachmentSize: number | null;
  /** Client-only: still uploading/sending, or failed */
  pending?: 'sending' | 'failed'; localPreview?: string;
}
interface StudentFacts { id: string; name: string; cohort: { id: string; name: string }; progress: number; attended: number; held: number; submitted: number; assignments: number; lastActive: string | null; flag: string | null; flagReason: string | null }

const SUB: Record<Role, string> = {
  student: 'Your teachers, classmates, cohort group and support', teacher: 'Your students, cohort groups and support',
  admin: 'Conversations with anyone on the platform', rep: 'Teachers in your country and support', reviewer: 'Teachers of the courses you review, and support',
};
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024;

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function shortTime(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return time(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return +now - +d < 6 * 86_400_000 ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', +now - +d < 6 * 86_400_000 ? { weekday: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}
function lastSeen(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return `last seen today at ${time(iso)}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `last seen yesterday at ${time(iso)}`;
  return `last seen ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
/** Group sender names get one of a few readable colours, always the same for a person */
const NAME_COLOURS = ['#2F57C9', '#0E7C66', '#9C3D8C', '#B45309', '#1D6FA3', '#7A4CC2'];
const colourFor = (id: string) => NAME_COLOURS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % NAME_COLOURS.length];

function Avatar({ p, size = 40, group = false }: { p: Pick<Person, 'name' | 'avatarUrl'>; size?: number; group?: boolean }) {
  if (p.avatarUrl) return <img src={p.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-accent-soft font-extrabold text-azure-strong" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>
      {group ? <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6" /></svg> : initials(p.name)}
    </span>
  );
}

/** ✓ sent, ✓✓ delivered-and-read (blue). Groups show a single tick once sent. */
function Ticks({ m, group, light }: { m: Pick<Message, 'pending' | 'readAt'>; group: boolean; light?: boolean }) {
  if (m.pending === 'sending') return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Sending" className="opacity-70"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>;
  if (m.pending === 'failed') return <span aria-label="Not sent" className="font-bold text-red-300">!</span>;
  const read = !group && !!m.readAt;
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-label={read ? 'Read' : 'Sent'} className={clsx(read ? (light ? 'text-[#BFE3FF]' : 'text-azure-strong') : 'opacity-70')}>
      <path d="M1 6.5l3.2 3.2L10.5 2.5" />{!group && <path d="M7 9.7l.9.9L14.5 3" />}
    </svg>
  );
}

const Icon = {
  clip: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" /></svg>,
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.2L4.3 12l-2.3 7.2a1 1 0 0 0 1.4 1.2z" /></svg>,
  file: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
  back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  down: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>,
};

export default function MessagesInbox({ backHref, role = 'student' }: { backHref: string; role?: Role }) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<{ file: File; preview: string | null } | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [students, setStudents] = useState<StudentFacts[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const activeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  activeRef.current = activeId;

  const loadThreads = useCallback(async () => {
    const r = await api.get('/messages/threads');
    setThreads(r.data);
    return r.data as ThreadSummary[];
  }, []);

  const openWith = useCallback(async (personId: string) => {
    try {
      const t = await api.post('/messages/threads', { recipientId: personId });
      await loadThreads();
      setActiveId(t.data.threadId);
    } catch { notify.error('Could not open that conversation'); }
  }, [loadThreads]);

  // First load: ?to=<person> opens or starts a chat, ?thread=<id> opens one
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const to = params.get('to'), thread = params.get('thread');
    loadThreads().then(list => {
      if (to) openWith(to);
      else if (thread && list.some(t => t.id === thread)) setActiveId(thread);
      else if (window.innerWidth >= 1024 && list[0]) setActiveId(list[0].id);
    }).catch(() => { setThreads([]); notify.error('Could not load your messages'); });
    if (role === 'teacher') api.get('/portals/teacher/my-students').then(r => setStudents(r.data.students ?? [])).catch(() => setStudents([]));
  }, [loadThreads, openWith, role]);

  // Live delivery: new messages, read receipts and typing
  useEffect(() => {
    const token = Cookies.get('cpa_token');
    if (!token) return;
    const socket = io(`${SOCKET_ORIGIN}/messages`, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: true });
    socketRef.current = socket;
    socket.on('message:new', ({ threadId, message }: { threadId: string; message: Message }) => {
      if (threadId === activeRef.current) {
        setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
        if (!message.isOwn && document.visibilityState === 'visible') api.post(`/messages/threads/${threadId}/read`).catch(() => {});
        setTyping(t => { const n = { ...t }; delete n[threadId]; return n; });
      }
      loadThreads().catch(() => {});
    });
    socket.on('thread:read', ({ threadId }: { threadId: string }) => {
      if (threadId === activeRef.current) setMessages(prev => prev.map(m => m.isOwn && !m.readAt && !m.pending ? { ...m, readAt: new Date().toISOString() } : m));
      setThreads(prev => prev?.map(t => t.id === threadId && t.lastMessage?.isOwn ? { ...t, lastMessage: { ...t.lastMessage, readAt: new Date().toISOString() } } : t) ?? prev);
    });
    socket.on('typing', ({ threadId, name }: { threadId: string; name: string }) => {
      setTyping(t => ({ ...t, [threadId]: { name, until: Date.now() + 4000 } }));
    });
    // A slow refresh in case the socket drops on a poor connection
    const backup = setInterval(() => { if (document.visibilityState === 'visible') loadThreads().catch(() => {}); }, 30_000);
    return () => { socket.disconnect(); socketRef.current = null; clearInterval(backup); };
  }, [loadThreads]);

  // Typing indicators expire
  useEffect(() => {
    const t = setInterval(() => setTyping(prev => {
      const now = Date.now();
      const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > now));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    setMsgLoading(true);
    try {
      const r = await api.get(`/messages/threads/${threadId}`);
      const rows = (r.data as Message[]).reverse();
      setMessages(rows); setHasMore(rows.length === 40);
      setThreads(prev => prev?.map(t => t.id === threadId ? { ...t, unread: 0 } : t) ?? prev);
    } catch { notify.error('Could not open this conversation'); } finally { setMsgLoading(false); }
  }, []);

  async function loadOlder() {
    if (!activeId || !messages.length) return;
    const el = scrollRef.current; const before = el?.scrollHeight ?? 0;
    const r = await api.get(`/messages/threads/${activeId}`, { params: { cursor: messages.find(m => !m.pending)?.createdAt } });
    const rows = (r.data as Message[]).reverse();
    setMessages(prev => [...rows, ...prev]); setHasMore(rows.length === 40);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  }

  useEffect(() => {
    setMessages([]); setFile(null); setDraft('');
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Stay at the bottom as messages arrive, unless reading older ones
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, atBottom]);

  function onScroll() {
    const el = scrollRef.current; if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) { notify.error('Send photos (JPG, PNG, WebP), PDFs or Word documents'); return; }
    if (f.size > MAX_BYTES * 3) { notify.error('That file is too big (up to 10 MB)'); return; }
    setFile({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    inputRef.current?.focus();
  }

  function onType(v: string) {
    setDraft(v);
    if (activeId && v && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      socketRef.current?.emit('typing', { threadId: activeId });
    }
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !file) || !activeId) return;
    const threadId = activeId;
    const tempId = `tmp-${Date.now()}`;
    const picked = file;
    const optimistic: Message = {
      id: tempId, body, senderId: 'me', senderName: 'You', senderRole: '', createdAt: new Date().toISOString(), isOwn: true, readAt: null,
      attachmentUrl: null, attachmentName: picked?.file.name ?? null, attachmentType: picked?.file.type ?? null, attachmentSize: picked?.file.size ?? null,
      pending: 'sending', localPreview: picked?.preview ?? undefined,
    };
    setMessages(prev => [...prev, optimistic]); setDraft(''); setFile(null); setAtBottom(true);
    try {
      let attachment = null;
      if (picked) {
        const ready = await shrinkPhoto(picked.file);
        if (ready.size > MAX_BYTES) throw new Error('That file is too big (up to 10 MB)');
        const fd = new FormData(); fd.append('file', ready);
        const up = await api.post('/files/upload?folder=messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        attachment = { key: up.data.key, name: ready.name, type: ready.type, size: ready.size };
      }
      const r = await api.post(`/messages/threads/${threadId}`, { body, attachment });
      setMessages(prev => {
        const without = prev.filter(m => m.id !== r.data.id);
        return without.map(m => m.id === tempId ? { ...r.data, localPreview: picked?.preview ?? undefined } : m);
      });
      loadThreads().catch(() => {});
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: 'failed' } : m));
      notify.error(e?.response?.data?.message ?? e?.message ?? 'Message not sent');
      if (body) setDraft(body);
    }
  }

  const active = threads?.find(t => t.id === activeId) ?? null;
  const isGroup = active?.kind === 'group';
  const unreadTotal = (threads ?? []).filter(t => t.unread > 0).length;
  const shown = useMemo(() => (threads ?? []).filter(t => (filter === 'all' || (filter === 'unread' ? t.unread > 0 : t.kind === 'group'))
    && (!q.trim() || `${t.other.name} ${t.lastMessage?.body ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [threads, filter, q]);
  const facts = role === 'teacher' && active && !isGroup ? students?.find(s => s.id === active.other.id) ?? null : null;
  const typingNow = activeId ? typing[activeId] : undefined;

  const status = !active ? '' : typingNow ? `${isGroup ? `${typingNow.name} is ` : ''}typing…` : isGroup ? active.other.context : active.other.online ? 'online' : lastSeen(active.other.lastSeen) || active.other.context;

  // Day chips, and runs of messages from the same person (tail on the first only)
  const rows: ({ kind: 'day'; label: string } | { kind: 'msg'; m: Message; first: boolean; last: boolean })[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1], next = messages[i + 1];
    const label = dayLabel(m.createdAt);
    if (!prev || dayLabel(prev.createdAt) !== label) rows.push({ kind: 'day', label });
    const sameAsPrev = !!prev && prev.senderId === m.senderId && prev.isOwn === m.isOwn && dayLabel(prev.createdAt) === label && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000;
    const sameAsNext = !!next && next.senderId === m.senderId && next.isOwn === m.isOwn && dayLabel(next.createdAt) === label && +new Date(next.createdAt) - +new Date(m.createdAt) < 5 * 60_000;
    rows.push({ kind: 'msg', m, first: !sameAsPrev, last: !sameAsNext });
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Messages" subtitle={SUB[role]} backHref={role === 'admin' ? backHref : undefined}
        actions={<Button size="sm" onClick={() => setPicking(true)}>New message</Button>} />
      <div className="flex h-[calc(100vh-64px)] min-h-[520px] flex-1 items-stretch overflow-hidden">
        {/* ── Chat list ── */}
        <section className={clsx('flex w-full min-w-0 flex-col border-r border-line bg-white lg:w-[340px] lg:shrink-0', active && 'max-lg:hidden')}>
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search or start a new chat" aria-label="Search chats"
              className="h-9 rounded-full border border-line bg-subtle px-4 text-[13px] text-navy outline-none focus:border-azure focus:bg-white" />
            <div className="flex gap-1.5 text-[12.5px]">
              {([['all', 'All'], ['unread', `Unread${unreadTotal ? ` ${unreadTotal}` : ''}`], ['groups', 'Groups']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
                  className={clsx('rounded-full px-3 py-1 font-medium', filter === k ? 'bg-accent-soft font-semibold text-navy' : 'bg-subtle text-ink2 hover:text-navy')}>{l}</button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!threads ? <div className="m-3 h-40 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
              <div className="px-4 py-10 text-center text-[13px] text-ink2">
                {threads.length ? 'No chats match.' : <>No messages yet. <button onClick={() => setPicking(true)} className="font-semibold text-azure-strong">Start one</button></>}
              </div>
            ) : shown.map(t => {
              const lm = t.lastMessage;
              const tt = typing[t.id];
              return (
                <button key={t.id} onClick={() => setActiveId(t.id)}
                  className={clsx('flex w-full items-center gap-3 px-3.5 py-2.5 text-left', t.id === activeId ? 'bg-accent-soft' : 'hover:bg-subtle')}>
                  <span className="relative">
                    <Avatar p={t.other} size={46} group={t.kind === 'group'} />
                    {t.other.online && <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-label="Online" />}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-line pb-2.5 pt-0.5">
                    <p className="flex items-baseline justify-between gap-2">
                      <strong className="truncate text-[14.5px] text-navy">{t.other.name}</strong>
                      {lm && <span className={clsx('shrink-0 text-[11.5px]', t.unread ? 'font-semibold text-azure-strong' : 'text-muted')}>{shortTime(lm.createdAt)}</span>}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5">
                      <span className={clsx('flex min-w-0 flex-1 items-center gap-1 truncate text-[13px]', tt ? 'font-medium text-azure-strong' : t.unread ? 'font-[650] text-navy' : 'text-muted')}>
                        {tt ? `${t.kind === 'group' ? `${tt.name} is ` : ''}typing…` : lm ? <>
                          {lm.isOwn && t.kind === 'direct' && <Ticks m={{ readAt: lm.readAt }} group={false} />}
                          <span className="truncate">{lm.sender && t.kind === 'group' ? `${lm.sender}: ` : ''}{lm.body}</span>
                        </> : <span className="truncate">{t.other.context}</span>}
                      </span>
                      {t.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-azure-strong px-1.5 text-[11px] font-bold text-on-accent" aria-label={`${t.unread} unread`}>{t.unread}</span>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Conversation ── */}
        <section className={clsx('relative flex min-w-0 flex-1 flex-col', !active && 'max-lg:hidden')}
          onDragOver={e => { if (active && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}>
          {!active ? (
            <div className="grid flex-1 place-items-center bg-subtle p-8 text-center">
              <div className="max-w-xs"><p className="text-[17px] font-bold text-navy">CareerPath messages</p><p className="mt-1.5 text-[13px] text-ink2">Pick a chat on the left, or start a new one with a teacher, a classmate or support. You can send photos and documents.</p></div>
            </div>
          ) : <>
            <header className="flex items-center gap-3 border-b border-line bg-white px-3 py-2.5 lg:px-5">
              <button onClick={() => setActiveId(null)} className="text-navy lg:hidden" aria-label="Back to chats">{Icon.back}</button>
              <Avatar p={active.other} size={40} group={isGroup} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-navy">{active.other.name}</p>
                <p className={clsx('truncate text-[12.5px]', typingNow || active.other.online ? 'text-azure-strong' : 'text-muted')}>{status}</p>
              </div>
              {role === 'student' && active.other.role === 'TEACHER' && <Link href={`/student/teachers/${active.other.id}`} className="text-[13px] font-semibold text-azure-strong hover:underline">View profile</Link>}
              {role === 'teacher' && facts && <Link href="/teacher/students" className="text-[13px] font-semibold text-azure-strong hover:underline">View student</Link>}
            </header>

            <div ref={scrollRef} onScroll={onScroll} className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-[7%]" aria-live="polite">
              {hasMore && <div className="mb-3 text-center"><button onClick={loadOlder} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-azure-strong shadow-sm">Load earlier messages</button></div>}
              {msgLoading && !messages.length ? <div className="mx-auto mt-8 h-24 w-2/3 rounded-lg bg-white/70 animate-pulse" /> : !messages.length ? (
                <p className="mx-auto mt-10 w-fit rounded-lg bg-white/90 px-4 py-2 text-center text-[12.5px] text-ink2 shadow-sm">{isGroup ? `This is the ${active.other.name} group. Everyone in the cohort and your teacher can see what's posted here.` : `Say hello to ${active.other.name.split(' ')[0]}.`}</p>
              ) : rows.map((r, i) => r.kind === 'day' ? (
                <p key={`d${i}`} className="sticky top-0 z-10 mx-auto my-2.5 w-fit rounded-md bg-white/95 px-2.5 py-1 text-[11.5px] font-medium text-ink2 shadow-sm">{r.label}</p>
              ) : (
                <Bubble key={r.m.id} m={r.m} first={r.first} last={r.last} group={isGroup} onOpen={() => setViewer(r.m)}
                  onRetry={() => { setMessages(prev => prev.filter(x => x.id !== r.m.id)); setDraft(r.m.body); inputRef.current?.focus(); }} />
              ))}
              {typingNow && (
                <div className="mt-1 flex w-fit items-center gap-2 rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-sm">
                  {isGroup && <span className="text-xs font-semibold text-azure-strong">{typingNow.name}</span>}
                  <span className="flex gap-1" aria-label="typing">{[0, 1, 2].map(k => <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${k * 150}ms` }} />)}</span>
                </div>
              )}
            </div>
            {!atBottom && (
              <button onClick={() => { setAtBottom(true); const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }}
                className="absolute bottom-[86px] right-5 grid h-10 w-10 place-items-center rounded-full bg-white text-ink2 shadow-md" aria-label="Go to latest">{Icon.down}</button>
            )}
            {dragging && <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-accent-soft/90 text-[15px] font-semibold text-navy">Drop to send</div>}

            {file && (
              <div className="flex items-center gap-3 border-t border-line bg-white px-4 py-2.5">
                {file.preview ? <img src={file.preview} alt="" className="h-14 w-14 rounded-md object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-md bg-subtle text-azure-strong">{Icon.file}</span>}
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-navy">{file.file.name}</p><p className="text-xs text-muted">{fileSize(file.file.size)}{file.preview ? ' · add a caption below' : ''}</p></div>
                <button onClick={() => setFile(null)} className="text-muted hover:text-navy" aria-label="Remove file">{Icon.close}</button>
              </div>
            )}
            <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-line bg-subtle px-3 py-2.5 lg:px-4">
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink2 hover:bg-white hover:text-navy" aria-label="Attach a photo or file">{Icon.clip}</button>
              <textarea ref={inputRef} value={draft} onChange={e => onType(e.target.value)} rows={1} maxLength={4000} aria-label="Message"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                onPaste={e => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); pickFile(f); } }}
                placeholder={file ? 'Add a caption' : 'Type a message'}
                className="max-h-36 min-h-[44px] flex-1 resize-none rounded-[22px] border border-line bg-white px-4 py-[11px] text-[14px] leading-5 text-navy outline-none focus:border-azure" />
              <button type="submit" disabled={!draft.trim() && !file} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure-strong text-on-accent disabled:opacity-40" aria-label="Send">{Icon.send}</button>
            </form>
          </>}
        </section>

        {role === 'teacher' && facts && (
          <aside className="hidden w-[260px] shrink-0 flex-col gap-2.5 border-l border-line bg-white p-[18px] xl:flex">
            <h3 className="text-[15px] font-semibold text-navy">About {facts.name.split(' ')[0]}</h3>
            {[
              ['Cohort', facts.cohort.name], ['Progress', `${facts.progress}%`],
              ['Last active', facts.lastActive ? shortTime(facts.lastActive) : 'not yet'],
              ['Classes attended', `${facts.attended} of ${facts.held}`], ['Assignments', `${facts.submitted} of ${facts.assignments} in`],
              ['Flags', facts.flag ? facts.flagReason ?? facts.flag : 'none'],
            ].map(([l, v]) => <p key={l} className="flex justify-between gap-3 text-[13px]"><span className="shrink-0 text-ink2">{l}</span><strong className="truncate text-right text-navy" title={v}>{v}</strong></p>)}
            <Link href="/teacher/students" className="mt-1 text-[13px] font-semibold text-azure-strong hover:underline">Open in My students</Link>
          </aside>
        )}
      </div>

      {picking && <NewChatDialog onClose={() => setPicking(false)} onPick={id => { setPicking(false); openWith(id); }} />}
      {viewer && <PhotoViewer m={viewer} onClose={() => setViewer(null)} />}
      <style>{`.chat-wallpaper{background-color:var(--color-subtle,#F4F6FB);background-image:radial-gradient(rgba(63,111,232,.07) 1px,transparent 1px);background-size:18px 18px}`}</style>
    </div>
  );
}

function Bubble({ m, first, last, group, onOpen, onRetry }: { m: Message; first: boolean; last: boolean; group: boolean; onOpen: () => void; onRetry: () => void }) {
  const own = m.isOwn;
  const isImage = !!m.attachmentType?.startsWith('image/');
  const src = m.attachmentUrl ?? m.localPreview ?? null;
  const meta = (
    <span className={clsx('ml-2 inline-flex translate-y-1 items-center gap-1 whitespace-nowrap text-[10.5px]', own ? 'text-white/80' : 'text-muted')}>
      {time(m.createdAt)}{own && <Ticks m={m} group={group} light />}
    </span>
  );
  return (
    <div className={clsx('flex', own ? 'justify-end' : 'justify-start', first ? 'mt-2' : 'mt-0.5')}>
      <div className={clsx('relative max-w-[78%] rounded-lg px-2 pb-1.5 pt-1.5 text-[14px] leading-[1.4] shadow-sm sm:max-w-[65%]',
        own ? 'bg-azure-strong text-on-accent' : 'bg-white text-navy',
        first && (own ? 'rounded-tr-none' : 'rounded-tl-none'))}>
        {/* Tail on the first bubble of a run */}
        {first && <span aria-hidden className={clsx('absolute top-0 h-3 w-2.5', own ? '-right-2 bg-azure-strong [clip-path:polygon(0_0,100%_0,0_100%)]' : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)]')} />}
        {group && !own && first && <p className="px-1 pb-0.5 text-[12.5px] font-semibold" style={{ color: colourFor(m.senderId) }}>{m.senderName}{m.senderRole === 'TEACHER' ? ' · Teacher' : ''}</p>}
        {m.attachmentType && (isImage ? (
          <button type="button" onClick={onOpen} disabled={!src} className="mb-1 block overflow-hidden rounded-md">
            {src ? <img src={src} alt={m.attachmentName ?? 'Photo'} className="max-h-[320px] w-full min-w-[180px] max-w-[300px] object-cover" loading="lazy" />
              : <span className="grid h-40 w-60 place-items-center bg-black/10 text-xs">Photo</span>}
          </button>
        ) : (
          <a href={m.attachmentUrl ?? undefined} target="_blank" rel="noreferrer" onClick={e => { if (!m.attachmentUrl) e.preventDefault(); }}
            className={clsx('mb-1 flex min-w-[220px] items-center gap-2.5 rounded-md px-2.5 py-2', own ? 'bg-white/15' : 'bg-subtle')}>
            <span className={own ? 'text-white' : 'text-azure-strong'}>{Icon.file}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{m.attachmentName}</span><span className={clsx('block text-[11.5px]', own ? 'text-white/75' : 'text-muted')}>{m.attachmentSize ? fileSize(m.attachmentSize) : ''} · {m.attachmentName?.split('.').pop()?.toUpperCase()}</span></span>
          </a>
        ))}
        {m.body ? (
          <p className="whitespace-pre-wrap break-words px-1">{m.body}{meta}</p>
        ) : <p className="flex justify-end px-1">{meta}</p>}
        {m.pending === 'failed' && <button onClick={onRetry} className="mt-1 block px-1 text-[12px] font-semibold underline">Not sent — tap to try again</button>}
      </div>
    </div>
  );
}

function PhotoViewer({ m, onClose }: { m: Message; onClose: () => void }) {
  const src = m.attachmentUrl ?? m.localPreview;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold">{m.isOwn ? 'You' : m.senderName}</p><p className="text-xs text-white/70">{dayLabel(m.createdAt)} at {time(m.createdAt)}</p></div>
        {m.attachmentUrl && <a href={m.attachmentUrl} download={m.attachmentName ?? 'photo'} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-[13px] font-semibold hover:bg-white/10">Download</a>}
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close">{Icon.close}</button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-4">{src && <img src={src} alt={m.attachmentName ?? 'Photo'} className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />}</div>
      {m.body && <p className="px-6 pb-6 text-center text-[14px] text-white" onClick={e => e.stopPropagation()}>{m.body}</p>}
    </div>
  );
}

function NewChatDialog({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api.get('/messages/contacts', { params: { q: q || undefined } }).then(r => setPeople(r.data)).catch(() => setPeople([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="New chat" description="Who do you want to write to?">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name" autoFocus aria-label="Search people" className="input-base mb-3 w-full" />
        <div className="flex max-h-[50vh] flex-col overflow-y-auto">
          {!people ? <div className="h-32 rounded bg-subtle animate-pulse" /> : !people.length ? <p className="py-6 text-center text-[13px] text-ink2">No one found.</p> : people.map(p => (
            <button key={p.id} onClick={() => onPick(p.id)} className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle">
              <Avatar p={p} size={40} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-navy">{p.name}</span><span className="block truncate text-xs text-muted">{p.context}</span></span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
