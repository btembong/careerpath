'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Topbar } from '@/components/layout/Topbar';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface ThreadSummary {
  id: string;
  other: { id: string; name: string; avatarUrl: string | null; role: string };
  lastMessage: { body: string; createdAt: string; isOwn: boolean } | null;
  unread: boolean;
  lastMessageAt: string;
}

interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  isOwn: boolean;
  readAt: string | null;
}

export default function MessagesInbox({ backHref }: { backHref: string }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadThreads = useCallback(async () => {
    const r = await api.get('/messages/threads');
    setThreads(r.data);
  }, []);

  useEffect(() => {
    // ?to=<userId> opens (or starts) the conversation with that person
    const to = new URLSearchParams(window.location.search).get('to');
    (async () => {
      if (to) {
        try {
          const t = await api.post('/messages/threads', { recipientId: to });
          const r = await api.get('/messages/threads');
          setThreads(r.data);
          const found = (r.data as ThreadSummary[]).find(x => x.id === t.data?.id || x.other.id === to);
          if (found) setActiveThread(found);
          else if (t.data?.id) setActiveThread({ id: t.data.id, other: { id: to, name: 'New conversation', avatarUrl: null, role: '' }, lastMessage: null, unread: false, lastMessageAt: new Date().toISOString() });
          return;
        } catch { notify.error('Could not open that conversation'); }
      }
      await loadThreads();
    })().finally(() => setLoading(false));
  }, [loadThreads]);

  const loadMessages = useCallback(async (threadId: string) => {
    setMsgLoading(true);
    try {
      const r = await api.get(`/messages/threads/${threadId}`);
      setMessages(r.data.reverse()); // oldest first
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    loadMessages(activeThread.id);
    // Poll every 5s for new messages
    pollRef.current = setInterval(() => loadMessages(activeThread.id), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim() || !activeThread) return;
    setSending(true);
    try {
      const r = await api.post(`/messages/threads/${activeThread.id}`, { body: msgInput.trim() });
      setMessages(prev => [...prev, r.data]);
      setMsgInput('');
      loadThreads();
    } catch { notify.error('Failed to send'); }
    finally { setSending(false); }
  }

  function openThread(thread: ThreadSummary) {
    setActiveThread(thread);
    setMessages([]);
    setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, unread: false } : t));
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="flex flex-col w-80 border-r border-cloud bg-white">
          <div className="p-4 border-b border-cloud">
            <div className="h-3 w-28 bg-cloud rounded animate-pulse" />
          </div>
          <div className="flex-1 p-3 space-y-2">
            {[0,1,2,3].map(i => (
              <div key={i} className="flex items-center gap-3 px-1 py-2">
                <div className="w-10 h-10 rounded-2xl bg-cloud animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-24 bg-cloud rounded animate-pulse" />
                  <div className="h-2 w-40 bg-cloud/60 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="h-12 w-48 bg-cloud rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Messages" subtitle="Chat with your teachers and students" backHref={backHref} backLabel="Back" />

      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Thread list */}
        <div className={`flex flex-col border-r border-cloud bg-white ${activeThread ? 'hidden lg:flex w-80' : 'flex-1 lg:w-80'}`}>
          <div className="p-4 border-b border-cloud">
            <p className="text-xs font-semibold text-navy">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center px-4">
                <Icon name="community" size={36} className="text-cloud mb-3" />
                <p className="text-sm font-semibold text-navy">No conversations yet</p>
                <p className="text-xs text-royal/40 mt-1">Message a teacher from their profile page</p>
              </div>
            )}
            {threads.map(t => (
              <button key={t.id} onClick={() => openThread(t)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-cloud hover:bg-cloud/50 transition ${
                  activeThread?.id === t.id ? 'bg-azure/5 border-l-2 border-l-azure' : ''
                }`}>
                <div className="relative flex-shrink-0">
                  {t.other.avatarUrl ? (
                    <Image src={t.other.avatarUrl} alt={t.other.name} width={40} height={40}
                      className="w-10 h-10 rounded-2xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-cloud flex items-center justify-center text-azure font-bold">
                      {t.other.name[0]}
                    </div>
                  )}
                  {t.unread && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-azure border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-semibold text-navy truncate ${t.unread ? 'font-bold' : ''}`}>{t.other.name}</p>
                    {t.lastMessage && (
                      <p className="text-[10px] text-royal/30 flex-shrink-0 ml-1">
                        {new Date(t.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  {t.lastMessage && (
                    <p className={`text-[11px] truncate ${t.unread ? 'text-navy font-medium' : 'text-royal/40'}`}>
                      {t.lastMessage.isOwn ? 'You: ' : ''}{t.lastMessage.body}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message view */}
        {activeThread ? (
          <div className="flex-1 flex flex-col bg-surface">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-cloud">
              <button onClick={() => setActiveThread(null)} className="lg:hidden mr-1 text-royal/50 hover:text-navy">
                <Icon name="arrowLeft" size={18} />
              </button>
              {activeThread.other.avatarUrl ? (
                <Image src={activeThread.other.avatarUrl} alt={activeThread.other.name} width={36} height={36}
                  className="w-9 h-9 rounded-xl object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-cloud flex items-center justify-center text-azure font-bold">
                  {activeThread.other.name[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-navy">{activeThread.other.name}</p>
                <p className="text-[10px] text-royal/40 capitalize">{activeThread.other.role.toLowerCase()}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgLoading && messages.length === 0 && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-azure border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    m.isOwn ? 'bg-azure text-white rounded-br-sm' : 'bg-white border border-cloud text-navy rounded-bl-sm'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.isOwn ? 'text-white/60' : 'text-royal/30'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.isOwn && m.readAt && ' · Read'}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage}
              className="flex items-end gap-3 px-4 py-3 bg-white border-t border-cloud">
              <textarea
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent); } }}
                placeholder="Type a message… (Enter to send)"
                rows={1}
                className="flex-1 rounded-2xl border border-cloud bg-surface px-4 py-2.5 text-sm text-navy outline-none focus:border-azure resize-none max-h-32 overflow-y-auto"
              />
              <button type="submit" disabled={!msgInput.trim() || sending}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-azure text-white hover:bg-royal disabled:opacity-40 transition">
                <Icon name="arrowRight" size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center">
            <Icon name="community" size={48} className="text-cloud mb-4" />
            <p className="text-sm font-semibold text-navy">Select a conversation</p>
            <p className="text-xs text-royal/40 mt-1">Choose a thread from the left to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
