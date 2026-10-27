'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type FilterTab = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'all';

const STATUS_BADGE: Record<Status, 'default' | 'muted' | 'active'> = {
  OPEN:        'default',
  IN_PROGRESS: 'muted',
  RESOLVED:    'active',
  CLOSED:      'muted',
};

const NEXT_STATUS: Record<Status, Status | null> = {
  OPEN:        'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED:    'CLOSED',
  CLOSED:      null,
};

const NEXT_LABEL: Record<Status, string> = {
  OPEN:        'Mark in progress',
  IN_PROGRESS: 'Mark resolved',
  RESOLVED:    'Close ticket',
  CLOSED:      '',
};

const CATEGORY_ICON: Record<string, 'user' | 'wallet' | 'courses' | 'settings' | 'hash'> = {
  account: 'user', billing: 'wallet', courses: 'courses', technical: 'settings', other: 'hash',
};

export default function AdminSupportPage() {
  const [tickets,  setTickets]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterTab>('OPEN');
  const [acting,   setActing]   = useState<string | null>(null);
  const [noteMap,  setNoteMap]  = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get('/support/admin/tickets')
      .then(r => setTickets(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(ticket: any, status: Status) {
    setActing(ticket.id);
    try {
      await api.patch(`/support/admin/tickets/${ticket.id}`, {
        status,
        adminNote: noteMap[ticket.id]?.trim() || undefined,
      });
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status, adminNote: noteMap[ticket.id] ?? t.adminNote } : t));
      notify.success(`Ticket marked ${status.toLowerCase().replace('_', ' ')}`);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Update failed');
    } finally {
      setActing(null);
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const counts = {
    OPEN:        tickets.filter(t => t.status === 'OPEN').length,
    IN_PROGRESS: tickets.filter(t => t.status === 'IN_PROGRESS').length,
    RESOLVED:    tickets.filter(t => t.status === 'RESOLVED').length,
    all:         tickets.length,
  };

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Support Tickets" subtitle="Student help requests" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-4xl w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {([
            { key: 'OPEN',        label: 'Open',        color: 'text-red-500'    },
            { key: 'IN_PROGRESS', label: 'In progress', color: 'text-amber-500'  },
            { key: 'RESOLVED',    label: 'Resolved',    color: 'text-azure'      },
            { key: 'all',         label: 'Total',       color: 'text-navy'       },
          ] as { key: FilterTab; label: string; color: string }[]).map(s => (
            <button key={s.key} onClick={() => setFilter(s.key)} className="text-left w-full">
              <Card
                className={`flex flex-col items-center py-4 text-center cursor-pointer transition
                  ${filter === s.key ? 'ring-2 ring-azure border-azure/30' : ''}`}>
                <p className={`text-2xl font-black ${s.color}`}>{counts[s.key]}</p>
                <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
              </Card>
            </button>
          ))}
        </div>

        {/* Ticket list */}
        {filtered.length === 0 ? (
          <EmptyState icon="check" title="No tickets" description={`No ${filter === 'all' ? '' : filter.toLowerCase().replace('_', ' ')} support tickets`} />
        ) : (
          <div className="space-y-3">
            {filtered.map(ticket => {
              const status = ticket.status as Status;
              const next = NEXT_STATUS[status];
              const isExpanded = expanded === ticket.id;
              const catIcon = CATEGORY_ICON[ticket.category] ?? 'hash';

              return (
                <Card key={ticket.id} padding="none" className="overflow-hidden">
                  {/* Header row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : ticket.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface transition">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cloud">
                      <Icon name={catIcon} size={16} className="text-azure" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{ticket.subject}</p>
                      <p className="text-[10px] text-royal/40 mt-0.5">
                        {ticket.student?.email} · {ticket.category} ·{' '}
                        {new Date(ticket.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[status]} className="flex-shrink-0 capitalize">
                      {status.toLowerCase().replace('_', ' ')}
                    </Badge>
                    <Icon name="chevronDown" size={14}
                      className={`text-royal/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded body */}
                  <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                    <div className="px-5 pb-5 border-t border-cloud space-y-4 pt-4">
                      {/* Message */}
                      <div className="rounded-xl bg-surface p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-2">Student message</p>
                        <p className="text-sm text-navy leading-relaxed whitespace-pre-wrap">{ticket.message}</p>
                      </div>

                      {/* Existing admin note */}
                      {ticket.adminNote && (
                        <div className="rounded-xl border border-azure/20 bg-azure/5 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">Admin note</p>
                          <p className="text-xs text-navy">{ticket.adminNote}</p>
                        </div>
                      )}

                      {/* Note input + action */}
                      {next && (
                        <div className="space-y-2">
                          <textarea
                            value={noteMap[ticket.id] ?? ''}
                            onChange={e => setNoteMap(m => ({ ...m, [ticket.id]: e.target.value }))}
                            placeholder="Add a note (optional — will be stored on the ticket)"
                            rows={2}
                            className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-xs text-navy
                                       outline-none focus:border-azure resize-none placeholder:text-royal/30"
                          />
                          <button
                            onClick={() => updateStatus(ticket, next)}
                            disabled={acting === ticket.id}
                            className="inline-flex items-center gap-2 rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white
                                       hover:bg-royal transition disabled:opacity-50">
                            {acting === ticket.id
                              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              : <Icon name="check" size={13} />
                            }
                            {NEXT_LABEL[status]}
                          </button>
                        </div>
                      )}
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
