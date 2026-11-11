'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import { useAuth } from '@/hooks/useAuth';
import { applyTextSize, TEXT_SIZE_KEY } from '@/components/providers/DisplayPrefsApplier';
import api from '@/lib/api';
import { AppVersion } from '@/components/ui/AppVersion';
import { PushSettings } from '@/components/push/Push';

interface Me {
  id: string; email: string; role: string; firstName?: string; lastName?: string; phone?: string;
  avatarUrl?: string | null; countryId: string | null; levelId?: string | null; programmeInterestIds?: string[]; createdAt?: string;
}
interface Prefs {
  notifications: Record<string, { inApp: boolean; email: boolean }>;
  kinds: { key: string; label: string; hint: string; email: boolean }[];
  display: { language: string; textSize: string; dataSaver: boolean };
  leaderboardVisible: boolean;
  countries: { id: string; name: string }[];
}
interface Programme { id: string; name: string; shortName: string | null; levels: { id: string; name: string }[] }

type Tab = 'profile' | 'security' | 'notifications' | 'display' | 'data';
/** [key, label, hint, icon path] */
const TABS: [Tab, string, string, string][] = [
  ['profile', 'Profile', 'Name, photo, phone', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
  ['security', 'Sign-in and security', 'Password, sign-in codes', 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4'],
  ['notifications', 'Notifications', 'What we tell you, where', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4'],
  ['display', 'Language and display', 'Language, text size, data saver', 'M3 5h18v12H3zM8 21h8M12 17v4'],
  ['data', 'Your data', 'Download, delete', 'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 6c0 2 16 2 16 0M4 12c0 2 16 2 16 0'],
];
const ROLE_HOME: Record<string, string> = {
  STUDENT: '/student/dashboard', TEACHER: '/teacher/dashboard', ADMIN: '/admin/dashboard',
  COUNTRY_REP: '/country-rep/dashboard', SUBJECT_REVIEWER: '/reviewer/dashboard', ORG_ADMIN: '/school/dashboard',
};
const DATA_SAVER_KEY = 'cpa:dataSaver';

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
const input = 'h-[38px] rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure disabled:bg-subtle disabled:text-muted';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-azure-strong' : 'bg-line')}>
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [me, setMe] = useState<Me | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);

  useEffect(() => {
    // Old links: #account is now #security
    const raw = window.location.hash.slice(1);
    const h = (raw === 'account' ? 'security' : raw) as Tab;
    if (TABS.some(([k]) => k === h)) setTab(h);
    api.get('/auth/me').then(r => setMe(r.data)).catch(() => notify.error('Could not load your account'));
    api.get('/auth/me/preferences').then(r => setPrefs(r.data)).catch(() => {});
    api.get('/catalogue/programmes').then(r => setProgrammes(r.data ?? [])).catch(() => {});
  }, []);

  function pick(k: Tab) { setTab(k); history.replaceState(null, '', `#${k}`); }

  async function savePrefs(patch: Record<string, unknown>, okMsg = 'Saved') {
    try { const r = await api.patch('/auth/me/preferences', patch); setPrefs(r.data); notify.success(okMsg); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Settings" subtitle="Your profile, account, notifications and display"
        backHref={ROLE_HOME[user?.role ?? ''] ?? '/student/dashboard'} backLabel="Dashboard" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <nav aria-label="Settings sections" className="flex flex-[0_0_260px] flex-col gap-0.5 rounded-[10px] border border-line bg-white p-2 max-md:flex-[1_1_100%] max-md:flex-row max-md:overflow-x-auto">
          {TABS.map(([k, l, hint, icon]) => (
            <button key={k} onClick={() => pick(k)} aria-current={tab === k ? 'page' : undefined}
              className={clsx('flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left', tab === k ? 'bg-accent-soft' : 'hover:bg-subtle')}>
              <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', tab === k ? 'bg-[#3F6FE8] text-white' : 'bg-subtle text-[#3F6FE8]')}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={icon} /></svg>
              </span>
              <span className="flex flex-col"><strong className="text-[14px] text-navy">{l}</strong><span className="text-xs text-muted max-md:hidden">{hint}</span></span>
            </button>
          ))}
        </nav>
        <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5 rounded-lg border border-line bg-white p-5">
          {!me ? <div className="h-64 rounded-md bg-subtle animate-pulse" /> : (
            tab === 'profile' ? <ProfilePanel me={me} setMe={setMe} countries={prefs?.countries ?? []} programmes={programmes} />
            : tab === 'security' ? <AccountPanel me={me} />
            : tab === 'notifications' ? <NotificationsPanel prefs={prefs} save={savePrefs} />
            : tab === 'display' ? <><DisplayPanel prefs={prefs} save={savePrefs} isStudent={me.role === 'STUDENT'} /><DataSaverPanel prefs={prefs} save={savePrefs} /></>
            : <YourDataPanel me={me} />
          )}
        </section>
      </div>
    </div>
  );
}

function ProfilePanel({ me, setMe, countries, programmes }: { me: Me; setMe: (m: Me) => void; countries: { id: string; name: string }[]; programmes: Programme[] }) {
  const [f, setF] = useState({ firstName: me.firstName ?? '', lastName: me.lastName ?? '', phone: me.phone ?? '', countryId: me.countryId ?? '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = `${f.firstName} ${f.lastName}`.trim() || me.email;
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const interest = programmes.filter(p => me.programmeInterestIds?.includes(p.id));
  const level = programmes.flatMap(p => p.levels).find(l => l.id === me.levelId);
  const exam = interest.length ? `${interest.map(p => p.shortName ?? p.name).join(', ')}${level ? ` · ${level.name}` : ''}` : 'Not chosen yet';

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api.patch('/auth/me', { firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(), countryId: f.countryId || undefined });
      setMe({ ...me, ...f }); notify.success('Profile saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/files/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url ?? r.data;
      await api.patch('/auth/me', { avatarUrl: url }); setMe({ ...me, avatarUrl: url }); notify.success('Photo updated');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not upload the photo'); } finally { setUploading(false); }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3.5">
      <h2 className="text-base font-bold text-navy">Profile</h2>
      <div className="flex items-center gap-3.5">
        {me.avatarUrl
          ? <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-[10px] object-cover" />
          : <span className="grid h-16 w-16 place-items-center rounded-[10px] bg-accent-soft text-xl font-extrabold text-azure-strong">{initials}</span>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) upload(x); e.target.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-azure-strong hover:underline">{uploading ? 'Uploading…' : 'Change photo'}</button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="First name"><input className={input} value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Last name"><input className={input} value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="Email" hint="Contact support to change it."><input className={input} value={me.email} disabled /></Field>
        <Field label={me.role === 'STUDENT' ? 'Phone (for mobile money)' : 'Phone'}><input className={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+233 24 000 0000" /></Field>
        <Field label="Country">
          <select className={input} value={f.countryId} onChange={e => setF({ ...f, countryId: e.target.value })}>
            <option value="">Choose…</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {me.role === 'STUDENT' && (
          <Field label="Exam I’m preparing for">
            <span className={clsx(input, 'flex items-center gap-2')}><span className="min-w-0 flex-1 truncate">{exam}</span><Link href="/student/preferences" className="text-[13px] font-semibold text-azure-strong">Change</Link></span>
          </Field>
        )}
      </div>
      <div><Button type="submit" size="sm" loading={saving}>Save changes</Button></div>
    </form>
  );
}

function AccountPanel({ me }: { me: Me }) {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { notify.error('Use at least 8 characters'); return; }
    if (pw !== pw2) { notify.error('The new passwords don’t match'); return; }
    setSaving(true);
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: pw }); notify.success('Password changed'); setCur(''); setPw(''); setPw2(''); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not change the password'); } finally { setSaving(false); }
  }
  return (
    <form onSubmit={change} className="flex flex-col gap-3.5">
      <h2 className="text-base font-bold text-navy">Sign-in and security</h2>
      <div className="flex flex-col rounded-md border border-line">
        {[
          ['Email', `${me.email} · where sign-in codes and receipts go`, 'Checked'],
          ['Sign in with an emailed code', 'Always available, even if you forget your password', 'On'],
          ...(me.role === 'ADMIN' ? [['Admin two-step sign-in', 'After your password we email you a code; you can trust a computer for 30 days', 'On']] : []),
        ].map(([t, d, st]) => (
          <div key={t} className="flex flex-wrap items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0">
            <span className="min-w-0 flex-1"><strong className="block text-[13.5px] text-navy">{t}</strong><span className="text-xs text-muted">{d}</span></span>
            <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-bold text-azure-strong">{st}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-1 text-[14px] font-bold text-navy">Change password</h3>
      <dl className="grid gap-2.5 text-[13px] sm:grid-cols-3">
        <div><dt className="text-muted">Signed in as</dt><dd className="font-semibold text-navy">{me.email}</dd></div>
        <div><dt className="text-muted">Account type</dt><dd className="font-semibold capitalize text-navy">{me.role.replace('_', ' ').toLowerCase()}</dd></div>
        {me.createdAt && <div><dt className="text-muted">Member since</dt><dd className="font-semibold text-navy">{new Date(me.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</dd></div>}
      </dl>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Current password"><input type="password" className={input} value={cur} onChange={e => setCur(e.target.value)} required autoComplete="current-password" /></Field>
        <span className="max-sm:hidden" />
        <Field label="New password" hint="At least 8 characters."><input type="password" className={input} value={pw} onChange={e => setPw(e.target.value)} required autoComplete="new-password" /></Field>
        <Field label="New password again"><input type="password" className={input} value={pw2} onChange={e => setPw2(e.target.value)} required autoComplete="new-password" /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" loading={saving}>Change password</Button><span className="text-xs text-muted">Forgot the current one? Sign out and use “Forgot it?”.</span></div>
    </form>
  );
}

function NotificationsPanel({ prefs, save }: { prefs: Prefs | null; save: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  if (!prefs) return <div className="h-64 rounded-md bg-subtle animate-pulse" />;
  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-base font-bold text-navy">Notifications</h2>
      <div className="rounded-md border border-line">
        <div className="flex items-center gap-3 border-b border-line px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          <span className="flex-1">What</span><span className="w-14 text-center">In app</span><span className="w-14 text-center">Email</span>
        </div>
        {prefs.kinds.map(k => {
          const v = prefs.notifications[k.key];
          return (
            <div key={k.key} className="flex items-center gap-3 border-t border-line px-3.5 py-3 first-of-type:border-t-0">
              <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold text-navy">{k.label}</p><p className="text-xs text-muted">{k.hint}</p></div>
              <span className="grid w-14 place-items-center">{k.key === 'news' ? <span className="text-xs text-muted">—</span> : <Toggle label={`${k.label} in app`} on={v.inApp} onChange={x => save({ notifications: { [k.key]: { inApp: x } } })} />}</span>
              <span className="grid w-14 place-items-center">{k.email ? <Toggle label={`${k.label} by email`} on={v.email} onChange={x => save({ notifications: { [k.key]: { email: x } } })} /> : <span className="text-xs text-muted">—</span>}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Account and security messages are always sent.</p>
      <PushSettings />
    </div>
  );
}

function DisplayPanel({ prefs, save, isStudent }: { prefs: Prefs | null; save: (p: Record<string, unknown>, msg?: string) => Promise<void>; isStudent: boolean }) {
  if (!prefs) return <div className="h-64 rounded-md bg-subtle animate-pulse" />;
  function size(s: string) {
    try { localStorage.setItem(TEXT_SIZE_KEY, s); } catch { /* storage blocked */ }
    applyTextSize(s);
    save({ display: { textSize: s } }, 'Text size saved');
  }
  // Same cookie as the EN/FR switch in the top bar
  const current = typeof document !== 'undefined' ? (document.cookie.match(/cpa_locale=([^;]+)/)?.[1] ?? 'en') : 'en';
  async function language(code: string) {
    document.cookie = `cpa_locale=${code};path=/;max-age=31536000;SameSite=Lax`;
    await save({ display: { language: code } }, code === 'fr' ? 'Langue enregistrée' : 'Language saved');
    window.location.reload();
  }
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-navy">Language and display</h2>
      <Field label="Language">
        <select className={clsx(input, 'max-w-xs')} value={current} onChange={e => language(e.target.value)}>
          <option value="en">English</option><option value="fr">Français</option>
        </select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Text size</span>
        <div className="flex gap-1.5">
          {[['small', 'Smaller'], ['normal', 'Normal'], ['large', 'Larger']].map(([k, l]) => (
            <button key={k} onClick={() => size(k)}
              className={clsx('rounded-md px-3 py-1.5 text-[13px] font-semibold text-navy', prefs.display.textSize === k ? 'border border-azure bg-accent-soft' : 'border border-line hover:bg-subtle')}>{l}</button>
          ))}
        </div>
      </div>
      {isStudent && (
        <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
          <span><span className="block text-[13.5px] font-semibold text-navy">Show my name on leaderboards</span><span className="text-xs text-muted">Off: classmates see you as “A classmate”</span></span>
          <Toggle label="Show my name on leaderboards" on={prefs.leaderboardVisible} onChange={x => save({ leaderboardVisible: x })} />
        </label>
      )}
    </div>
  );
}

function DataSaverPanel({ prefs, save }: { prefs: Prefs | null; save: (p: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let local: string | null = null;
    try { local = localStorage.getItem(DATA_SAVER_KEY); } catch { /* storage blocked */ }
    setOn(local != null ? local === '1' : !!prefs?.display.dataSaver);
  }, [prefs]);
  function set(v: boolean) {
    setOn(v);
    try { localStorage.setItem(DATA_SAVER_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
    save({ display: { dataSaver: v } }, v ? 'Data saver on' : 'Data saver off');
  }
  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-base font-bold text-navy">Data saver</h2>
      <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
        <span><span className="block text-[13.5px] font-semibold text-navy">Use less mobile data</span><span className="text-xs text-muted">Lessons play the smaller video when the teacher has uploaded one</span></span>
        <Toggle label="Data saver" on={on} onChange={set} />
      </label>
      <p className="text-xs text-muted">You can also switch this on or off from any video lesson.</p>
    </div>
  );
}

interface Deletion { dueAt: string | null; requestedAt: string | null; needsAdmin: boolean; email: string }

/** Settings → Your data: download everything, or delete the account (emailed code, then 7 days to change your mind). */
function YourDataPanel({ me }: { me: Me }) {
  const [status, setStatus] = useState<Deletion | null>(null);
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState('');
  useEffect(() => { api.get('/account/deletion').then(r => setStatus(r.data)).catch(() => {}); }, []);

  async function download() {
    setBusy('download');
    try {
      const r = await api.get('/account/data-export');
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `careerpath-my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not prepare your data'); } finally { setBusy(''); }
  }
  async function sendCode() {
    setBusy('code');
    try { await api.post('/account/deletion/code'); setStep('code'); setCode(''); notify.success('Code sent', { description: `Check ${me.email}` }); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send a code'); } finally { setBusy(''); }
  }
  async function confirm() {
    setBusy('confirm');
    try { const r = await api.post('/account/deletion', { code }); setStatus(s => ({ ...(s as Deletion), dueAt: r.data.dueAt })); setStep('idle'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'That didn’t work'); } finally { setBusy(''); }
  }
  async function keep() {
    setBusy('keep');
    try { await api.delete('/account/deletion'); setStatus(s => ({ ...(s as Deletion), dueAt: null })); notify.success('Your account stays'); }
    catch { notify.error('Could not cancel. Try again.'); } finally { setBusy(''); }
  }
  const due = status?.dueAt ? new Date(status.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : null;
  const card = 'flex flex-col gap-2.5 rounded-[10px] border p-5';
  const ico = 'flex h-10 w-10 items-center justify-center rounded-[9px]';

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-base font-bold text-navy">Your data</h2>
      <div className="grid gap-3.5 md:grid-cols-2">
        <section className={clsx(card, 'border-line')}>
          <span className={clsx(ico, 'bg-accent-soft text-[#3F6FE8]')}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg></span>
          <strong className="text-[17px] text-navy">Download my data</strong>
          <p className="text-sm text-ink2">One file with everything we hold about you: profile, courses and progress, test results, certificates, payments, messages you sent and posts you wrote.</p>
          <div><Button size="sm" onClick={download} loading={busy === 'download'}>Download</Button></div>
        </section>

        <section className={clsx(card, 'border-[#EFC4C0]')}>
          <span className={clsx(ico, 'bg-[#FDF1F0] text-[#C1352B]')}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></span>
          <strong className="text-[17px] text-navy">Delete my account</strong>
          {me.role === 'ADMIN' ? (
            <p className="text-sm text-ink2">Admin accounts are removed by another admin, not from here.</p>
          ) : due ? (
            <>
              <p className="text-sm text-ink2">Your account will be deleted on <strong className="text-navy">{due}</strong>{status?.needsAdmin ? ', once an admin has paid out anything you’re owed' : ''}. You can still sign in until then.</p>
              <div><button onClick={keep} disabled={busy === 'keep'} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Keep my account</button></div>
            </>
          ) : step === 'code' ? (
            <>
              <p className="text-sm text-ink2">We sent a six-digit code to <strong className="text-navy">{me.email}</strong>. Type it to confirm.</p>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code from your email"
                className="h-11 w-44 rounded-lg border border-line px-3 text-center text-xl font-extrabold tracking-[0.3em] text-navy outline-none focus:border-azure" />
              <label className="flex items-center gap-2 text-[13.5px] text-ink2"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} className="h-[18px] w-[18px] accent-[#C1352B]" />I understand my courses and certificates stop working.</label>
              <div className="flex gap-2">
                <button onClick={confirm} disabled={busy === 'confirm' || code.length < 6 || !sure} className="h-9 rounded-md bg-[#C1352B] px-3.5 text-[13.5px] font-bold text-white disabled:opacity-50">Delete in 7 days</button>
                <button onClick={() => setStep('idle')} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] text-navy hover:bg-subtle">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink2">Confirmed with an email code, then 7 days to change your mind. Your name, contact details, photo, progress and notes are removed; your courses and certificates stop working.</p>
              <p className="rounded-md bg-subtle px-3 py-2 text-[12.5px] text-ink2"><strong className="text-navy">What we must keep:</strong> payment records, without your name, for 6 years because tax law needs them. Certificate codes keep showing “issued”, with no name.</p>
              <div><button onClick={sendCode} disabled={busy === 'code'} className="h-9 rounded-md border border-[#C1352B] px-3.5 text-[13.5px] font-bold text-[#C1352B] hover:bg-[#FDF1F0] disabled:opacity-50">Delete my account…</button></div>
            </>
          )}
          {me.role !== 'STUDENT' && me.role !== 'ADMIN' && !due && <p className="text-xs text-muted">Teachers and other staff: an admin finishes the deletion after any last payout.</p>}
        </section>
      </div>
      <p className="rounded-[10px] border border-line px-4 py-3 text-[13px] text-ink2"><strong className="text-navy">What we keep and why:</strong> profile and progress while your account is open · payments for 6 years, for tax · sign-in codes for 10 minutes.</p>
      <AppVersion className="text-center" />
    </div>
  );
}
