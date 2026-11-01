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

type Tab = 'profile' | 'account' | 'notifications' | 'display' | 'data';
const TABS: [Tab, string][] = [['profile', 'Profile'], ['account', 'Account and password'], ['notifications', 'Notifications'], ['display', 'Language and display'], ['data', 'Data saver']];
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
    const h = window.location.hash.slice(1) as Tab;
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
        <nav className="flex flex-[0_0_200px] flex-col gap-0.5 max-md:flex-[1_1_100%] max-md:flex-row max-md:overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => pick(k)}
              className={clsx('whitespace-nowrap rounded-md px-3 py-[9px] text-left text-[13.5px]', tab === k ? 'bg-accent-soft font-semibold text-navy' : 'text-ink2 hover:bg-subtle')}>{l}</button>
          ))}
        </nav>
        <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5 rounded-lg border border-line bg-white p-5">
          {!me ? <div className="h-64 rounded-md bg-subtle animate-pulse" /> : (
            tab === 'profile' ? <ProfilePanel me={me} setMe={setMe} countries={prefs?.countries ?? []} programmes={programmes} />
            : tab === 'account' ? <AccountPanel me={me} />
            : tab === 'notifications' ? <NotificationsPanel prefs={prefs} save={savePrefs} />
            : tab === 'display' ? <DisplayPanel prefs={prefs} save={savePrefs} isStudent={me.role === 'STUDENT'} />
            : <DataSaverPanel prefs={prefs} save={savePrefs} />
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
      <h2 className="text-base font-bold text-navy">Account and password</h2>
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
      <div><Button type="submit" size="sm" loading={saving}>Change password</Button></div>
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
