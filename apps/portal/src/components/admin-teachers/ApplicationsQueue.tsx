'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Flag } from '@/components/ui/Flag';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { initialsOf } from './TeacherDrawer';

export interface Application {
  id: string; email: string; status: 'PENDING' | 'REJECTED'; avatarUrl: string | null; country: { id: string; code: string; name: string } | null;
  name: string; phone: string | null; subjects: string[]; yearsExperience: number | null; qualification: string | null; modality: string | null;
  bio: string | null; cv: string | null; linkedin: string | null; website: string | null; rejectionReason: string | null;
  submittedAt: string; daysWaiting: number; question: string | null; questionAskedAt: string | null;
  coverage: { subject: string; teachers: number }[];
}

const QUAL: Record<string, string> = { HIGH_SCHOOL: 'High school', BACHELOR: 'Bachelor’s', MASTER: 'Master’s', PHD: 'PhD', PROFESSIONAL: 'Professional certificate' };
const MODE: Record<string, string> = { ONLINE: 'Online', IN_PERSON: 'In person', HYBRID: 'Online and in person' };
const REASONS = [
  'Thank you for applying. We need teachers with at least two years of classroom or tutoring experience, so we can’t approve your application yet. You’re welcome to apply again later.',
  'Thank you for applying. We already have enough teachers for this subject in your country, so we can’t take on more right now. We’ll keep your details in case that changes.',
  'Thank you for applying. Your application didn’t include a CV, which we need to review it. Please apply again with your CV attached.',
];
const short = (s: string) => s.replace('Core Mathematics', 'Core Maths').replace('Further Mathematics', 'Further Maths').replace('Elective Mathematics', 'Elective Maths');
const tag = 'inline-flex h-[22px] items-center rounded-[5px] px-2 text-[11.5px] font-extrabold whitespace-nowrap';
const daysTag = (n: number) => clsx(tag, n >= 3 ? 'bg-[#FFF1D6] text-[#8A5A00]' : 'bg-[#EAF0FF] text-[#2F57C9]');

