'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Sent { id: string; title: string; body: string; audience: string; channel: string; sentAt: string; recipientCount: number; countryId: string | null }
interface Country { id: string; name: string }

const AUDIENCES: [string, string][] = [['ALL', 'Everyone'], ['STUDENT', 'Students'], ['TEACHER', 'Teachers'], ['SUBJECT_REVIEWER', 'Reviewers'], ['COUNTRY_REP', 'Reps']];
const CHANNELS: [string, string][] = [['IN_APP', 'In the portal'], ['BOTH', 'Portal and email'], ['EMAIL', 'Email only']];
const label = (pairs: [string, string][], k: string) => pairs.find(p => p[0] === k)?.[1] ?? k;

export default function AdminNotificationsPage() {
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [audience, setAudience] = useState('STUDENT');
  const [countryId, setCountryId] = useState('');
  const [channel, setChannel] = useState('IN_APP');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reach, setReach] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const load = () => api.get('/notifications/admin/broadcasts').then(r => setSent(r.data ?? [])).catch(() => setSent([]));
  useEffect(() => { load(); api.get('/countries/admin/countries').then(r => setCountries(r.data ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    setReach(null);
    api.get('/notifications/admin/broadcasts/reach', { params: { audience, ...(countryId ? { countryId } : {}) } }).then(r => setReach(r.data.count)).catch(() => {});
  }, [audience, countryId]);

  const who = `${label(AUDIENCES, audience).toLowerCase()}${countryId ? ` in ${countries.find(c => c.id === countryId)?.name ?? ''}` : ''}`;
  async function send() {
    if (!confirm(`Send “${title.trim()}” to ${reach ?? 'all'} ${who}? This can’t be undone.`)) return;
    setSending(true);
    try {
      const r = await api.post('/notifications/admin/broadcasts', { title: title.trim(), body: body.trim(), audience, channel, ...(countryId ? { countryId } : {}) });
      notify.success(`Sent to ${r.data.recipientCount} ${r.data.recipientCount === 1 ? 'person' : 'people'}`);
      setTitle(''); setBody(''); load();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not send it').join(', ')); }
    finally { setSending(false); }
  }

  const pill = (on: boolean) => clsx('rounded-full px-3 py-1.5 text-[13px]', on ? 'bg-navy font-semibold text-white' : 'border border-line text-navy hover:bg-subtle');
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Notifications" subtitle="Announcements to students, teachers or a whole country" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Send an announcement</h2>
          <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Who gets it</span>
            <div role="radiogroup" aria-label="Who gets it" className="flex flex-wrap gap-1.5">{AUDIENCES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={audience === k} onClick={() => setAudience(k)} className={pill(audience === k)}>{l}</button>)}</div>
          </div>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Country</span>
            <select value={countryId} onChange={e => setCountryId(e.target.value)} className="input-base"><option value="">All countries</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Title</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="e.g. WASSCE mock exam this Saturday" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Message</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={4} placeholder="What do they need to know, and what should they do?" className="input-base min-h-[100px] py-2" /></label>
          <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">How</span>
            <div role="radiogroup" aria-label="How" className="flex flex-wrap gap-1.5">{CHANNELS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={channel === k} onClick={() => setChannel(k)} className={pill(channel === k)}>{l}</button>)}</div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted">{reach == null ? 'Counting…' : `Goes to ${reach.toLocaleString('en-GB')} ${who}`}{channel !== 'IN_APP' ? ' · email only to people who allow news emails' : ''}</span>
            <Button size="sm" onClick={send} loading={sending} disabled={!title.trim() || !body.trim() || !reach}>Send</Button>
          </div>
        </section>
        <section className="min-w-0 flex-[1_1_420px] rounded-lg border border-line bg-white">
          <h2 className="border-b border-line px-[18px] py-3.5 text-[16px] font-bold text-navy">Sent</h2>
          {!sent ? <div className="m-4 h-32 animate-pulse rounded bg-subtle" /> : sent.length ? sent.map(b => (
            <div key={b.id} className="border-b border-line px-[18px] py-[13px] last:border-b-0">
              <div className="flex gap-2.5"><p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">{b.title}</p><span className="shrink-0 text-[12.5px] text-muted">{new Date(b.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
              <p className="mt-0.5 text-[13px] text-ink2">{b.body}</p>
              <p className="mt-1 text-[12px] text-muted">{label(AUDIENCES, b.audience)}{b.countryId ? ` in ${countries.find(c => c.id === b.countryId)?.name ?? 'one country'}` : ''} · {b.recipientCount.toLocaleString('en-GB')} reached · {label(CHANNELS, b.channel).toLowerCase()}</p>
            </div>
          )) : <p className="px-[18px] py-8 text-center text-[13px] text-ink2">Nothing sent yet.</p>}
        </section>
      </div>
    </div>
  );
}
