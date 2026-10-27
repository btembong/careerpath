'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

type AudienceType = 'ALL' | 'STUDENT' | 'TEACHER' | 'COUNTRY_REP' | 'SUBJECT_REVIEWER';
type ChannelType  = 'IN_APP' | 'EMAIL' | 'BOTH';

interface SentNotification {
  id: string;
  title: string;
  body: string;
  audience: string;
  channel: string;
  sentAt: string;
  recipientCount: number | null;
}

const AUDIENCE_OPTIONS: { value: AudienceType; label: string }[] = [
  { value: 'ALL',              label: 'All users'       },
  { value: 'STUDENT',         label: 'Students only'   },
  { value: 'TEACHER',         label: 'Teachers only'   },
  { value: 'COUNTRY_REP',     label: 'Country Reps'    },
  { value: 'SUBJECT_REVIEWER',label: 'Reviewers'       },
];

const CHANNEL_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: 'IN_APP', label: 'In-app notification' },
  { value: 'EMAIL',  label: 'Email only'          },
  { value: 'BOTH',   label: 'In-app + Email'      },
];

export default function AdminNotificationsPage() {
  const [history, setHistory] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [audience, setAudience] = useState<AudienceType>('ALL');
  const [channel,  setChannel]  = useState<ChannelType>('IN_APP');
  const [countryId, setCountryId] = useState('');
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/notifications/admin/broadcasts').catch(() => ({ data: [] })),
      api.get('/countries/admin/countries').catch(() => ({ data: [] })),
    ]).then(([hr, cr]) => {
      setHistory(hr.data ?? []);
      setCountries(cr.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      await api.post('/notifications/admin/broadcasts', {
        title: title.trim(),
        body: body.trim(),
        audience,
        channel,
        ...(countryId && { countryId }),
      });
      notify.success('Notification sent');
      setTitle(''); setBody(''); setAudience('ALL'); setChannel('IN_APP'); setCountryId('');
      const r = await api.get('/notifications/admin/broadcasts').catch(() => ({ data: [] }));
      setHistory(r.data ?? []);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to send notification');
    } finally { setSending(false); }
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

  const audienceLabel = (a: string) => AUDIENCE_OPTIONS.find(o => o.value === a)?.label ?? a;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Notifications" subtitle="Send platform-wide announcements to users" />

      <div className="flex-1 p-6 space-y-6 max-w-4xl w-full mx-auto">

        {/* Compose form */}
        <Card padding="none" className="overflow-hidden">
          <div className="bg-navy px-6 py-4">
            <p className="text-sm font-bold text-white">Compose broadcast</p>
            <p className="text-xs text-white/40 mt-0.5">Send a notification to a segment of your users</p>
          </div>
          <form onSubmit={sendBroadcast} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="New course available in your programme"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Message *</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  required
                  rows={3}
                  placeholder="We've just added new lessons to your programme. Log in to check them out…"
                  className="w-full rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-azure resize-none placeholder:text-royal/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Audience</label>
                <Select
                  value={audience}
                  onValueChange={v => setAudience(v as AudienceType)}
                  options={AUDIENCE_OPTIONS}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">Channel</label>
                <Select
                  value={channel}
                  onValueChange={v => setChannel(v as ChannelType)}
                  options={CHANNEL_OPTIONS}
                />
              </div>

              {(audience === 'STUDENT' || audience === 'ALL') && countries.length > 0 && (
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-royal/50">
                    Filter by country <span className="font-normal">(optional — leave blank for all countries)</span>
                  </label>
                  <Select
                    value={countryId}
                    onValueChange={setCountryId}
                    placeholder="— All countries —"
                    options={countries.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>
              )}
            </div>

            {/* Preview */}
            {(title || body) && (
              <div className="rounded-xl border border-azure/20 bg-azure/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-2">Preview</p>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-navy text-sm font-black text-white">C</span>
                  <div>
                    <p className="text-sm font-bold text-navy">{title || 'Notification title'}</p>
                    <p className="text-xs text-royal/60 mt-0.5 leading-relaxed">{body || 'Message body'}</p>
                    <p className="text-[10px] text-royal/30 mt-1">→ {audienceLabel(audience)}{countryId ? ` · ${countries.find(c => c.id === countryId)?.name}` : ''} · {CHANNEL_OPTIONS.find(o => o.value === channel)?.label}</p>
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" loading={sending}>
              <Icon name="live" size={14} /> Send notification
            </Button>
          </form>
        </Card>

        {/* Sent history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">SENT NOTIFICATIONS</p>
            <p className="text-[10px] text-royal/40">{history.length} total</p>
          </div>

          {history.length === 0 ? (
            <Card padding="lg">
              <div className="flex flex-col items-center py-10 text-center">
                <Icon name="live" size={28} className="text-royal/20 mb-2" />
                <p className="text-sm font-semibold text-navy">No broadcasts sent yet</p>
                <p className="text-xs text-royal/40 mt-1">Your sent notifications will appear here</p>
              </div>
            </Card>
          ) : (
            <Card padding="none">
              <ul className="divide-y divide-cloud">
                {history.map(n => (
                  <li key={n.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10 text-azure">
                      <Icon name="live" size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy">{n.title}</p>
                      <p className="text-xs text-royal/60 mt-0.5 line-clamp-1">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="muted" className="text-[9px]">{audienceLabel(n.audience)}</Badge>
                        <Badge variant="default" className="text-[9px]">{n.channel}</Badge>
                        {n.recipientCount != null && (
                          <span className="text-[10px] text-royal/40">{n.recipientCount} recipients</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-royal/30 flex-shrink-0 mt-0.5">
                      {new Date(n.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
