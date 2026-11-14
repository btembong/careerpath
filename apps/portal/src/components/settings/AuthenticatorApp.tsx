'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/Button';
import { CodeBoxes } from '@/components/auth/AuthShell';

export interface AppStatus { available: boolean; enabled: boolean; enabledAt: string | null; backupLeft: number; required: boolean; dueAt: string | null; overdue: boolean }

const btnLine = 'inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

export function useAppStatus() {
  const [s, setS] = useState<AppStatus | null>(null);
  const load = () => api.get('/auth/me/authenticator').then(r => setS(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  return [s, load] as const;
}

/**
 * Settings → Sign-in and security → Authenticator app: set it up (scan, confirm a code, save backup codes),
 * then new backup codes, move to a new phone, or switch it off (not admins).
 */
export function AuthenticatorApp({ status, reload }: { status: AppStatus; reload: () => void }) {
  const [step, setStep] = useState<'idle' | 'scan' | 'codes' | 'confirm-backup' | 'confirm-off'>('idle');
  const [setup, setSetup] = useState<{ qr: string; key: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true); setError('');
    try { const r = await api.post('/auth/me/authenticator/start'); setSetup(r.data); setCode(''); setStep('scan'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start'); } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/auth/me/authenticator/confirm', { code }); setCodes(r.data.backupCodes); setStep('codes'); setSetup(null); reload(); }
    catch (err: any) { setError(err?.response?.data?.message ?? 'That code isn’t right.'); setCode(''); } finally { setBusy(false); }
  }
  async function withCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (step === 'confirm-backup') { const r = await api.post('/auth/me/authenticator/backup-codes', { code }); setCodes(r.data.backupCodes); setStep('codes'); }
      else { await api.post('/auth/me/authenticator/off', { code }); notify.success('Authenticator app switched off'); setStep('idle'); }
      reload();
    } catch (err: any) { setError(err?.response?.data?.message ?? 'That code isn’t right.'); setCode(''); } finally { setBusy(false); }
  }
  function copy() {
    if (!codes) return;
    navigator.clipboard.writeText(codes.join('\n')).then(() => notify.success('Backup codes copied')).catch(() => notify.error('Could not copy. Select them and copy by hand.'));
  }
  function download() {
    if (!codes) return;
    const blob = new Blob([`CareerPath Africa backup codes\nEach works once, instead of a code from your authenticator app.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'careerpath-backup-codes.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const due = status.dueAt && !status.enabled ? day(status.dueAt) : null;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <strong className="block text-[14px] text-navy">Authenticator app</strong>
          <span className="text-xs text-muted">
            {status.enabled ? `On since ${day(status.enabledAt!)} · ${status.backupLeft} backup code${status.backupLeft === 1 ? '' : 's'} left`
              : 'Google Authenticator, Microsoft Authenticator or Authy: a new code every 30 seconds, even offline'}
          </span>
        </span>
        {status.enabled ? <span className="rounded-md bg-[#E3F5EA] px-2 py-1 text-xs font-bold text-[#17703A]">On</span>
          : status.required ? <span className={clsx('rounded-md px-2 py-1 text-xs font-bold', status.overdue ? 'bg-[#FDF1F0] text-[#C1352B]' : 'bg-[#FFF1D6] text-[#8A5A00]')}>{status.overdue ? 'Required now' : `Required from ${due}`}</span> : null}
        {step === 'idle' && !status.enabled && <Button size="sm" onClick={start} loading={busy}>Set up</Button>}
      </div>

      {step === 'idle' && status.enabled && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          <button onClick={() => { setStep('confirm-backup'); setCode(''); setError(''); }} className={btnLine}>New backup codes</button>
          <button onClick={start} disabled={busy} className={btnLine}>Move to a new phone</button>
          {!status.required && <button onClick={() => { setStep('confirm-off'); setCode(''); setError(''); }} className="inline-flex h-9 items-center rounded-md px-2 text-[13.5px] font-semibold text-[#C1352B] hover:underline">Switch off</button>}
        </div>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={confirm} className="flex flex-col gap-4 border-t border-[#BFD0FA] bg-[#FAFBFF] px-4 py-4">
          <div className="flex flex-wrap items-start gap-5">
            <img src={setup.qr} alt="QR code to scan with your authenticator app" width={180} height={180} className="rounded-lg border border-line bg-white p-1.5" />
            <ol className="flex min-w-[220px] flex-1 list-decimal flex-col gap-2 pl-5 text-[13.5px] text-ink2">
              <li>Open your authenticator app (Google Authenticator, Microsoft Authenticator or Authy) and tap <strong className="text-navy">+</strong>.</li>
              <li>Scan this code. Can’t scan? Choose “Enter a setup key” and type:
                <span className="mt-1.5 block w-fit select-all rounded-md bg-white px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-wider text-navy ring-1 ring-line">{setup.key}</span>
              </li>
              <li>Type the six-digit code the app now shows for <strong className="text-navy">CareerPath Africa</strong>.</li>
            </ol>
          </div>
          <div className="max-w-[360px]"><CodeBoxes value={code} onChange={setCode} /></div>
          {error && <p className="text-[13px] font-semibold text-[#C1352B]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={code.length < 6}>{status.enabled ? 'Move to this phone' : 'Switch on'}</Button>
            <button type="button" onClick={() => { setStep('idle'); setSetup(null); }} className={btnLine}>Cancel</button>
          </div>
        </form>
      )}

      {step === 'codes' && codes && (
        <div className="flex flex-col gap-3 border-t border-[#BFD0FA] bg-[#FAFBFF] px-4 py-4">
          <div>
            <strong className="block text-[14px] text-navy">Save your backup codes</strong>
            <span className="text-[13px] text-ink2">If you lose your phone, each of these signs you in once. We show them only now: print them, or keep them somewhere safe that isn’t this phone.</span>
          </div>
          <div className="grid w-fit grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-white px-4 py-3 font-mono text-[14px] font-bold tracking-wider text-navy ring-1 ring-line">
            {codes.map(c => <span key={c}>{c}</span>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className={btnLine}>Copy</button>
            <button onClick={download} className={btnLine}>Download</button>
            <Button size="sm" onClick={() => { setCodes(null); setStep('idle'); }}>I’ve saved them</Button>
          </div>
        </div>
      )}

      {(step === 'confirm-backup' || step === 'confirm-off') && (
        <form onSubmit={withCode} className="flex flex-col gap-3 border-t border-[#BFD0FA] bg-[#FAFBFF] px-4 py-4">
          <span className="text-[13.5px] text-ink2">{step === 'confirm-backup' ? 'Type a code from your app. Your old backup codes stop working.' : 'Type a code from your app to switch it off. Signing in will then only ask for your password.'}</span>
          <div className="max-w-[360px]"><CodeBoxes value={code} onChange={setCode} /></div>
          {error && <p className="text-[13px] font-semibold text-[#C1352B]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {step === 'confirm-off'
              ? <button type="submit" disabled={busy || code.length < 6} className="inline-flex h-9 items-center rounded-md bg-[#C1352B] px-3.5 text-[13.5px] font-bold text-white disabled:opacity-50">Switch off</button>
              : <Button type="submit" size="sm" loading={busy} disabled={code.length < 6}>Make new codes</Button>}
            <button type="button" onClick={() => setStep('idle')} className={btnLine}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