/** Applications side by side: the list on the left, oldest first; the whole application on the right, decided in place */
export function ApplicationsQueue({ apps, rejected, onChanged }: { apps: Application[]; rejected?: boolean; onChanged: () => Promise<void> }) {
  const [sel, setSel] = useState<string | null>(apps[0]?.id ?? null);
  const [phoneDetail, setPhoneDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const i = Math.max(0, apps.findIndex(a => a.id === sel));
  const a = apps[i] ?? null;

  useEffect(() => { if (!apps.some(x => x.id === sel)) setSel(apps[0]?.id ?? null); }, [apps, sel]);
  // ↑ and ↓ move through the list when you're not typing
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (rejecting || asking || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = Math.min(apps.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
        setSel(apps[n]?.id ?? null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [apps, i, rejecting, asking]);

  const next = () => apps[i + 1]?.id ?? apps[i - 1]?.id ?? null;
  async function decide(decision: 'approve' | 'reject', reason?: string) {
    if (!a) return;
    setBusy(true);
    const after = next();
    try {
      await api.patch(`/portals/admin/teachers/${a.id}/approve`, { decision, rejectionReason: reason || undefined });
      notify.success(decision === 'approve' ? `${a.name} approved` : 'Application turned down', { description: decision === 'approve' ? 'They’ve been emailed, and sign the agreement on their first visit.' : 'Your reason was emailed to them.' });
      setRejecting(false); setText(''); setSel(after); await onChanged();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'That didn’t work'); }
    finally { setBusy(false); }
  }
  async function ask() {
    if (!a) return;
    setBusy(true);
    try {
      await api.post(`/portals/admin/teachers/${a.id}/ask`, { question: text });
      notify.success('Question sent', { description: 'Their reply comes to the teachers mailbox. The application now shows “Waiting for them”.' });
      setAsking(false); setText(''); await onChanged();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send it'); }
    finally { setBusy(false); }
  }

  if (!apps.length) return <p className="px-4 py-12 text-center text-[13px] text-ink2">{rejected ? 'No turned-down applications.' : 'No applications waiting. New teacher applications appear here.'}</p>;
  const waiting = apps.filter(x => !x.questionAskedAt).length;

  return (
    <div className="grid md:grid-cols-[330px_minmax(0,1fr)]">
      <div className={clsx('border-line md:border-r', phoneDetail && 'hidden md:block')}>
        <p className="border-b border-line px-4 py-2.5 text-[12.5px] text-muted"><b className="text-navy">{rejected ? `${apps.length} turned down` : `${waiting} waiting`}</b>{!rejected && apps.length > waiting ? ` · ${apps.length - waiting} waiting for them` : ''} · oldest first</p>
        {apps.map(x => (
          <button key={x.id} type="button" onClick={() => { setSel(x.id); setPhoneDetail(true); }} aria-current={x.id === a?.id ? 'true' : undefined}
            className={clsx('flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left', x.id === a?.id ? 'border-l-[3px] border-l-[#2F57C9] bg-[#F7F9FF] pl-[13px]' : 'hover:bg-subtle')}>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-soft text-[13px] font-extrabold text-azure-strong">
              {x.avatarUrl ? <img src={x.avatarUrl} alt="" className="h-full w-full object-cover" /> : initialsOf(x.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[14px] font-bold text-navy"><span className="truncate">{x.name}</span><Flag code={x.country?.code} title={x.country?.name} /></span>
              <span className="block truncate text-xs text-muted">{[x.subjects.slice(0, 2).map(short).join(', ') + (x.subjects.length > 2 ? ` +${x.subjects.length - 2}` : ''), x.yearsExperience != null ? `${x.yearsExperience} yr${x.yearsExperience === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}{!x.cv && <span className="text-[#B42318]"> · no CV</span>}</span>
            </span>
            {rejected ? null : x.questionAskedAt ? <span className={clsx(tag, 'bg-subtle text-ink2')}>Asked</span> : <span className={daysTag(x.daysWaiting)}>{x.daysWaiting} d</span>}
          </button>
        ))}
      </div>

      {a && (
        <div className={clsx('flex min-w-0 flex-col gap-4 p-4 sm:p-6', !phoneDetail && 'hidden md:flex')}>
          <button type="button" onClick={() => setPhoneDetail(false)} className="-mb-1 self-start text-[13px] font-bold text-azure-strong md:hidden">‹ All applications</button>
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <TeacherPhoto src={a.avatarUrl} name={a.name} size="row" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-muted">
                Application{a.country && <> · <Flag code={a.country.code} title={a.country.name} /> {a.country.name}</>} · applied {new Date(a.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {a.daysWaiting === 0 ? 'today' : `${a.daysWaiting} day${a.daysWaiting === 1 ? '' : 's'} ago`}
              </p>
              <p className="mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-navy">{a.name}</p>
              <p className="mt-0.5 text-[13.5px] text-ink2">{[a.email, a.phone, a.modality ? MODE[a.modality] ?? a.modality : null].filter(Boolean).join(' · ')}</p>
            </div>
            {a.cv && <a href={a.cv} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-bold text-navy hover:bg-subtle">Open CV ↗</a>}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-lg bg-subtle p-2.5"><p className="text-[11.5px] text-muted">Subjects</p><p className="mt-0.5 text-[14px] font-extrabold text-navy">{a.subjects.map(short).join(', ') || '—'}</p></div>
            <div className="rounded-lg bg-subtle p-2.5"><p className="text-[11.5px] text-muted">Experience</p><p className={clsx('mt-0.5 text-[14px] font-extrabold', a.yearsExperience != null ? 'text-navy' : 'text-muted')}>{a.yearsExperience != null ? `${a.yearsExperience} year${a.yearsExperience === 1 ? '' : 's'}` : 'Not given'}</p></div>
            <div className="rounded-lg bg-subtle p-2.5"><p className="text-[11.5px] text-muted">Qualification</p><p className={clsx('mt-0.5 text-[14px] font-extrabold', a.qualification ? 'text-navy' : 'text-muted')}>{a.qualification ? QUAL[a.qualification] ?? a.qualification : 'Not given'}</p></div>
            <div className="rounded-lg bg-subtle p-2.5"><p className="text-[11.5px] text-muted">Teachers already in {a.country?.code ?? 'their country'}</p>
              {a.coverage.length ? a.coverage.slice(0, 3).map(c => <p key={c.subject} className="mt-0.5 text-[13px] font-extrabold text-navy">{short(c.subject)}: <span className={c.teachers ? '' : 'text-[#17703A]'}>{c.teachers || 'none yet'}</span></p>)
                : <p className="mt-0.5 text-[13px] font-extrabold text-muted">{a.country ? '—' : 'No country set'}</p>}
            </div>
          </div>

          {a.bio && <div><p className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">About</p><p className="whitespace-pre-line text-[14px] leading-relaxed text-ink2">{a.bio}</p></div>}

          <div className="flex flex-wrap gap-1.5">
            <span className={clsx(tag, a.cv ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-[#FDE8E8] text-[#B42318]')}>{a.cv ? 'CV attached' : 'No CV'}</span>
            {a.yearsExperience == null && <span className={clsx(tag, 'bg-[#FFF1D6] text-[#8A5A00]')}>No years of experience</span>}
            {!a.country && <span className={clsx(tag, 'bg-[#FFF1D6] text-[#8A5A00]')}>No country</span>}
            {a.linkedin && <a href={a.linkedin} target="_blank" rel="noreferrer" className={clsx(tag, 'bg-[#EAF0FF] text-[#2F57C9]')}>LinkedIn ↗</a>}
            {a.website && <a href={a.website} target="_blank" rel="noreferrer" className={clsx(tag, 'bg-[#EAF0FF] text-[#2F57C9]')}>Website ↗</a>}
          </div>

          {a.question && (
            <div className="rounded-md border border-line border-l-[3px] border-l-[#3F6FE8] bg-subtle px-3.5 py-2.5 text-[13.5px]">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">Waiting for them · asked {new Date(a.questionAskedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              <p className="mt-1 text-navy">{a.question}</p>
              <p className="mt-1 text-xs text-muted">Their reply comes to the teachers mailbox.</p>
            </div>
          )}
          {rejected && a.rejectionReason && <div className="rounded-md border border-line bg-subtle px-3.5 py-2.5 text-[13.5px] text-ink2"><b className="text-navy">Reason sent:</b> {a.rejectionReason}</div>}

          {!rejected && (
            <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button size="sm" loading={busy && !rejecting && !asking} onClick={() => decide('approve')}>{apps.length > 1 ? 'Approve and open next' : 'Approve'}</Button>
              <Button size="sm" variant="secondary" className="!text-[#B42318]" onClick={() => { setText(''); setRejecting(true); }}>Reject…</Button>
              <Button size="sm" variant="secondary" onClick={() => { setText(''); setAsking(true); }}>{a.questionAskedAt ? 'Ask again' : 'Ask a question'}</Button>
              <span className="flex-1" />
              <span className="hidden text-[12.5px] text-muted md:inline">{i + 1} of {apps.length} · ↑ ↓ to move</span>
            </div>
          )}
        </div>
      )}

      <Dialog open={rejecting} onOpenChange={o => { if (!o) setRejecting(false); }}>
        {rejecting && a && (
          <DialogContent title="Turn down this application" description={`${a.name}: the reason is emailed to them`}>
            <div className="flex flex-col gap-1.5">
              <p className="text-[12.5px] font-semibold text-muted">Start from</p>
              {REASONS.map((r, k) => (
                <button key={k} type="button" onClick={() => setText(r)} className={clsx('rounded-md border px-3 py-2 text-left text-[13px]', text === r ? 'border-azure bg-accent-soft text-navy' : 'border-line text-ink2 hover:bg-subtle')}>
                  {['Needs more classroom experience', 'Subject is full in their country', 'CV missing'][k]}
                </button>
              ))}
            </div>
            <textarea rows={4} maxLength={500} value={text} onChange={e => setText(e.target.value)} aria-label="Reason" placeholder="Write the reason, or start from one above and edit it"
              className="mt-2 w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
            <p className="text-xs text-muted">{text.length} / 500</p>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
              <Button size="sm" variant="danger" loading={busy} onClick={() => decide('reject', text.trim())}>Turn down</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={asking} onOpenChange={o => { if (!o) setAsking(false); }}>
        {asking && a && (
          <DialogContent title={`Ask ${a.name.split(' ')[0]} a question`} description="Emailed to them now. Their reply comes to the teachers mailbox, and the application shows “Waiting for them” until you decide.">
            <textarea rows={5} maxLength={1500} value={text} onChange={e => setText(e.target.value)} aria-label="Question" autoFocus
              placeholder="For example: which exam boards have you prepared students for, and for how long?"
              className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
              <Button size="sm" loading={busy} disabled={text.trim().length < 5} onClick={ask}>Send the question</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
