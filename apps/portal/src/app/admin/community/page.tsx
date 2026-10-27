'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Tab = 'pending' | 'reviewed' | 'discussions';

export default function AdminCommunityPage() {
  const [tab, setTab]             = useState<Tab>('pending');
  const [stories, setStories]     = useState<any[]>([]);
  const [published, setPublished] = useState<any[]>([]);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [discLoading, setDiscLoading] = useState(false);
  const [acting, setActing]       = useState<string | null>(null);
  const [noteMap, setNoteMap]     = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api.get('/community/admin/success-stories').then(r => setStories(r.data ?? [])).catch(() => {}),
      api.get('/community/success-stories/published').then(r => setPublished(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function loadDiscussions() {
    setDiscLoading(true);
    try {
      const r = await api.get('/community/admin/discussions');
      setDiscussions(r.data ?? []);
    } catch { setDiscussions([]); }
    finally { setDiscLoading(false); }
  }

  useEffect(() => {
    if (tab === 'discussions' && discussions.length === 0) loadDiscussions();
  }, [tab]);

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    setActing(id);
    try {
      await api.patch(`/community/admin/success-stories/${id}`, {
        status,
        adminNote: noteMap[id]?.trim() || undefined,
      });
      setStories(prev => prev.filter(s => s.id !== id));
      if (status === 'APPROVED') notify.success('Story approved and published');
      else notify.success('Story rejected');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    } finally {
      setActing(null);
    }
  }

  async function moderateDiscussion(id: string, action: 'hide' | 'delete') {
    setActing(id);
    try {
      if (action === 'delete') {
        await api.delete(`/community/admin/discussions/${id}`);
        setDiscussions(prev => prev.filter(d => d.id !== id));
        notify.success('Post deleted');
      } else {
        await api.patch(`/community/admin/discussions/${id}`, { hidden: true });
        setDiscussions(prev => prev.map(d => d.id === id ? { ...d, hidden: true } : d));
        notify.success('Post hidden');
      }
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    } finally { setActing(null); }
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

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Community" subtitle="Review student success stories and discussion posts" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-4xl w-full mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending review', value: stories.length,   icon: 'clock'     as const, color: 'text-amber-500' },
            { label: 'Published',      value: published.length, icon: 'star'      as const, color: 'text-azure'     },
            { label: 'Total stories',  value: stories.length + published.length, icon: 'community' as const, color: 'text-navy' },
          ].map(s => (
            <Card key={s.label} className="flex flex-col items-center py-4 text-center">
              <Icon name={s.icon} size={20} className={s.color} />
              <p className="text-2xl font-black text-navy mt-1">{s.value}</p>
              <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit">
          {([
            ['pending',     `Pending (${stories.length})`],
            ['reviewed',    `Published (${published.length})`],
            ['discussions', 'Discussions'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all
                ${tab === t ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Pending queue */}
        {tab === 'pending' && (
          <div className="space-y-4">
            {stories.length === 0 ? (
              <EmptyState icon="star" title="No pending stories" description="All stories have been reviewed" />
            ) : stories.map((s: any) => (
              <Card key={s.id} padding="none" className="overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-cloud bg-surface">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-azure text-xs font-bold text-white flex-shrink-0">
                    {s.student?.email?.[0]?.toUpperCase() ?? 'S'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-navy truncate">{s.student?.email ?? 'Student'}</p>
                    <p className="text-[10px] text-royal/40">
                      Submitted {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant="muted">Pending</Badge>
                </div>
                <div className="px-5 py-4">
                  <h3 className="text-sm font-bold text-navy mb-2">{s.title}</h3>
                  <p className="text-sm text-royal/70 leading-relaxed line-clamp-4">{s.body}</p>
                  {s.linkedInUrl && (
                    <a href={s.linkedInUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                      LinkedIn profile <Icon name="externalLink" size={11} />
                    </a>
                  )}
                </div>
                <div className="px-5 pb-4 space-y-3">
                  <textarea
                    value={noteMap[s.id] ?? ''}
                    onChange={e => setNoteMap(m => ({ ...m, [s.id]: e.target.value }))}
                    placeholder="Optional note to student (reason for rejection, feedback, etc.)"
                    rows={2}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-xs text-navy outline-none focus:border-azure resize-none placeholder:text-royal/30"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" loading={acting === s.id} onClick={() => review(s.id, 'APPROVED')} className="flex-1">
                      <Icon name="check" size={13} /> Approve & publish
                    </Button>
                    <button onClick={() => review(s.id, 'REJECTED')} disabled={!!acting}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-50">
                      <Icon name="close" size={13} /> Reject
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Published stories */}
        {tab === 'reviewed' && (
          <div className="space-y-3">
            {published.length === 0 ? (
              <EmptyState icon="star" title="No published stories yet" description="Approve stories from the pending queue to publish them" />
            ) : published.map((s: any) => (
              <Card key={s.id} className="flex items-start gap-4 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-azure text-sm font-bold text-white flex-shrink-0">
                  {s.student?.email?.[0]?.toUpperCase() ?? 'S'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy">{s.title}</p>
                  <p className="text-xs text-royal/50 mt-0.5 truncate">{s.student?.email}</p>
                  <p className="text-xs text-royal/60 mt-1 line-clamp-2 leading-relaxed">{s.body}</p>
                </div>
                <Badge variant="active" className="flex-shrink-0">Published</Badge>
              </Card>
            ))}
          </div>
        )}

        {/* Discussions */}
        {tab === 'discussions' && (
          <div className="space-y-3">
            {discLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 rounded-full border-2 border-azure border-t-transparent animate-spin" />
              </div>
            ) : discussions.length === 0 ? (
              <EmptyState icon="community" title="No discussion posts" description="Forum posts from courses and lessons appear here" />
            ) : discussions.map((d: any) => (
              <Card key={d.id} padding="none" className="overflow-hidden">
                <div className="flex items-start gap-3 px-5 py-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-azure text-xs font-bold">
                    {d.author?.email?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-xs font-semibold text-navy">{d.author?.email ?? 'User'}</p>
                      {d.course && <span className="text-[10px] text-azure font-medium">{d.course.title}</span>}
                      <p className="text-[10px] text-royal/40 ml-auto">
                        {new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <p className="text-sm text-royal/70 leading-relaxed line-clamp-3">{d.content ?? d.body}</p>
                    {d.hidden && (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">Hidden</span>
                    )}
                  </div>
                </div>
                {!d.hidden && (
                  <div className="flex gap-2 px-5 pb-3.5">
                    <button onClick={() => moderateDiscussion(d.id, 'hide')} disabled={acting === d.id}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-100 transition disabled:opacity-50">
                      Hide post
                    </button>
                    <button onClick={() => moderateDiscussion(d.id, 'delete')} disabled={acting === d.id}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
