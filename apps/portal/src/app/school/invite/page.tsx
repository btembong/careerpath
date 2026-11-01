'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import { joinLink, type SchoolDashboard } from '@/lib/school';
import api from '@/lib/api';

const emailsIn = (text: string) => [...new Set(text.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

export default function SchoolInvitePage() {
  const [d, setD] = useState<SchoolDashboard | null>(null);
  const [enrollmentId, setEnrollmentId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinedWithLink, setJoinedWithLink] = useState<number | null>(null);

  const load = useCallback(() => api.get('/org/school').then(r => {
    setD(r.data);
    setEnrollmentId(id => id || (r.data.packages.find((p: { free: number }) => p.free > 0) ?? r.data.packages[0])?.enrollmentId || '');
  }).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your school')), []);
  useEffect(() => {
    load();
    api.get('/org/school/students').then(r => setJoinedWithLink(r.data.filter((s: { joinedVia: string; status: string }) => s.joinedVia === 'LINK' && s.status === 'joined').length)).catch(() => {});
  }, [load]);

  const pkg = d?.packages.find(p => p.enrollmentId === enrollmentId);
  const list = emailsIn(text);
  const outside = d?.org.emailDomain ? list.filter(e => !e.endsWith(`@${d.org.emailDomain}`)) : [];
  const link = d ? joinLink(d.org.joinCode) : '';

  async function send() {
    setSending(true);
    try {
      const r = await api.post('/org/school/invite', { enrollmentId, emails: list });
      notify.success(`${r.data.invited} invitation${r.data.invited === 1 ? '' : 's'} sent`, { description: r.data.skipped ? `${r.data.skipped} already had an invitation.` : 'They get an email with a link.' });
      setText(''); load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send the invitations'); }
    finally { setSending(false); }
  }
  async function settings(body: { joinEnabled?: boolean; newCode?: boolean }) {
    if (body.newCode && !confirm('Make a new join link? The old link stops working straight away.')) return;
    setBusy(true);
    try { await api.patch('/org/school/settings', body); notify.success(body.newCode ? 'New link ready — share it again' : body.joinEnabled ? 'Join link turned on' : 'Join link turned off'); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not change it'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Invite students" subtitle="By email, or with your school’s join link" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-[22px]">
        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Invite by email</h2>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Package</span>
            <select value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)} className="input-base">
              {d?.packages.map(p => <option key={p.enrollmentId} value={p.enrollmentId}>{p.name} · {p.free} seat{p.free === 1 ? '' : 's'} free</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Student emails</span>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder={`One per line, or separated by commas${d?.org.emailDomain ? ` (ending in @${d.org.emailDomain})` : ''}`} className="input-base min-h-[130px] py-2" /></label>
          {outside.length > 0 && <p className="rounded-md border border-dashed border-azure px-3 py-2 text-[12.5px] text-ink2">{outside.length} don’t end in @{d!.org.emailDomain}: {outside.slice(0, 3).join(', ')}{outside.length > 3 ? '…' : ''}. <Link href="/school/settings" className="font-semibold text-azure-strong hover:underline">Change the allowed domain</Link></p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted">{list.length} invite{list.length === 1 ? '' : 's'}{pkg ? ` · ${Math.max(0, pkg.free - list.length)} seats left after this` : ''}</span>
            <Button size="sm" onClick={send} loading={sending} disabled={!list.length || !pkg || list.length > pkg.free || outside.length > 0}>Send invites</Button>
          </div>
          {pkg && list.length > pkg.free && <p className="text-[12.5px] text-azure-strong">Only {pkg.free} seat{pkg.free === 1 ? '' : 's'} left on this package.</p>}
          <p className="text-[12.5px] text-muted">Each student gets an email with a link. They sign up with that email and the package is theirs.</p>
        </section>

        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Or share a join link</h2>
          <p className="text-[13.5px] text-ink2">Anyone with the link who signs up takes a free seat, until they run out. Good for a class WhatsApp group.</p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Join link" className="input-base h-10 min-w-0 flex-1 bg-subtle" />
            <button onClick={() => navigator.clipboard.writeText(link).then(() => notify.success('Link copied')).catch(() => {})} disabled={!d?.org.joinEnabled} className="inline-flex h-10 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Copy</button>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[13px] text-navy">
            <span>Link is <strong>{d?.org.joinEnabled ? 'on' : 'off'}</strong>{joinedWithLink != null ? ` · ${joinedWithLink} joined with it` : ''}</span>
            <span className="font-semibold">
              <button onClick={() => settings({ joinEnabled: !d?.org.joinEnabled })} disabled={busy || !d} className="text-azure-strong hover:underline disabled:opacity-50">{d?.org.joinEnabled ? 'Turn off' : 'Turn on'}</button>
              {' · '}
              <button onClick={() => settings({ newCode: true })} disabled={busy || !d} className="text-azure-strong hover:underline disabled:opacity-50">New link</button>
            </span>
          </div>
          <p className="text-[12.5px] text-muted">{d?.org.emailDomain ? <>Only students whose email ends in <strong className="text-navy">@{d.org.emailDomain}</strong> can use it </> : 'Anyone can use it '}(<Link href="/school/settings" className="font-semibold text-azure-strong hover:underline">change in Settings</Link>).</p>
        </section>
      </div>
    </div>
  );
}
