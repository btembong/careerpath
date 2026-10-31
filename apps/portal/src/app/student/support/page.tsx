'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Ticket { id: string; category: string; subject: string; message: string; status: string; adminNote: string | null; createdAt: string; updatedAt: string }

const TOPICS = ['Payment', 'Access to a course', 'Course content', 'Technical problem', 'Something else'];
const STATUS: Record<string, { label: string; style: string }> = {
  OPEN: { label: 'Open', style: 'border border-dashed border-azure text-azure-strong' },
  IN_PROGRESS: { label: 'Being looked at', style: 'border border-dashed border-azure text-azure-strong' },
  RESOLVED: { label: 'Answered', style: 'bg-accent-soft text-navy' },
  CLOSED: { label: 'Closed', style: 'border border-line text-ink2' },
};
const date = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => api.get('/support/tickets/mine').then(r => setTickets(r.data ?? [])).catch(() => setTickets([]));
  useEffect(() => { load(); }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      await api.post('/support/tickets', { category: topic, subject: subject.trim(), message: message.trim() });
      notify.success('Sent', { description: 'We answer within a working day — the reply shows here.' });
      setSubject(''); setMessage(''); load();
    } catch (err: any) { notify.error(err?.response?.data?.message?.[0] ?? err?.response?.data?.message ?? 'Could not send it'); }
    finally { setSending(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Support" subtitle="Ask us anything about payments, access or your courses" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <form onSubmit={send} className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Ask for help</h2>
          <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-1.5">
            {TOPICS.map(t => (
              <button key={t} type="button" role="radio" aria-checked={topic === t} onClick={() => setTopic(t)}
                className={clsx('rounded-full px-3 py-1.5 text-[13px]', topic === t ? 'bg-navy font-semibold text-white' : 'border border-line text-navy hover:bg-subtle')}>{t}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} required placeholder={topic === 'Payment' ? 'e.g. Paid but can’t open WASSCE Maths' : 'In a few words'} className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">What happened?</span>
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} required rows={5}
              placeholder={topic === 'Payment' ? 'Include your receipt number (it’s on Billing) and how you paid.' : 'Tell us what you did and what you saw.'} className="input-base min-h-[120px] py-2" /></label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted">We answer within a working day.</span>
            <Button type="submit" size="sm" loading={sending} disabled={!subject.trim() || !message.trim()}>Send</Button>
          </div>
        </form>

        <section className="min-w-0 flex-[1_1_420px] rounded-lg border border-line bg-white">
          <h2 className="border-b border-line px-[18px] py-3.5 text-[16px] font-bold text-navy">Your requests</h2>
          {!tickets ? <div className="m-4 h-32 animate-pulse rounded bg-subtle" /> : tickets.length ? tickets.map(t => {
            const st = STATUS[t.status] ?? STATUS.OPEN;
            return (
              <div key={t.id} className="flex flex-col gap-1.5 border-b border-line px-[18px] py-3.5 last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">{t.subject}</p>
                  <span className={clsx('inline-flex h-[22px] shrink-0 items-center rounded px-2 text-[12px] font-semibold', st.style)}>{st.label}</span>
                </div>
                <p className="text-[12.5px] text-muted">{t.category} · {date(t.createdAt)}</p>
                <p className="text-[13px] text-ink2">{t.message}</p>
                {t.adminNote && <p className="mt-0.5 rounded-md bg-subtle px-3 py-2.5 text-[13px] text-ink2"><strong className="text-navy">CareerPath:</strong> {t.adminNote}</p>}
              </div>
            );
          }) : <p className="px-[18px] py-8 text-center text-[13px] text-ink2">No requests yet.</p>}
        </section>
      </div>
    </div>
  );
}
