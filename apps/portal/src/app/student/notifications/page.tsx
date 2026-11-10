'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import { PushStrip } from '@/components/push/Push';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Note { id: string; type: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }

const DAY = 86_400_000;
function group(iso: string) {
  const d = new Date(iso), today = new Date(new Date().toDateString());
  if (d >= today) return 'Today';
  if (+today - +d < 7 * DAY) return 'This week';
  return 'Earlier';
}
// "Today 14:00", "Sun 19:57", "1 Nov"
function when(iso: string) {
  const d = new Date(iso), g = group(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (g === 'Today') return `Today ${time}`;
  if (g === 'This week') return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const TYPE_ICON: Record<string, IconName> = {
  live: 'live', assignment: 'assignments', grade: 'grade', certificate: 'certificates', message: 'messages', community: 'mentorship', system: 'bell',
};
const iconFor = (n: Note): IconName =>
  /call/i.test(n.title) ? 'phoneCall' : /support/i.test(n.title) ? 'supportReply' : TYPE_ICON[n.type] ?? 'bell';

export default function NotificationsPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  useEffect(() => { api.get('/notifications').then(r => setNotes(r.data ?? [])).catch(() => { setNotes([]); notify.error('Could not load notifications'); }); }, []);

  const unread = (notes ?? []).filter(n => !n.readAt);
  const shown = tab === 'unread' ? unread : notes ?? [];

  async function open(n: Note) {
    if (!n.readAt) {
      setNotes(xs => xs?.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
      api.patch(`/notifications/${n.id}/read`).then(() => window.dispatchEvent(new Event('cpa-badges'))).catch(() => {});
    }
    if (n.href) router.push(n.href);
  }
  async function readAll() {
    const now = new Date().toISOString();
    setNotes(xs => xs?.map(x => ({ ...x, readAt: x.readAt ?? now })) ?? null);
    try { await api.post('/notifications/read-all'); window.dispatchEvent(new Event('cpa-badges')); } catch { notify.error('Could not mark them as read'); }
  }
  async function remove(id: string) {
    setNotes(xs => xs?.filter(x => x.id !== id) ?? null);
    api.delete(`/notifications/${id}`).catch(() => notify.error('Could not remove it'));
  }

  let last = '';
  return (
    <div className="flex min-h-full flex-col">
      <div className="hidden lg:block"><Topbar title="Notifications" subtitle="Everything we’ve told you, newest first" /></div>

      {/* Phones: the title and Mark all read, as one row */}
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4 lg:hidden">
        <h1 className="text-[22px] font-extrabold text-navy">Notifications</h1>
        {unread.length > 0 && <button onClick={readAll} className="text-[13.5px] font-bold text-azure-strong">Mark all read</button>}
      </div>

      <div className="flex flex-wrap items-start gap-5 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-3">
          <div className="px-3 lg:px-0"><PushStrip /></div>

          <section className="border-y border-line bg-white lg:rounded-lg lg:border-x">
            <div className="hidden items-center gap-1 border-b border-line px-4 text-[13.5px] lg:flex">
              {([['all', 'All', notes?.length ?? 0], ['unread', 'Unread', unread.length]] as const).map(([k, l, n]) => (
                <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                  className={clsx('-mb-px border-b-2 px-2.5 py-[13px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{l} {n}</button>
              ))}
              <span className="flex-1" />
              {unread.length > 0 && <button onClick={readAll} className="text-[13px] font-semibold text-azure-strong hover:underline">Mark all as read</button>}
            </div>
            {!notes ? <div className="m-4 h-48 animate-pulse rounded-md bg-subtle" /> : shown.length ? shown.map(n => {
              const g = group(n.createdAt);
              const head = g !== last ? g : null;
              last = g;
              return (
                <div key={n.id}>
                  {head && <p className="hidden border-b border-line bg-white px-[18px] pb-1.5 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted lg:block">{head}</p>}
                  <div className={clsx('group flex items-start gap-3 border-b border-line px-4 py-3 lg:px-[18px]', n.readAt ? 'bg-subtle' : 'bg-white')}>
                    <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-accent-soft text-azure-strong"><Icon name={iconFor(n)} size={19} line /></span>
                    <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[14px] font-bold text-navy">{n.title}</span>
                        <span className="shrink-0 whitespace-nowrap text-[11.5px] text-muted">{when(n.createdAt)}</span>
                      </span>
                      {n.body && <span className="mt-0.5 block text-[13px] leading-snug text-ink2">{n.body}</span>}
                    </button>
                    <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-azure-strong')} aria-label={n.readAt ? undefined : 'Unread'} />
                    <button onClick={() => remove(n.id)} aria-label="Remove" className="hidden shrink-0 rounded p-1 text-muted opacity-0 hover:bg-white hover:text-navy group-hover:opacity-100 focus:opacity-100 lg:block">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                </div>
              );
            }) : <p className="px-4 py-12 text-center text-[13px] text-ink2">{tab === 'unread' ? 'You’re all caught up.' : 'Nothing yet. Grades, live classes and messages show up here.'}</p>}
          </section>
        </div>
        <aside className="hidden min-w-0 flex-[1_1_280px] flex-col gap-1.5 rounded-lg border border-line bg-white p-4 lg:flex">
          <h3 className="text-[15px] font-semibold text-navy">What we tell you about</h3>
          <p className="text-[13px] text-ink2">Grades, live classes, messages, mentorship and when your access is about to end. Choose how you hear about each one.</p>
          <Link href="/student/preferences" className="text-[13px] font-semibold text-azure-strong hover:underline">Notification settings</Link>
        </aside>
      </div>
    </div>
  );
}
