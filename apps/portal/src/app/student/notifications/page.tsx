'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';
import { toast } from 'sonner';

type NType = 'live' | 'assignment' | 'grade' | 'certificate' | 'message' | 'system';

interface Notification {
  id: string;
  type: NType;
  title: string;
  body: string;
  href?: string;
  readAt?: string | null;
  createdAt: string;
}

const TYPE_META: Record<NType, { icon: string; bg: string; text: string }> = {
  live:        { icon: 'live',         bg: 'bg-red-100',     text: 'text-red-500' },
  assignment:  { icon: 'assignments',  bg: 'bg-amber-100',   text: 'text-amber-600' },
  grade:       { icon: 'star',         bg: 'bg-emerald-100', text: 'text-emerald-600' },
  certificate: { icon: 'certificates', bg: 'bg-azure/10',    text: 'text-azure' },
  message:     { icon: 'community',    bg: 'bg-purple-100',  text: 'text-purple-600' },
  system:      { icon: 'shield',       bg: 'bg-cloud',       text: 'text-royal' },
};

type Filter = 'all' | 'unread' | NType;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const [notifs, setNotifs]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>('all');

  useEffect(() => {
    api.get('/notifications')
      .then(r => setNotifs(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    api.patch(`/notifications/${id}/read`).catch(() => {});
  }

  async function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    api.post('/notifications/read-all').catch(() => {});
    toast.success('All marked as read');
  }

  async function deleteNotif(id: string) {
    setNotifs(prev => prev.filter(n => n.id !== id));
    api.delete(`/notifications/${id}`).catch(() => {});
  }

  const unreadCount = notifs.filter(n => !n.readAt).length;

  const filtered = notifs.filter(n => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.readAt;
    return n.type === filter;
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',         label: 'All' },
    { key: 'unread',      label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'live',        label: 'Live' },
    { key: 'assignment',  label: 'Assignments' },
    { key: 'grade',       label: 'Grades' },
    { key: 'certificate', label: 'Certs' },
    { key: 'message',     label: 'Messages' },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        backHref="/student/dashboard"
        backLabel="Dashboard"
        actions={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              className="rounded-xl border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 p-4 md:p-6 max-w-2xl space-y-4">

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition
                ${filter === f.key ? 'bg-azure text-white' : 'bg-cloud text-navy hover:bg-azure/10'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-cloud animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card padding="md" className="flex flex-col items-center py-16 text-center">
            <Icon name="live" size={32} className="text-cloud mb-3" />
            <p className="text-sm font-bold text-navy">
              {filter === 'unread' ? "You're all caught up!" : 'No notifications here'}
            </p>
            <p className="text-xs text-royal/40 mt-1">Check back later for updates</p>
          </Card>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {filtered.map(n => {
                const meta  = TYPE_META[n.type] ?? TYPE_META.system;
                const isNew = !n.readAt;

                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`relative flex items-start gap-3 rounded-2xl border p-4 transition-colors
                      ${isNew ? 'border-azure/20 bg-azure/5' : 'border-cloud bg-white'}`}
                  >
                    {/* Unread dot */}
                    {isNew && (
                      <span className="absolute top-3 right-10 h-2 w-2 rounded-full bg-azure" />
                    )}

                    {/* Icon */}
                    <div className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${meta.bg}`}>
                      <Icon name={meta.icon as never} size={16} className={meta.text} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0" onClick={() => { markRead(n.id); }}>
                      {n.href ? (
                        <Link href={n.href}>
                          <p className={`text-xs font-bold leading-snug ${isNew ? 'text-navy' : 'text-navy/80'}`}>{n.title}</p>
                          <p className="text-[11px] text-royal/60 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                        </Link>
                      ) : (
                        <>
                          <p className={`text-xs font-bold leading-snug ${isNew ? 'text-navy' : 'text-navy/80'}`}>{n.title}</p>
                          <p className="text-[11px] text-royal/60 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                        </>
                      )}
                      <p className="text-[10px] text-royal/40 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => deleteNotif(n.id)}
                      className="flex-shrink-0 text-royal/30 hover:text-rose-400 transition p-1">
                      <Icon name="logout" size={12} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
