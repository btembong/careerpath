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
import { useVoiceRecorder, MicButton, VoiceBar, VoicePlayer, VoiceClip } from './Voice';
import { EmojiPicker } from './EmojiPicker';
import { GroupInfoPanel, NewGroupDialog, GroupAvatar, GroupInfo } from './GroupPanel';
import { MentionText, ReplyQuote, ReactionChips, MessageMenu, MessageInfoDialog, RecordDialog, ChatSearch, StarredList, MentionSuggest, quoteText, EDIT_MINS, DELETE_MINS, ReplyRef, Reaction, MenuActions } from './ChatExtras';

type Role = 'student' | 'teacher' | 'admin' | 'rep' | 'reviewer';
interface Person { id: string; name: string; avatarUrl: string | null; role: string; context: string; online?: boolean; lastSeen?: string | null }
interface ThreadSummary {
  id: string; kind: 'direct' | 'group'; other: Person;
  lastMessage: { body: string; createdAt: string; isOwn: boolean; sender: string | null; readAt: string | null } | null;
  unread: number; lastMessageAt: string;
  /** Groups: whether I muted it, and whether it's a cohort's group */
  muted?: boolean; cohortGroup?: boolean;
}
interface Message {
  id: string; body: string; senderId: string; senderName: string; senderRole: string; createdAt: string; isOwn: boolean; readAt: string | null;
  /** TEXT, or SYSTEM for notes like "Kofi added Ama" */
  kind?: string;
  replyTo?: ReplyRef | null; mentions?: string[]; mentionsAll?: boolean; editedAt?: string | null;
  /** Deleted for everyone: shown as deleted (the content is kept for the record) */
  deleted?: boolean; reactions?: Reaction[]; starred?: boolean; senderAvatarUrl?: string | null;
  attachmentUrl: string | null; attachmentName: string | null; attachmentType: string | null; attachmentSize: number | null;
  /** Voice notes: seconds, and the waveform's bar heights */
  attachmentDuration?: number | null; attachmentWave?: string | null;
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
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'starred'>('all');
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [students, setStudents] = useState<StudentFacts[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [tagged, setTagged] = useState<{ id: string; name: string }[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [card, setCard] = useState<{ id: string; name: string; avatarUrl: string | null; role: string } | null>(null);
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
      else if (thread && list.some(t => t.id === thread)) { setActiveId(thread); const m = params.get('message'); if (m) setPendingJump(m); }
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
    socket.on('message:updated', ({ threadId, message }: { threadId: string; message: Message }) => {
      if (threadId === activeRef.current) setMessages(prev => prev.map(m => m.id === message.id ? { ...message, localPreview: m.localPreview } : m));
      loadThreads().catch(() => {});
    });
    socket.on('thread:updated', ({ threadId, removed }: { threadId: string; removed?: boolean }) => {
      if (threadId === activeRef.current) {
        if (removed) { setActiveId(null); notify.info('You were removed from that group'); }
        else api.get(`/messages/threads/${threadId}/info`).then(r => setGroup(r.data)).catch(() => {});
      }
      loadThreads().catch(() => {});
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
    setMessages([]); setFile(null); setDraft(''); setInfoOpen(false); setGroup(null); setReplyTo(null); setEditing(null); setSearching(false); setTagged([]); setMenuFor(null);
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);
  const activeKind = threads?.find(t => t.id === activeId)?.kind;
  const loadGroup = useCallback(() => {
    if (activeId && activeKind === 'group') api.get(`/messages/threads/${activeId}/info`).then(r => setGroup(r.data)).catch(() => setGroup(null));
  }, [activeId, activeKind]);
  useEffect(() => { loadGroup(); }, [loadGroup]);

  const jumpTo = useCallback(async (id: string) => {
    setAtBottom(false);
    const show = () => { const el = document.getElementById(`msg-${id}`); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setHighlight(id); setTimeout(() => setHighlight(h => (h === id ? null : h)), 2200); return true; };
    if (show() || !activeRef.current) return;
    try {
      const r = await api.get(`/messages/threads/${activeRef.current}`, { params: { around: id } });
      setMessages((r.data as Message[]).reverse()); setHasMore(true);
      requestAnimationFrame(() => requestAnimationFrame(() => show()));
    } catch { notify.error('Could not find that message'); }
  }, []);
  useEffect(() => { if (pendingJump && !msgLoading && messages.length) { const id = pendingJump; setPendingJump(null); jumpTo(id); } }, [pendingJump, msgLoading, messages.length, jumpTo]);

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
    if (editing) {
      const target = editing;
      if (!body) return;
      setEditing(null); setDraft('');
      try { await api.patch(`/messages/items/${target.id}`, { body }); setMessages(prev => prev.map(m => m.id === target.id ? { ...m, body, editedAt: new Date().toISOString() } : m)); }
      catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not edit'); setDraft(body); setEditing(target); }
      return;
    }
    if ((!body && !file) || !activeId) return;
    const reply = replyTo;
    const tags = tagged.filter(t => body.includes(`@${t.name}`)).map(t => t.id);
    const everyone = isGroup && !!group?.me.admin && /(^|\s)@everyone\b/.test(body);
    setReplyTo(null); setTagged([]);
    const threadId = activeId;
    const tempId = `tmp-${Date.now()}`;
    const picked = file;
    const optimistic: Message = {
      id: tempId, body, senderId: 'me', senderName: 'You', senderRole: '', createdAt: new Date().toISOString(), isOwn: true, readAt: null,
      attachmentUrl: null, attachmentName: picked?.file.name ?? null, attachmentType: picked?.file.type ?? null, attachmentSize: picked?.file.size ?? null,
      pending: 'sending', localPreview: picked?.preview ?? undefined,
      replyTo: reply ? { id: reply.id, senderName: reply.isOwn ? 'You' : reply.senderName, body: reply.body, deleted: false, attachmentType: reply.attachmentType, attachmentName: reply.attachmentName, attachmentDuration: reply.attachmentDuration ?? null } : null,
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
      const r = await api.post(`/messages/threads/${threadId}`, { body, attachment, replyToId: reply?.id ?? null, mentions: tags, mentionAll: everyone });
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

  const voice = useVoiceRecorder(clip => { sendVoice(clip); });
  // Switching chats throws away a recording in progress
  useEffect(() => { voice.cancel(); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendVoice(clip: VoiceClip) {
    if (!activeId) return;
    const threadId = activeId;
    const tempId = `tmp-${Date.now()}`;
    const type = clip.type.split(';')[0];
    const optimistic: Message = {
      id: tempId, body: '', senderId: 'me', senderName: 'You', senderRole: '', createdAt: new Date().toISOString(), isOwn: true, readAt: null,
      attachmentUrl: null, attachmentName: `voice-note.${clip.ext}`, attachmentType: type, attachmentSize: clip.blob.size,
      attachmentDuration: clip.duration, attachmentWave: clip.wave, pending: 'sending', localPreview: clip.url,
    };
    setMessages(prev => [...prev, optimistic]); setAtBottom(true);
    try {
      if (clip.blob.size > MAX_BYTES) throw new Error('That voice note is too big to send');
      const fd = new FormData(); fd.append('file', new File([clip.blob], `voice-note.${clip.ext}`, { type: clip.type }));
      const up = await api.post('/files/upload?folder=messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const r = await api.post(`/messages/threads/${threadId}`, { body: '', attachment: { key: up.data.key, name: `voice-note.${clip.ext}`, type, size: clip.blob.size, duration: clip.duration, wave: clip.wave } });
      setMessages(prev => prev.filter(m => m.id !== r.data.id).map(m => m.id === tempId ? { ...r.data, localPreview: clip.url } : m));
      loadThreads().catch(() => {});
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: 'failed' } : m));
      notify.error(e?.response?.data?.message ?? e?.message ?? 'Voice note not sent');
    }
  }

  const active = threads?.find(t => t.id === activeId) ?? null;
  const isGroup = active?.kind === 'group';
  const unreadTotal = (threads ?? []).filter(t => t.unread > 0).length;
  const shown = useMemo(() => (threads ?? []).filter(t => (filter === 'all' || (filter === 'unread' ? t.unread > 0 : t.kind === 'group'))
    && (!q.trim() || `${t.other.name} ${t.lastMessage?.body ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [threads, filter, q]);
  const facts = role === 'teacher' && active && !isGroup ? students?.find(s => s.id === active.other.id) ?? null : null;
  const typingNow = activeId ? typing[activeId] : undefined;

  const minsOld = (m: Message) => (Date.now() - +new Date(m.createdAt)) / 60_000;
  function actionsFor(m: Message): MenuActions {
    const live = !m.pending && !m.deleted && m.kind !== 'SYSTEM';
    const groupAdmin = isGroup && !!group?.me.admin;
    return {
      reply: live ? () => { setEditing(null); setReplyTo(m); inputRef.current?.focus(); } : undefined,
      react: live ? e => react(m, e) : undefined,
      star: live ? () => api.post(`/messages/items/${m.id}/star`, { starred: !m.starred }).then(() => { setMessages(prev => prev.map(x => x.id === m.id ? { ...x, starred: !m.starred } : x)); notify.success(m.starred ? 'Unstarred' : 'Starred'); }).catch(() => notify.error('Could not star it')) : undefined,
      starred: m.starred,
      copy: live && m.body ? () => navigator.clipboard?.writeText(m.body).then(() => notify.success('Copied')).catch(() => {}) : undefined,
      edit: live && m.isOwn && !!m.body && minsOld(m) < EDIT_MINS ? () => { setReplyTo(null); setEditing(m); setDraft(m.body); inputRef.current?.focus(); } : undefined,
      pin: live && groupAdmin ? () => api.patch(`/messages/threads/${activeId}/info`, { pinnedMessageId: m.id }).then(r => { setGroup(r.data); notify.success('Pinned'); }).catch(e => notify.error(e?.response?.data?.message ?? 'Could not pin')) : undefined,
      info: !m.pending && m.isOwn && m.kind !== 'SYSTEM' ? () => setInfoFor(m.id) : undefined,
      record: role === 'admin' && !m.pending && (m.deleted || !!m.editedAt) ? () => setRecordFor(m.id) : undefined,
      remove: live && ((m.isOwn && minsOld(m) < DELETE_MINS) || groupAdmin) ? () => {
        if (!window.confirm('Delete this message for everyone? It will show as deleted. A record is kept.')) return;
        api.delete(`/messages/items/${m.id}`).then(() => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deleted: true, body: '', attachmentType: null, attachmentUrl: null, attachmentName: null, reactions: [] } : x))).catch(e => notify.error(e?.response?.data?.message ?? 'Could not delete'));
      } : undefined,
    };
  }
  async function react(m: Message, emoji: string) {
    try { await api.post(`/messages/items/${m.id}/react`, { emoji }); } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not react'); }
  }
  // Tagging: what follows the last @ before the cursor (names can have spaces: "@Ama K" narrows to Ama Kusi)
  const TAG_AT = /(?:^|\s)@([^@\n]{0,30})$/;
  const tagQuery = isGroup && group && !editing ? TAG_AT.exec(draft.slice(0, caret))?.[1] : undefined;
  const tq = (tagQuery ?? '').toLowerCase();
  const nameMatches = (name: string) => name.toLowerCase().startsWith(tq) || (!tq.includes(' ') && name.toLowerCase().split(/\s+/).some(w => w.startsWith(tq)));
  const tagItems = tagQuery === undefined || !group || tagQuery.endsWith('  ') ? [] : [
    ...(group.me.admin && 'everyone'.startsWith(tq) ? [{ id: 'everyone', name: 'everyone', sub: `Tags all ${group.members.length} members` }] : []),
    ...group.members.filter(p => !p.isMe && nameMatches(p.name)).map(p => ({ id: p.id, name: p.name, sub: p.groupRole === 'ADMIN' ? 'Group admin' : p.role === 'TEACHER' ? 'Teacher' : 'Member' })),
  ];
  function pickTag(i: { id: string; name: string }) {
    const before = draft.slice(0, caret).replace(/@([^@\n]{0,30})$/, `@${i.name} `);
    const next = before + draft.slice(caret);
    setDraft(next); setCaret(before.length);
    if (i.id !== 'everyone') setTagged(t => t.some(x => x.id === i.id) ? t : [...t, i]);
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(before.length, before.length); } });
  }
  const memberNames = group?.members.map(p => p.name) ?? [];

  const status = !active ? '' : typingNow ? `${isGroup ? `${typingNow.name} is ` : ''}typing…` : isGroup ? active.other.context : active.other.online ? 'online' : lastSeen(active.other.lastSeen) || active.other.context;

  // Day chips, and runs of messages from the same person (tail on the first only)
  const rows: ({ kind: 'day'; label: string } | { kind: 'msg'; m: Message; first: boolean; last: boolean })[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1], next = messages[i + 1];
    const label = dayLabel(m.createdAt);
    if (!prev || dayLabel(prev.createdAt) !== label) rows.push({ kind: 'day', label });
    const sameAsPrev = !!prev && prev.kind !== 'SYSTEM' && prev.senderId === m.senderId && prev.isOwn === m.isOwn && dayLabel(prev.createdAt) === label && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000;
    const sameAsNext = !!next && next.kind !== 'SYSTEM' && next.senderId === m.senderId && next.isOwn === m.isOwn && dayLabel(next.createdAt) === label && +new Date(next.createdAt) - +new Date(m.createdAt) < 5 * 60_000;
    rows.push({ kind: 'msg', m, first: !sameAsPrev, last: !sameAsNext });
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Messages" subtitle={SUB[role]} backHref={role === 'admin' ? backHref : undefined}
        actions={<div className="flex gap-2">
          {(role === 'teacher' || role === 'admin') && <Button size="sm" variant="secondary" onClick={() => setNewGroup(true)} aria-label="New group"><span className="sm:hidden">Group</span><span className="max-sm:hidden">New group</span></Button>}
          <Button size="sm" onClick={() => setPicking(true)} aria-label="New message"><span className="sm:hidden">New</span><span className="max-sm:hidden">New message</span></Button>
        </div>} />
      <div className="flex h-[calc(100vh-64px)] min-h-[520px] flex-1 items-stretch overflow-hidden">
        {/* ── Chat list ── */}
        <section className={clsx('flex w-full min-w-0 flex-col border-r border-line bg-white lg:w-[340px] lg:shrink-0', active && 'max-lg:hidden')}>
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search or start a new chat" aria-label="Search chats"
              className="h-9 rounded-full border border-line bg-subtle px-4 text-[13px] text-navy outline-none focus:border-azure focus:bg-white" />
            <div className="flex gap-1.5 text-[12.5px]">
              {([['all', 'All'], ['unread', `Unread${unreadTotal ? ` ${unreadTotal}` : ''}`], ['groups', 'Groups'], ['starred', 'Starred']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
                  className={clsx('rounded-full px-3 py-1 font-medium', filter === k ? 'bg-accent-soft font-semibold text-navy' : 'bg-subtle text-ink2 hover:text-navy')}>{l}</button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filter === 'starred' ? <StarredList onOpen={st => { setFilter('all'); if (st.threadId === activeId) jumpTo(st.id); else { setActiveId(st.threadId); setPendingJump(st.id); } }} /> : !threads ? <div className="m-3 h-40 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
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
                    {t.kind === 'group' ? <GroupAvatar name={t.other.name} photoUrl={t.other.avatarUrl} size={46} /> : <Avatar p={t.other} size={46} />}
                    {t.other.online && <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-label="Online" />}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-line pb-2.5 pt-0.5">
                    <p className="flex items-baseline justify-between gap-2">
                      <strong className="flex min-w-0 items-center gap-1 truncate text-[14.5px] text-navy"><span className="truncate">{t.other.name}</span>{t.muted && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted" aria-label="Muted"><path d="M6 16V11a6 6 0 0 1 9-5.2M18 11v5l2 2H8M10 21h4M3 3l18 18" /></svg>}</strong>
                      {lm && <span className={clsx('shrink-0 text-[11.5px]', t.unread ? 'font-semibold text-azure-strong' : 'text-muted')}>{shortTime(lm.createdAt)}</span>}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5">
                      <span className={clsx('flex min-w-0 flex-1 items-center gap-1 truncate text-[13px]', tt ? 'font-medium text-azure-strong' : t.unread ? 'font-[650] text-navy' : 'text-muted')}>
                        {tt ? `${t.kind === 'group' ? `${tt.name} is ` : ''}typing…` : lm ? <>
                          {lm.isOwn && t.kind === 'direct' && <Ticks m={{ readAt: lm.readAt }} group={false} />}
                          <span className="truncate">{lm.sender && t.kind === 'group' ? `${lm.sender}: ` : ''}{lm.body.startsWith('🎤 ') ? <span className="inline-flex items-center gap-1 align-middle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>{lm.body.slice(3)}</span> : lm.body}</span>
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
              <div className="max-w-xs"><p className="text-[17px] font-bold text-navy">CareerPath messages</p><p className="mt-1.5 text-[13px] text-ink2">Pick a chat on the left, or start a new one with a teacher, a classmate or support. You can send photos, documents and voice notes.</p></div>
            </div>
          ) : <>
            <header className="flex items-center gap-3 border-b border-line bg-white px-3 py-2.5 lg:px-5">
              <button onClick={() => setActiveId(null)} className="text-navy lg:hidden" aria-label="Back to chats">{Icon.back}</button>
              {isGroup ? (
                <button onClick={() => setInfoOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Group info">
                  <GroupAvatar name={active.other.name} photoUrl={active.other.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-navy">{active.other.name}</span>
                    <span className={clsx('block truncate text-[12.5px]', typingNow ? 'text-azure-strong' : 'text-muted')}>{typingNow ? status : group ? `${group.members.slice(0, 4).map(m => m.isMe ? 'You' : m.name.split(' ')[0]).join(', ')}${group.members.length > 4 ? ` and ${group.members.length - 4} others` : ''} · tap for group info` : status}</span>
                  </span>
                </button>
              ) : <>
              <Avatar p={active.other} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-navy">{active.other.name}</p>
                <p className={clsx('truncate text-[12.5px]', typingNow || active.other.online ? 'text-azure-strong' : 'text-muted')}>{status}</p>
              </div>
              </>}
              <button onClick={() => setSearching(v => !v)} aria-label="Search in this chat" aria-pressed={searching} className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-md', searching ? 'bg-accent-soft text-azure-strong' : 'text-ink2 hover:bg-subtle')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
              </button>
              {role === 'student' && active.other.role === 'TEACHER' && <Link href={`/student/teachers/${active.other.id}`} className="text-[13px] font-semibold text-azure-strong hover:underline">View profile</Link>}
              {role === 'teacher' && facts && <Link href="/teacher/students" className="text-[13px] font-semibold text-azure-strong hover:underline">View student</Link>}
            </header>

            {searching && <ChatSearch threadId={active.id} onJump={jumpTo} onClose={() => setSearching(false)} />}
            {isGroup && group?.pinned && (
              <button onClick={() => jumpTo(group.pinned!.id)}
                className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-2 text-left text-[13px] lg:px-5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-azure-strong" aria-hidden><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" /></svg>
                <span className="min-w-0 flex-1 truncate text-ink2"><strong className="text-navy">Pinned</strong> · {group.pinned.text}</span>
              </button>
            )}
            <div ref={scrollRef} onScroll={onScroll} className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-[7%]" aria-live="polite">
              {hasMore && <div className="mb-3 text-center"><button onClick={loadOlder} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-azure-strong shadow-sm">Load earlier messages</button></div>}
              {msgLoading && !messages.length ? <div className="mx-auto mt-8 h-24 w-2/3 rounded-lg bg-white/70 animate-pulse" /> : !messages.length ? (
                <p className="mx-auto mt-10 w-fit rounded-lg bg-white/90 px-4 py-2 text-center text-[12.5px] text-ink2 shadow-sm">{isGroup ? `This is the ${active.other.name} group. Everyone in the cohort and your teacher can see what's posted here.` : `Say hello to ${active.other.name.split(' ')[0]}.`}</p>
              ) : rows.map((r, i) => r.kind === 'day' ? (
                <p key={`d${i}`} className="sticky top-0 z-10 mx-auto my-2.5 w-fit rounded-md bg-white/95 px-2.5 py-1 text-[11.5px] font-medium text-ink2 shadow-sm">{r.label}</p>
              ) : (
                <Bubble key={r.m.id} m={r.m} first={r.first} last={r.last} group={isGroup} onOpen={() => setViewer(r.m)}
                  onRetry={() => { setMessages(prev => prev.filter(x => x.id !== r.m.id)); setDraft(r.m.body); inputRef.current?.focus(); }}
                  names={memberNames} actions={actionsFor(r.m)} menuOpen={menuFor === r.m.id} onMenu={open => setMenuFor(open ? r.m.id : null)}
                  onReact={e => react(r.m, e)} onJump={jumpTo} highlight={highlight === r.m.id}
                  onPerson={() => setCard({ id: r.m.senderId, name: r.m.senderName, avatarUrl: r.m.senderAvatarUrl ?? null, role: r.m.senderRole })} />
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

            {isGroup && group?.settings.onlyAdminsSend && !group.me.admin ? (
              <p className="flex items-center justify-center gap-2 border-t border-line bg-subtle px-4 py-3.5 text-center text-[13.5px] text-muted">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z" /></svg>Only group admins can send messages
              </p>
            ) : voice.phase !== 'idle' ? <VoiceBar voice={voice} /> : <>
            {file && (
              <div className="flex items-center gap-3 border-t border-line bg-white px-4 py-2.5">
                {file.preview ? <img src={file.preview} alt="" className="h-14 w-14 rounded-md object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-md bg-subtle text-azure-strong">{Icon.file}</span>}
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-navy">{file.file.name}</p><p className="text-xs text-muted">{fileSize(file.file.size)}{file.preview ? ' · add a caption below' : ''}</p></div>
                <button onClick={() => setFile(null)} className="text-muted hover:text-navy" aria-label="Remove file">{Icon.close}</button>
              </div>
            )}
            {(replyTo || editing) && (
              <div className="flex items-center gap-3 border-t border-line bg-white px-4 py-2">
                <div className="min-w-0 flex-1 border-l-[3px] border-azure-strong pl-2.5 text-[12.5px]">
                  <p className="font-bold text-azure-strong">{editing ? 'Editing your message' : `Replying to ${replyTo!.isOwn ? 'yourself' : replyTo!.senderName}`}</p>
                  <p className="truncate text-ink2">{quoteText({ body: (editing ?? replyTo)!.body, deleted: false, attachmentType: (editing ?? replyTo)!.attachmentType, attachmentName: (editing ?? replyTo)!.attachmentName, attachmentDuration: (editing ?? replyTo)!.attachmentDuration ?? null })}</p>
                </div>
                <button onClick={() => { if (editing) setDraft(''); setReplyTo(null); setEditing(null); }} className="text-muted hover:text-navy" aria-label={editing ? 'Stop editing' : 'Cancel reply'}>{Icon.close}</button>
              </div>
            )}
            <form onSubmit={e => { e.preventDefault(); send(); }} className="relative flex items-end gap-2 border-t border-line bg-subtle px-3 py-2.5 lg:px-4">
              <MentionSuggest items={tagItems} onPick={pickTag} />
              {emojiOpen && <EmojiPicker className="absolute bottom-full left-2 mb-2" onClose={() => setEmojiOpen(false)} onPick={e => {
                const at = inputRef.current?.selectionStart ?? draft.length;
                const next = draft.slice(0, at) + e + draft.slice(at);
                setDraft(next); setCaret(at + e.length);
                requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(at + e.length, at + e.length); } });
              }} />}
              <button type="button" onClick={() => setEmojiOpen(o => !o)} aria-label="Emoji" aria-expanded={emojiOpen} className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white', emojiOpen ? 'text-azure-strong' : 'text-ink2 hover:text-navy')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" /></svg>
              </button>
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink2 hover:bg-white hover:text-navy" aria-label="Attach a photo or file">{Icon.clip}</button>
              <textarea ref={inputRef} value={draft} onChange={e => { onType(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }} rows={1} maxLength={4000} aria-label="Message"
                onSelect={e => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && tagItems.length) { e.preventDefault(); pickTag(tagItems[0]); return; }
                  if (e.key === 'Escape' && (replyTo || editing)) { if (editing) setDraft(''); setReplyTo(null); setEditing(null); return; }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                onPaste={e => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); pickFile(f); } }}
                placeholder={file ? 'Add a caption' : 'Type a message'}
                className="max-h-36 min-h-[44px] flex-1 resize-none rounded-[22px] border border-line bg-white px-4 py-[11px] text-[14px] leading-5 text-navy outline-none focus:border-azure" />
              {!draft.trim() && !file && !editing && voice.supported ? <MicButton voice={voice} />
                : <button type="submit" disabled={!draft.trim() && !file} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure-strong text-on-accent disabled:opacity-40" aria-label="Send">{Icon.send}</button>}
            </form>
            </>}
          </>}
        </section>

        {infoOpen && active && isGroup && (
          <div className="max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:flex">
            <GroupInfoPanel threadId={active.id} onClose={() => setInfoOpen(false)} onChanged={() => { loadGroup(); loadThreads().catch(() => {}); }}
              onMessage={id => { setInfoOpen(false); openWith(id); }} onLeft={() => { setInfoOpen(false); setActiveId(null); loadThreads().catch(() => {}); }} />
          </div>
        )}
        {!infoOpen && role === 'teacher' && facts && (
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

      {newGroup && <NewGroupDialog role={role} onClose={() => setNewGroup(false)} onCreated={async id => { setNewGroup(false); await loadThreads(); setActiveId(id); }} />}
      {picking && <NewChatDialog onClose={() => setPicking(false)} onPick={id => { setPicking(false); openWith(id); }} />}
      {viewer && <PhotoViewer m={viewer} onClose={() => setViewer(null)} />}
      {infoFor && <MessageInfoDialog id={infoFor} onClose={() => setInfoFor(null)} />}
      {card && <ContactCard person={card} groupRole={group?.members.find(p => p.id === card.id)?.groupRole} onClose={() => setCard(null)} onMessage={() => { setCard(null); openWith(card.id); }} />}
      {recordFor && <RecordDialog id={recordFor} onClose={() => setRecordFor(null)} />}
      {/* WhatsApp-style doodles behind the messages: faint study icons, drawn to suit light and dark mode */}
      <style>{`.chat-wallpaper{background-color:var(--color-subtle,#F4F6FB);background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%20viewBox%3D%220%200%20300%20300%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23072061%22%20stroke-opacity%3D%220.09%22%20stroke-width%3D%221.4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cg%20transform%3D%22translate(14%2018)%20rotate(-12%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M3%205.5A1.5%201.5%200%200%201%204.5%204H11v15H4.5A1.5%201.5%200%200%201%203%2017.5zM21%205.5A1.5%201.5%200%200%200%2019.5%204H13v15h6.5a1.5%201.5%200%200%200%201.5-1.5zM11%204h2v15h-2%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(78%2010)%20rotate(18%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M4%2020l1-4L16%205l3%203L8%2019zM14%207l3%203%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(140%2022)%20rotate(-6%2014%2014)%20scale(1.167)%22%3E%3Cpath%20d%3D%22M2%209l10-5%2010%205-10%205zM6%2011v5c3%202.5%209%202.5%2012%200v-5M22%209v6%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(210%2012)%20rotate(14%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M9%2018h6M10%2021h4M12%203a6%206%200%200%200-3.5%2010.9c.6.5%201%201.2%201%202.1h5c0-.9.4-1.6%201-2.1A6%206%200%200%200%2012%203z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(30%2082)%20rotate(8%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M12%2012m-1.5%200a1.5%201.5%200%201%200%203%200a1.5%201.5%200%201%200-3%200M12%203c4%200%204%2018%200%2018S8%203%2012%203zM4.2%207.5c2-3.5%2017.6%205.5%2015.6%209s-17.6-5.5-15.6-9zM4.2%2016.5c-2-3.5%2013.6-12.5%2015.6-9s-13.6%2012.5-15.6%209z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(104%2070)%20rotate(-10%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M6%203h12v18H6zM8.5%206h7v3h-7zM9%2012h.01M12%2012h.01M15%2012h.01M9%2015h.01M12%2015h.01M15%2015h.01M9%2018h.01M12%2018h3%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(168%2084)%20rotate(6%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M4%205h16v11H9l-5%204z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(232%2076)%20rotate(-14%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M12%2021a9%209%200%201%200%200-18%209%209%200%200%200%200%2018zM3%2012h18M12%203c3%203%203%2015%200%2018M12%203c-3%203-3%2015%200%2018%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(8%20146)%20rotate(20%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%203l2.8%205.7%206.2.9-4.5%204.4%201%206.2L12%2017.3%206.5%2020.2l1-6.2L3%209.6l6.2-.9z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(64%20134)%20rotate(-8%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%2020s-7-4.4-7-10a4%204%200%200%201%207-2.6A4%204%200%200%201%2019%2010c0%205.6-7%2010-7%2010z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(124%20138)%20rotate(30%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M3%2017L17%203l4%204L7%2021zM7%2013l2%202M10%2010l2%202M13%207l2%202%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(190%20144)%20rotate(-6%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M9%203h6M10%203v6l-5%209a2%202%200%200%200%201.8%203h10.4a2%202%200%200%200%201.8-3l-5-9V3M7.5%2015h9%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(250%20140)%20rotate(10%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M9%2018V5l11-2v13M9%2018a3%203%200%201%201-6%200%203%203%200%200%201%206%200zM20%2016a3%203%200%201%201-6%200%203%203%200%200%201%206%200z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(30%20206)%20rotate(-4%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M4%208h13v6a5%205%200%200%201-5%205H9a5%205%200%200%201-5-5zM17%2010h1.5a2.5%202.5%200%200%201%200%205H17M8%202v3M12%202v3%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(96%20196)%20rotate(12%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M8%203l4%206%204-6M12%2021a6%206%200%201%200%200-12%206%206%200%200%200%200%2012zM12%2013v4M10%2015h4%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(160%20206)%20rotate(-8%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M5%205h14v10H5zM2%2019h20%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(226%20204)%20rotate(6%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M4%207h16M8%207v11M15%207v9a2%202%200%200%200%203%201.7%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(60%20250)%20rotate(0%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%206v12M6%2012h12%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(196%20254)%20rotate(0%209%209)%20scale(0.750)%22%3E%3Cpath%20d%3D%22M6%2012h.01M12%2012h.01M18%2012h.01%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(270%2030)%20rotate(-20%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%203l2.8%205.7%206.2.9-4.5%204.4%201%206.2L12%2017.3%206.5%2020.2l1-6.2L3%209.6l6.2-.9z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(280%20260)%20rotate(14%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%2020s-7-4.4-7-10a4%204%200%200%201%207-2.6A4%204%200%200%201%2019%2010c0%205.6-7%2010-7%2010z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(120%20250)%20rotate(45%206%206)%20scale(0.500)%22%3E%3Cpath%20d%3D%22M12%206v12M6%2012h12%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(262%20196)%20rotate(22%209%209)%20scale(0.750)%22%3E%3Cpath%20d%3D%22M3%205.5A1.5%201.5%200%200%201%204.5%204H11v15H4.5A1.5%201.5%200%200%201%203%2017.5zM21%205.5A1.5%201.5%200%200%200%2019.5%204H13v15h6.5a1.5%201.5%200%200%200%201.5-1.5zM11%204h2v15h-2%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(0%20252)%20rotate(-10%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%2021a9%209%200%201%200%200-18%209%209%200%200%200%200%2018zM12%207v5l3%202%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E");background-size:300px 300px}.dark .chat-wallpaper{background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22300%22%20viewBox%3D%220%200%20300%20300%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23EAF0FF%22%20stroke-opacity%3D%220.07%22%20stroke-width%3D%221.4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cg%20transform%3D%22translate(14%2018)%20rotate(-12%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M3%205.5A1.5%201.5%200%200%201%204.5%204H11v15H4.5A1.5%201.5%200%200%201%203%2017.5zM21%205.5A1.5%201.5%200%200%200%2019.5%204H13v15h6.5a1.5%201.5%200%200%200%201.5-1.5zM11%204h2v15h-2%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(78%2010)%20rotate(18%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M4%2020l1-4L16%205l3%203L8%2019zM14%207l3%203%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(140%2022)%20rotate(-6%2014%2014)%20scale(1.167)%22%3E%3Cpath%20d%3D%22M2%209l10-5%2010%205-10%205zM6%2011v5c3%202.5%209%202.5%2012%200v-5M22%209v6%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(210%2012)%20rotate(14%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M9%2018h6M10%2021h4M12%203a6%206%200%200%200-3.5%2010.9c.6.5%201%201.2%201%202.1h5c0-.9.4-1.6%201-2.1A6%206%200%200%200%2012%203z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(30%2082)%20rotate(8%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M12%2012m-1.5%200a1.5%201.5%200%201%200%203%200a1.5%201.5%200%201%200-3%200M12%203c4%200%204%2018%200%2018S8%203%2012%203zM4.2%207.5c2-3.5%2017.6%205.5%2015.6%209s-17.6-5.5-15.6-9zM4.2%2016.5c-2-3.5%2013.6-12.5%2015.6-9s-13.6%2012.5-15.6%209z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(104%2070)%20rotate(-10%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M6%203h12v18H6zM8.5%206h7v3h-7zM9%2012h.01M12%2012h.01M15%2012h.01M9%2015h.01M12%2015h.01M15%2015h.01M9%2018h.01M12%2018h3%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(168%2084)%20rotate(6%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M4%205h16v11H9l-5%204z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(232%2076)%20rotate(-14%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M12%2021a9%209%200%201%200%200-18%209%209%200%200%200%200%2018zM3%2012h18M12%203c3%203%203%2015%200%2018M12%203c-3%203-3%2015%200%2018%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(8%20146)%20rotate(20%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%203l2.8%205.7%206.2.9-4.5%204.4%201%206.2L12%2017.3%206.5%2020.2l1-6.2L3%209.6l6.2-.9z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(64%20134)%20rotate(-8%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%2020s-7-4.4-7-10a4%204%200%200%201%207-2.6A4%204%200%200%201%2019%2010c0%205.6-7%2010-7%2010z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(124%20138)%20rotate(30%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M3%2017L17%203l4%204L7%2021zM7%2013l2%202M10%2010l2%202M13%207l2%202%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(190%20144)%20rotate(-6%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M9%203h6M10%203v6l-5%209a2%202%200%200%200%201.8%203h10.4a2%202%200%200%200%201.8-3l-5-9V3M7.5%2015h9%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(250%20140)%20rotate(10%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M9%2018V5l11-2v13M9%2018a3%203%200%201%201-6%200%203%203%200%200%201%206%200zM20%2016a3%203%200%201%201-6%200%203%203%200%200%201%206%200z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(30%20206)%20rotate(-4%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M4%208h13v6a5%205%200%200%201-5%205H9a5%205%200%200%201-5-5zM17%2010h1.5a2.5%202.5%200%200%201%200%205H17M8%202v3M12%202v3%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(96%20196)%20rotate(12%2012%2012)%20scale(1.000)%22%3E%3Cpath%20d%3D%22M8%203l4%206%204-6M12%2021a6%206%200%201%200%200-12%206%206%200%200%200%200%2012zM12%2013v4M10%2015h4%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(160%20206)%20rotate(-8%2013%2013)%20scale(1.083)%22%3E%3Cpath%20d%3D%22M5%205h14v10H5zM2%2019h20%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(226%20204)%20rotate(6%2011%2011)%20scale(0.917)%22%3E%3Cpath%20d%3D%22M4%207h16M8%207v11M15%207v9a2%202%200%200%200%203%201.7%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(60%20250)%20rotate(0%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%206v12M6%2012h12%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(196%20254)%20rotate(0%209%209)%20scale(0.750)%22%3E%3Cpath%20d%3D%22M6%2012h.01M12%2012h.01M18%2012h.01%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(270%2030)%20rotate(-20%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%203l2.8%205.7%206.2.9-4.5%204.4%201%206.2L12%2017.3%206.5%2020.2l1-6.2L3%209.6l6.2-.9z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(280%20260)%20rotate(14%207%207)%20scale(0.583)%22%3E%3Cpath%20d%3D%22M12%2020s-7-4.4-7-10a4%204%200%200%201%207-2.6A4%204%200%200%201%2019%2010c0%205.6-7%2010-7%2010z%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(120%20250)%20rotate(45%206%206)%20scale(0.500)%22%3E%3Cpath%20d%3D%22M12%206v12M6%2012h12%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(262%20196)%20rotate(22%209%209)%20scale(0.750)%22%3E%3Cpath%20d%3D%22M3%205.5A1.5%201.5%200%200%201%204.5%204H11v15H4.5A1.5%201.5%200%200%201%203%2017.5zM21%205.5A1.5%201.5%200%200%200%2019.5%204H13v15h6.5a1.5%201.5%200%200%200%201.5-1.5zM11%204h2v15h-2%22%2F%3E%3C%2Fg%3E%3Cg%20transform%3D%22translate(0%20252)%20rotate(-10%2010%2010)%20scale(0.833)%22%3E%3Cpath%20d%3D%22M12%2021a9%209%200%201%200%200-18%209%209%200%200%200%200%2018zM12%207v5l3%202%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")}`}</style>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { TEACHER: 'Teacher', STUDENT: 'Student', ADMIN: 'CareerPath', COUNTRY_REP: 'Country representative', SUBJECT_REVIEWER: 'Subject reviewer' };

/** Someone in a group: photo, name, role, and a way to message them on their own */
function ContactCard({ person, groupRole, onClose, onMessage }: { person: { id: string; name: string; avatarUrl: string | null; role: string }; groupRole?: string; onClose: () => void; onMessage: () => void }) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={person.name} description={[ROLE_LABEL[person.role] ?? person.role, groupRole === 'ADMIN' ? 'Group admin' : ''].filter(Boolean).join(' · ')}>
        <div className="flex flex-col items-center gap-3 py-2">
          {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
            : <span className="grid h-24 w-24 place-items-center rounded-full text-[30px] font-extrabold text-white" style={{ background: colourFor(person.id) }}>{initials(person.name)}</span>}
          <Button onClick={onMessage}>Message {person.name.split(' ')[0]}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bubble({ m, first, last, group, onOpen, onRetry, names, actions, menuOpen, onMenu, onReact, onJump, highlight, onPerson }: {
  m: Message; first: boolean; last: boolean; group: boolean; onOpen: () => void; onRetry: () => void;
  names: string[]; actions: MenuActions; menuOpen: boolean; onMenu: (open: boolean) => void; onReact: (e: string) => void; onJump: (id: string) => void; highlight: boolean; onPerson: () => void;
}) {
  const own = m.isOwn;
  const hasMenu = Object.entries(actions).some(([k, v]) => k !== 'starred' && !!v);
  const isImage = !!m.attachmentType?.startsWith('image/');
  const isVoice = !!m.attachmentType?.startsWith('audio/');
  const src = m.attachmentUrl ?? m.localPreview ?? null;
  if (m.kind === 'SYSTEM') return <p id={`msg-${m.id}`} className="mx-auto my-2 w-fit max-w-[85%] rounded-md bg-white/95 px-3 py-1.5 text-center text-[12.5px] text-ink2 shadow-sm">{m.body}</p>;
  const meta = (
    <span className={clsx('ml-2 inline-flex translate-y-1 items-center gap-1 whitespace-nowrap text-[10.5px]', own ? 'text-white/80' : 'text-muted')}>
      {m.starred && <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-label="Starred"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>}
      {m.editedAt && !m.deleted && <span>edited</span>}
      {time(m.createdAt)}{own && !m.deleted && <Ticks m={m} group={group} light />}
    </span>
  );
  return (
    <div id={`msg-${m.id}`} className={clsx('flex gap-1.5', own ? 'justify-end' : 'justify-start', first ? 'mt-2' : 'mt-0.5')}>
      {group && !own && (first
        ? <button type="button" onClick={onPerson} aria-label={`${m.senderName}: contact card`} className="mt-0.5 h-8 w-8 shrink-0 self-start overflow-hidden rounded-full">
            {m.senderAvatarUrl ? <img src={m.senderAvatarUrl} alt="" className="h-8 w-8 object-cover" /> : <span className="grid h-8 w-8 place-items-center text-[11.5px] font-extrabold text-white" style={{ background: colourFor(m.senderId) }}>{initials(m.senderName)}</span>}
          </button>
        : <span className="w-8 shrink-0" aria-hidden />)}
      <div className={clsx('flex min-w-0 max-w-full flex-col', own ? 'items-end' : 'items-start')}>
      <div onContextMenu={e => { if (hasMenu) { e.preventDefault(); onMenu(true); } }}
        className={clsx('group relative max-w-[min(78vw,560px)] rounded-lg px-2 pb-1.5 pt-1.5 text-[14px] leading-[1.4] shadow-sm transition-shadow lg:max-w-[min(48vw,560px)]',
        own ? 'bg-azure-strong text-on-accent' : 'bg-white text-navy',
        first && (own ? 'rounded-tr-none' : 'rounded-tl-none'), highlight && 'ring-4 ring-amber-300')}>
        {hasMenu && (
          <button type="button" onClick={() => onMenu(!menuOpen)} aria-label="Message menu" aria-haspopup="menu" aria-expanded={menuOpen}
            className={clsx('absolute right-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-full opacity-0 focus:opacity-100 group-hover:opacity-100', own ? 'bg-azure-strong text-white' : 'bg-white text-muted', menuOpen && 'opacity-100')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
        {menuOpen && <MessageMenu own={own} a={actions} onClose={() => onMenu(false)} />}
        {/* Tail on the first bubble of a run */}
        {first && <span aria-hidden className={clsx('absolute top-0 h-3 w-2.5', own ? '-right-2 bg-azure-strong [clip-path:polygon(0_0,100%_0,0_100%)]' : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)]')} />}
        {group && !own && first && <button type="button" onClick={onPerson} className="block px-1 pb-0.5 pr-6 text-left text-[12.5px] font-semibold hover:underline" style={{ color: colourFor(m.senderId) }}>{m.senderName}{m.senderRole === 'TEACHER' ? ' · Teacher' : ''}</button>}
        {m.deleted ? (
          <p className={clsx('flex flex-wrap items-center gap-x-2 px-1 italic', own ? 'text-white/85' : 'text-muted')}>
            {own ? 'You deleted this message' : 'This message was deleted'}
            {actions.record && <button type="button" onClick={actions.record} className="not-italic text-[12px] font-semibold underline">Show original</button>}
            {meta}
          </p>
        ) : <>
        {m.replyTo && <ReplyQuote r={m.replyTo} own={own} onJump={() => onJump(m.replyTo!.id)} />}
        {isVoice ? (
          <div className="px-1 pb-0.5 pt-0.5"><VoicePlayer src={src} duration={m.attachmentDuration ?? 0} wave={m.attachmentWave} own={own} /></div>
        ) : m.attachmentType && (isImage ? (
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
          <p className="whitespace-pre-wrap break-words px-1"><MentionText text={m.body} names={group ? names : []} own={own} />{meta}</p>
        ) : <p className="flex justify-end px-1">{meta}</p>}
        </>}
        {m.pending === 'failed' && <button onClick={onRetry} className="mt-1 block px-1 text-[12px] font-semibold underline">Not sent — tap to try again</button>}
      </div>
      {!m.deleted && <ReactionChips list={m.reactions ?? []} own={own} onToggle={onReact} />}
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
