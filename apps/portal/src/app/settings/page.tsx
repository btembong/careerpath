'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import { useAuth } from '@/hooks/useAuth';
import { applyTextSize, TEXT_SIZE_KEY } from '@/components/providers/DisplayPrefsApplier';
import api, { setAuthToken } from '@/lib/api';
import { AppVersion } from '@/components/ui/AppVersion';
import { PushSettings } from '@/components/push/Push';

interface Me {
  id: string; email: string; role: string; firstName?: string; lastName?: string; phone?: string;
  avatarUrl?: string | null; countryId: string | null; levelId?: string | null; programmeInterestIds?: string[]; createdAt?: string;
}
interface Kind { key: string; group: string; label: string; hint: string; email: boolean; emailAlways?: boolean }
interface Quiet { on: boolean; from: string; to: string; pausedUntil: string | null }
interface Prefs {
  notifications: Record<string, { inApp: boolean; email: boolean; push: boolean }>;
  kinds: Kind[];
  quiet: Quiet;
  display: { language: string; textSize: string; dataSaver: boolean };
  leaderboardVisible: boolean;
  timezone: string | null;
  countries: { id: string; name: string }[];
}
interface Session { id: string; userAgent: string | null; device: string | null; createdAt: string; lastSeenAt: string; trustedUntil: string | null; current: boolean }
interface Programme { id: string; name: string; shortName: string | null; levels: { id: string; name: string }[] }
type Save = (p: Record<string, unknown>) => Promise<boolean>;

type Tab = 'profile' | 'security' | 'notifications' | 'display' | 'data';
/** [key, label, icon path] */
const TABS: [Tab, string, string][] = [
  ['profile', 'Profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
  ['security', 'Sign-in and security', 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4'],
  ['notifications', 'Notifications', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4'],
  ['display', 'Display and privacy', 'M3 5h18v12H3zM8 21h8M12 17v4'],
  ['data', 'Your data', 'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 6c0 2 16 2 16 0M4 12c0 2 16 2 16 0'],
];
const ROLE_HOME: Record<string, string> = {
  STUDENT: '/student/dashboard', TEACHER: '/teacher/dashboard', ADMIN: '/admin/dashboard',
  COUNTRY_REP: '/country-rep/dashboard', SUBJECT_REVIEWER: '/reviewer/dashboard', ORG_ADMIN: '/school/dashboard',
};
const ROLE_NAME: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin', COUNTRY_REP: 'Country rep', SUBJECT_REVIEWER: 'Subject reviewer', ORG_ADMIN: 'School admin' };
const DATA_SAVER_KEY = 'cpa:dataSaver';
const TZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } };

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
const input = 'h-[38px] rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure disabled:bg-subtle disabled:text-muted';
const btnLine = 'inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50';
const groupBox = 'flex flex-col rounded-lg border border-line';
const row = 'flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0';

function Toggle({ on, onChange, label, locked }: { on: boolean; onChange?: (v: boolean) => void; label: string; locked?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={locked} title={locked ? 'Always on' : undefined} onClick={() => onChange?.(!on)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition', on ? (locked ? 'bg-[#9DB3EA]' : 'bg-azure-strong') : 'bg-line')}>
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <span role="group" aria-label={label} className="inline-flex w-fit gap-0.5 rounded-lg border border-line bg-white p-[3px]">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={clsx('h-8 rounded-md px-3.5 text-[13.5px] text-navy', value === k ? 'bg-accent-soft font-bold text-azure-strong' : 'font-semibold hover:bg-subtle')}>{l}</button>
      ))}
    </span>
  );
}

const Title = ({ t, sub, right }: { t: string; sub?: string; right?: React.ReactNode }) => (
  <div className="flex flex-wrap items-end gap-3">
    <div className="min-w-0 flex-1"><h2 className="text-lg font-extrabold text-navy">{t}</h2>{sub && <p className="text-[13px] text-muted">{sub}</p>}</div>
    {right}
  </div>
);

/** "Chrome on Windows" from a browser's user agent */
function browserName(ua: string | null, device: string | null) {
  const s = ua ?? '';
  const b = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null;
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iPhone' : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : null;
  if (b && os) return `${b} on ${os}`;
  return b ?? os ?? (device === 'phone' ? 'A phone' : device === 'tablet' ? 'A tablet' : 'A computer');
}
const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  if (m < 10) return 'active now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  /** On a phone: the list of sections, or one section */
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [saved, setSaved] = useState<number>(0);

  useEffect(() => {
    // Old links: #account is now #security
    const fromHash = () => {
      const raw = window.location.hash.slice(1);
      const h = (raw === 'account' ? 'security' : raw) as Tab;
      if (TABS.some(([k]) => k === h)) { setTab(h); setOpen(true); }
    };
    fromHash();
    // Links to another section while Settings is already open
    window.addEventListener('hashchange', fromHash);
    api.get('/auth/me').then(r => setMe(r.data)).catch(() => notify.error('Could not load your account'));
    api.get('/auth/me/preferences').then(r => {
      setPrefs(r.data);
      // Quiet hours follow the clock where they are
      const tz = TZ();
      if (tz && !r.data.timezone) api.patch('/auth/me/preferences', { timezone: tz }).catch(() => {});
    }).catch(() => {});
    loadSessions();
    api.get('/catalogue/programmes').then(r => setProgrammes(r.data ?? [])).catch(() => {});
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function loadSessions() { api.get('/auth/me/sessions').then(r => setSessions(r.data.sessions)).catch(() => setSessions([])); }

  function pick(k: Tab) { setTab(k); setOpen(true); history.replaceState(null, '', `#${k}`); window.scrollTo({ top: 0 }); }
  function back() { setOpen(false); history.replaceState(null, '', location.pathname); }

  /** Saves quietly: a "✓ Saved" next to the section title instead of a toast each time */
  const savePrefs: Save = async patch => {
    try { const r = await api.patch('/auth/me/preferences', patch); setPrefs(r.data); setSaved(Date.now()); return true; }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); return false; }
  };

  const country = prefs?.countries.find(c => c.id === me?.countryId)?.name;
  const others = sessions?.filter(s => !s.current).length ?? 0;
  const q = prefs?.quiet;
  const state: Record<Tab, string> = {
    profile: me ? [me.avatarUrl ? 'Photo set' : 'No photo yet', country].filter(Boolean).join(' · ') : '',
    security: sessions ? (others ? `Signed in on ${others + 1} devices` : 'Only this device') : '',
    notifications: q ? (q.pausedUntil ? `Paused until ${hhmm(q.pausedUntil)}` : q.on ? `Quiet ${q.from}–${q.to}` : 'What we tell you, where') : '',
    display: prefs ? `${prefs.display.language === 'fr' ? 'Français' : 'English'} · ${prefs.display.textSize === 'small' ? 'Smaller' : prefs.display.textSize === 'large' ? 'Larger' : 'Normal'} text` : '',
    data: 'Download, delete',
  };
  const name = me ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || me.email : '';
  const label = TABS.find(([k]) => k === tab)![1];
  const icon = (d: string, on?: boolean) => (
    <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-subtle text-[#3F6FE8]', on && 'md:bg-[#3F6FE8] md:text-white')}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={d} /></svg>
    </span>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Settings" subtitle="Your profile, sign-in, notifications and display"
        backHref={ROLE_HOME[user?.role ?? ''] ?? '/student/dashboard'} backLabel="Dashboard" />
      <div className="flex items-start gap-5 p-4 lg:px-7 lg:py-6">
        {/* The sections: a menu beside the section on a computer, a list you tap into on a phone */}
        <nav aria-label="Settings sections" className={clsx('flex-col gap-3 md:flex md:w-[270px] md:flex-shrink-0', open ? 'hidden' : 'flex w-full')}>
          {me && (
            <div className="flex items-center gap-3 rounded-lg bg-[#3F6FE8] p-3.5 text-white md:hidden">
              {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="h-12 w-12 rounded-[10px] object-cover" />
                : <span className="grid h-12 w-12 place-items-center rounded-[10px] bg-white text-base font-extrabold text-[#3F6FE8]">{initialsOf(name)}</span>}
              <span className="min-w-0"><span className="block truncate text-base font-extrabold">{name}</span><span className="block truncate text-[12.5px] text-[#DCE5FB]">{ROLE_NAME[me.role] ?? me.role} · {me.email}</span></span>
            </div>
          )}
          <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-white p-2 max-md:divide-y max-md:divide-line max-md:p-0">
            {TABS.map(([k, l, d]) => (
              <button key={k} onClick={() => pick(k)} aria-current={tab === k ? 'page' : undefined}
                className={clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-left max-md:rounded-none max-md:py-3.5', tab === k ? 'md:bg-accent-soft' : 'hover:bg-subtle')}>
                {icon(d, tab === k)}
                <span className="flex min-w-0 flex-1 flex-col"><strong className="text-[14px] text-navy">{l}</strong><span className="truncate text-xs text-muted">{state[k] || '…'}</span></span>
                <span aria-hidden className="text-lg font-bold text-muted md:hidden">›</span>
              </button>
            ))}
          </div>
          <button onClick={logout} className="rounded-lg border border-line bg-white px-4 py-3 text-left text-[14px] font-bold text-[#C1352B] md:hidden">Sign out</button>
          <AppVersion className="px-2 max-md:text-center" />
        </nav>

        <section className={clsx('min-w-0 flex-1 flex-col gap-4 rounded-lg border border-line bg-white p-4 sm:p-5', open ? 'flex' : 'hidden md:flex')}>
          <button onClick={back} className="-mb-1 flex w-fit items-center gap-1.5 text-[13.5px] font-bold text-azure-strong md:hidden">‹ Settings</button>
          {!me ? <div className="h-64 animate-pulse rounded-md bg-subtle" aria-label={`Loading ${label}`} /> : (
            tab === 'profile' ? <ProfilePanel me={me} setMe={setMe} countries={prefs?.countries ?? []} programmes={programmes} />
            : tab === 'security' ? <SecurityPanel me={me} sessions={sessions} reload={loadSessions} />
            : tab === 'notifications' ? <NotificationsPanel prefs={prefs} save={savePrefs} saved={saved} />
            : tab === 'display' ? <DisplayPanel prefs={prefs} save={savePrefs} saved={saved} isStudent={me.role === 'STUDENT'} />
            : <YourDataPanel me={me} />
          )}
        </section>
      </div>
    </div>
  );
}

const initialsOf = (name: string) => name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function Saved({ at }: { at: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!at) return; setShow(true); const t = setTimeout(() => setShow(false), 2500); return () => clearTimeout(t); }, [at]);
  return <span aria-live="polite" className={clsx('text-[12.5px] font-bold text-[#17703A] transition-opacity', show ? 'opacity-100' : 'opacity-0')}>✓ Saved</span>;
}

/* ── Profile ─────────────────────────────────────────────── */

function ProfilePanel({ me, setMe, countries, programmes }: { me: Me; setMe: (m: Me) => void; countries: { id: string; name: string }[]; programmes: Programme[] }) {
  const [f, setF] = useState({ firstName: me.firstName ?? '', lastName: me.lastName ?? '', phone: me.phone ?? '', countryId: me.countryId ?? '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [subjects, setSubjects] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = `${f.firstName} ${f.lastName}`.trim() || me.email;
  const isTeacher = me.role === 'TEACHER';
  useEffect(() => { if (isTeacher) api.get('/auth/me/profile').then(r => setSubjects(r.data?.subjects ?? [])).catch(() => setSubjects([])); }, [isTeacher]);

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
  async function removePhoto() {
    try { await api.patch('/auth/me', { avatarUrl: null }); setMe({ ...me, avatarUrl: null }); notify.success('Photo removed'); }
    catch { notify.error('Could not remove the photo'); }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Title t="Profile" sub={isTeacher ? 'What students and colleagues see.' : 'Your name and how we reach you.'} />
      <div className="flex flex-wrap items-center gap-4">
        {me.avatarUrl
          ? <img src={me.avatarUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
          : <span className="grid h-24 w-24 place-items-center rounded-lg bg-accent-soft text-[28px] font-extrabold text-azure-strong">{initialsOf(name)}</span>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) upload(x); e.target.value = ''; }} />
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} className={btnLine} disabled={uploading}>{uploading ? 'Uploading…' : me.avatarUrl ? 'Upload a new photo' : 'Add a photo'}</button>
          {me.avatarUrl && <button type="button" onClick={removePhoto} className="text-[13px] font-semibold text-[#C1352B] hover:underline">Remove photo</button>}
          <span className="text-xs text-muted">Square, at least 400 × 400. {isTeacher ? 'A clear face helps students trust a course.' : ''}</span>
        </div>
      </div>

      {isTeacher && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#F4F7FF] p-3">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">How students see you</p>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-2.5">
            {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              : <span className="grid h-9 w-9 place-items-center rounded-full bg-[#3F6FE8] text-[13px] font-extrabold text-white">{initialsOf(name)}</span>}
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-bold text-navy">{name}</span><span className="block truncate text-xs text-muted">{subjects == null ? '…' : subjects.length ? subjects.join(' · ') : 'No subjects yet'}</span></span>
            <Link href="/teacher/profile" className="text-[13px] font-bold text-azure-strong hover:underline">Edit bio and video →</Link>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name"><input className={input} value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} autoComplete="given-name" /></Field>
        <Field label="Last name"><input className={input} value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} autoComplete="family-name" /></Field>
        <Field label={me.role === 'STUDENT' ? 'Phone (for mobile money)' : 'Phone'} hint="With the country code, e.g. +237 6 77 00 00 00">
          <input className={input} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+237 6 77 00 00 00" />
        </Field>
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
        <Field label="Email" hint="Sign-in codes and receipts go here. Ask support to change it."><input className={input} value={me.email} disabled /></Field>
      </div>
      <div><Button type="submit" size="sm" loading={saving}>Save changes</Button></div>
    </form>
  );
}

/* ── Sign-in and security ────────────────────────────────── */

function strength(pw: string) {
  if (!pw) return { n: 0, t: '' };
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
  if (pw.length < 8) return { n: 1, t: `Too short · ${pw.length} of 8 characters` };
  return { n: Math.max(2, n), t: `${n >= 4 ? 'Strong' : n === 3 ? 'Good' : 'Fair'} · ${pw.length} characters` };
}

function PasswordInput({ value, onChange, auto, label }: { value: string; onChange: (v: string) => void; auto: string; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className={clsx(input, 'flex items-center gap-2 pr-1.5 focus-within:border-azure')}>
      <input type={show ? 'text' : 'password'} aria-label={label} value={value} onChange={e => onChange(e.target.value)} required autoComplete={auto} className="min-w-0 flex-1 bg-transparent outline-none" />
      <button type="button" onClick={() => setShow(s => !s)} className="rounded px-1.5 text-xs font-bold text-azure-strong">{show ? 'Hide' : 'Show'}</button>
    </span>
  );
}

function SecurityPanel({ me, sessions, reload }: { me: Me; sessions: Session[] | null; reload: () => void }) {
  const [changing, setChanging] = useState(false);
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const st = strength(pw);
  const match = pw2 ? pw === pw2 : null;
  const others = sessions?.filter(s => !s.current) ?? [];

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { notify.error('Use at least 8 characters'); return; }
    if (pw !== pw2) { notify.error('The new passwords don’t match'); return; }
    setSaving(true);
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: pw }); notify.success('Password changed'); setCur(''); setPw(''); setPw2(''); setChanging(false); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not change the password'); } finally { setSaving(false); }
  }
  async function forget(id: string) {
    setBusy(id);
    try { await api.delete(`/auth/me/sessions/${id}`); notify.success('Signed out there'); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not sign it out'); } finally { setBusy(''); }
  }
  async function signOutOthers() {
    setBusy('all');
    try {
      const r = await api.post('/auth/me/sessions/sign-out-others');
      await setAuthToken(r.data.accessToken);
      notify.success('Signed out everywhere else'); setConfirmAll(false); reload();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not sign out the others'); } finally { setBusy(''); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[#F4F7FF] px-4 py-3.5">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-[#3F6FE8] text-sm font-extrabold text-white">{initialsOf(`${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || me.email)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-navy">{me.email}</span>
          <span className="block text-xs text-muted">{ROLE_NAME[me.role] ?? me.role}{me.createdAt ? ` · member since ${new Date(me.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : ''}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Title t="How you sign in" sub="The emailed code always works, even if you forget your password." />
        <div className={groupBox}>
          <div className={row}>
            <span className="min-w-0 flex-1"><strong className="block text-[14px] text-navy">Password</strong><span className="text-xs text-muted">With your email, on the sign-in page</span></span>
            {!changing && <button type="button" onClick={() => setChanging(true)} className={btnLine}>Change password</button>}
          </div>
          {changing && (
            <form onSubmit={change} className="flex flex-col gap-3 border-t border-[#BFD0FA] bg-[#FAFBFF] px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Current password"><PasswordInput label="Current password" value={cur} onChange={setCur} auto="current-password" /></Field>
                <span className="max-sm:hidden" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-navy">New password</span>
                  <PasswordInput label="New password" value={pw} onChange={setPw} auto="new-password" />
                  {pw && <>
                    <span className="flex gap-1" aria-hidden>{[1, 2, 3, 4].map(i => <span key={i} className={clsx('h-[5px] flex-1 rounded-[3px]', i <= st.n ? (st.n >= 3 ? 'bg-[#17703A]' : st.n === 2 ? 'bg-[#C98A00]' : 'bg-[#C1352B]') : 'bg-line')} />)}</span>
                    <span className={clsx('text-xs', st.n >= 3 ? 'text-[#17703A]' : st.n === 2 ? 'text-[#8A5A00]' : 'text-[#C1352B]')}>{st.t}</span>
                  </>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-navy">New password again</span>
                  <PasswordInput label="New password again" value={pw2} onChange={setPw2} auto="new-password" />
                  {match != null && <span className={clsx('text-xs font-semibold', match ? 'text-[#17703A]' : 'text-[#C1352B]')}>{match ? '✓ Matches' : 'Doesn’t match yet'}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" loading={saving} disabled={pw.length < 8 || !match}>Save new password</Button>
                <button type="button" onClick={() => { setChanging(false); setCur(''); setPw(''); setPw2(''); }} className={btnLine}>Cancel</button>
                <span className="text-xs text-muted">Forgot the current one? Sign out and use “Forgot it?”.</span>
              </div>
            </form>
          )}
          <div className={row}>
            <span className="min-w-0 flex-1"><strong className="block text-[14px] text-navy">Emailed code</strong><span className="text-xs text-muted">A 6-digit code to {me.email}, valid 10 minutes</span></span>
            <span className="rounded-md bg-subtle px-2 py-1 text-xs font-bold text-ink2">Always available</span>
          </div>
          {me.role === 'ADMIN' && (
            <div className={row}>
              <span className="min-w-0 flex-1"><strong className="block text-[14px] text-navy">Two-step sign-in for admins</strong><span className="text-xs text-muted">After your password, a code by email. You can trust a computer for 30 days.</span></span>
              <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-bold text-azure-strong">Required</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Title t="Where you’re signed in" sub={me.role === 'ADMIN' ? 'Trusted computers skip the code for 30 days. Sign out any you don’t recognise.' : 'Sign out any you don’t recognise.'}
          right={others.length > 0 && !confirmAll ? <button onClick={() => setConfirmAll(true)} className="inline-flex h-9 items-center rounded-md border border-[#C1352B] px-3.5 text-[13.5px] font-bold text-[#C1352B] hover:bg-[#FDF1F0]">Sign out everywhere else</button> : undefined} />
        {confirmAll && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#EFC4C0] bg-[#FDF1F0] px-4 py-3">
            <span className="min-w-0 flex-1 text-[13.5px] text-navy">Sign out of every other browser and app? You stay signed in here.{me.role === 'ADMIN' ? ' Trusted computers will ask for a code again.' : ''}</span>
            <button onClick={signOutOthers} disabled={busy === 'all'} className="inline-flex h-9 items-center rounded-md bg-[#C1352B] px-3.5 text-[13.5px] font-bold text-white disabled:opacity-50">Sign them out</button>
            <button onClick={() => setConfirmAll(false)} className={btnLine}>Cancel</button>
          </div>
        )}
        <div className={groupBox}>
          {sessions == null ? <div className="m-3 h-14 animate-pulse rounded-md bg-subtle" />
            : !sessions.length ? <p className="px-4 py-3 text-[13px] text-muted">This browser signed in before this list existed. It shows up here from your next sign-in.</p>
            : sessions.map(s => (
              <div key={s.id} className={row}>
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-subtle text-[#3F6FE8]" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{s.device === 'phone' || s.device === 'tablet' ? <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2" /> : <path d="M4 5h16v11H4zM2 19h20" />}</svg>
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[14px] text-navy">{browserName(s.userAgent, s.device)}{s.current ? ' · this browser' : ''}</strong>
                  <span className="text-xs text-muted">{s.current ? 'Active now' : `Last active ${ago(s.lastSeenAt)}`} · signed in {shortDate(s.createdAt)}{s.trustedUntil ? ` · trusted until ${shortDate(s.trustedUntil)}` : ''}</span>
                </span>
                {s.current ? <span className="rounded-md bg-[#E3F5EA] px-2 py-1 text-xs font-bold text-[#17703A]">This one</span>
                  : <button onClick={() => forget(s.id)} disabled={busy === s.id} className={btnLine}>Sign out</button>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ── Notifications ───────────────────────────────────────── */

function NotificationsPanel({ prefs, save, saved }: { prefs: Prefs | null; save: Save; saved: number }) {
  const [phoneRow, setPhoneRow] = useState<string | null>(null);
  if (!prefs) return <div className="h-64 animate-pulse rounded-md bg-subtle" />;
  const q = prefs.quiet;
  const groups = [...new Set(prefs.kinds.map(k => k.group))];
  const set = (key: string, field: 'inApp' | 'email' | 'push', v: boolean) => save({ notifications: { [key]: { [field]: v } } });
  const tillMorning = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return Math.round((+d - Date.now()) / 60_000); };
  const where = (k: Kind) => {
    const v = prefs.notifications[k.key];
    const on = [k.key !== 'news' && v.inApp && 'App', (k.emailAlways || (k.email && v.email)) && 'Email', v.push && 'Phone'].filter(Boolean);
    return on.length ? on.join(' · ') : 'Off';
  };
  const cells = (k: Kind) => {
    const v = prefs.notifications[k.key];
    return [
      ['In app', k.key === 'news' ? null : <Toggle key="a" label={`${k.label} in the app`} on={v.inApp} onChange={x => set(k.key, 'inApp', x)} />],
      ['Email', k.emailAlways ? <Toggle key="e" label={`${k.label} by email: always sent`} on locked /> : k.email ? <Toggle key="e" label={`${k.label} by email`} on={v.email} onChange={x => set(k.key, 'email', x)} /> : null],
      ['Phone', <Toggle key="p" label={`${k.label} on your phone`} on={v.push} onChange={x => set(k.key, 'push', x)} />],
    ] as [string, React.ReactNode][];
  };

  return (
    <div className="flex flex-col gap-4">
      <Title t="Notifications" sub="What we tell you, and where. Changes save as you go." right={<Saved at={saved} />} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-lg border border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1"><strong className="block text-[14px] text-navy">Quiet hours</strong><span className="text-xs text-muted">No phone alerts in these hours. Everything still arrives in the app.</span></span>
            <Toggle label="Quiet hours" on={q.on} onChange={x => save({ quiet: { on: x } })} />
          </div>
          {q.on && (
            <div className="flex items-center gap-2 text-[13px] text-ink2">
              From <input type="time" aria-label="Quiet from" value={q.from} onChange={e => e.target.value && save({ quiet: { from: e.target.value } })} className={clsx(input, 'h-9 w-[110px]')} />
              to <input type="time" aria-label="Quiet until" value={q.to} onChange={e => e.target.value && save({ quiet: { to: e.target.value } })} className={clsx(input, 'h-9 w-[110px]')} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2.5 rounded-lg border border-line px-4 py-3">
          <span><strong className="block text-[14px] text-navy">Pause phone alerts</strong><span className="text-xs text-muted">{q.pausedUntil ? `Paused until ${new Date(q.pausedUntil).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'For an exam, a class or a trip.'}</span></span>
          {q.pausedUntil
            ? <button onClick={() => save({ pauseMinutes: null })} className={clsx(btnLine, 'w-fit')}>Resume now</button>
            : <div className="flex flex-wrap gap-2"><button onClick={() => save({ pauseMinutes: 60 })} className={btnLine}>1 hour</button><button onClick={() => save({ pauseMinutes: tillMorning() })} className={btnLine}>Until tomorrow 07:00</button></div>}
        </div>
      </div>

      {/* A table on a computer; on a phone each row says where it goes and opens its switches */}
      <div className={groupBox}>
        <div className="hidden items-center gap-3 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:flex">
          <span className="flex-1">What</span><span className="w-14 text-center">In app</span><span className="w-14 text-center">Email</span><span className="w-14 text-center">Phone</span>
        </div>
        {groups.map((g, gi) => (
          <div key={g}>
            <p className={clsx('bg-[#FAFBFE] px-4 pb-1.5 pt-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-azure-strong', gi > 0 && 'border-t border-line')}>{g}</p>
            {prefs.kinds.filter(k => k.group === g).map(k => (
              <div key={k.key} className="border-t border-line">
                <div className="hidden items-center gap-3 px-4 py-3 sm:flex">
                  <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold text-navy">{k.label}</p><p className="text-xs text-muted">{k.hint}</p></div>
                  {cells(k).map(([l, c]) => <span key={l} className="grid w-14 place-items-center">{c ?? <span className="text-xs text-muted">—</span>}</span>)}
                </div>
                <button type="button" onClick={() => setPhoneRow(r => r === k.key ? null : k.key)} aria-expanded={phoneRow === k.key}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left sm:hidden">
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy">{k.label}</span><span className="block text-xs text-muted">{where(k)}</span></span>
                  <span aria-hidden className={clsx('text-lg font-bold text-muted transition', phoneRow === k.key && 'rotate-90')}>›</span>
                </button>
                {phoneRow === k.key && (
                  <div className="flex flex-col gap-1 px-4 pb-3 sm:hidden">
                    <p className="text-xs text-muted">{k.hint}</p>
                    {cells(k).map(([l, c]) => c && <div key={l} className="flex items-center justify-between py-1.5 text-[13.5px] text-navy">{l === 'Phone' ? 'This phone and your other devices' : l === 'Email' && k.emailAlways ? 'Email (always sent)' : l}{c}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-3 border-t border-line bg-[#FAFBFE] px-4 py-3">
          <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold text-navy">Sign-in codes and security alerts</span><span className="text-xs text-muted">Always sent, so you can’t lock yourself out</span></span>
          <span className="rounded-md bg-subtle px-2 py-1 text-xs font-bold text-ink2">Always on</span>
        </div>
      </div>
      <PushSettings />
    </div>
  );
}

/* ── Display and privacy ─────────────────────────────────── */

function DisplayPanel({ prefs, save, saved, isStudent }: { prefs: Prefs | null; save: Save; saved: number; isStudent: boolean }) {
  const [dataSaver, setDataSaver] = useState(false);
  useEffect(() => {
    let local: string | null = null;
    try { local = localStorage.getItem(DATA_SAVER_KEY); } catch { /* storage blocked */ }
    setDataSaver(local != null ? local === '1' : !!prefs?.display.dataSaver);
  }, [prefs]);
  if (!prefs) return <div className="h-64 animate-pulse rounded-md bg-subtle" />;

  function size(s: string) {
    try { localStorage.setItem(TEXT_SIZE_KEY, s); } catch { /* storage blocked */ }
    applyTextSize(s);
    save({ display: { textSize: s } });
  }
  // Same cookie as the EN/FR switch in the top bar
  const current = typeof document !== 'undefined' ? (document.cookie.match(/cpa_locale=([^;]+)/)?.[1] ?? 'en') : 'en';
  async function language(code: string) {
    document.cookie = `cpa_locale=${code};path=/;max-age=31536000;SameSite=Lax`;
    if (await save({ display: { language: code } })) window.location.reload();
  }
  function saver(v: boolean) {
    setDataSaver(v);
    try { localStorage.setItem(DATA_SAVER_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
    save({ display: { dataSaver: v } });
  }

  return (
    <div className="flex flex-col gap-5">
      <Title t="Display and privacy" sub="For this account, on every device." right={<Saved at={saved} />} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Language</span>
        <Seg label="Language" value={current as 'en' | 'fr'} options={[['en', 'English'], ['fr', 'Français']]} onChange={language} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-navy">Text size</span>
        <Seg label="Text size" value={prefs.display.textSize as 'small' | 'normal' | 'large'} options={[['small', 'Smaller'], ['normal', 'Normal'], ['large', 'Larger']]} onChange={size} />
        <div className="max-w-[560px] rounded-lg border border-dashed border-line px-4 py-3">
          <p className="text-[15px] font-bold text-navy">Photosynthesis: the light reactions</p>
          <p className="text-[13.5px] text-ink2">This is how lesson text looks at this size. Choose what’s comfortable on your screen.</p>
        </div>
      </div>
      <div className={groupBox}>
        <label className={clsx(row, 'cursor-pointer')}>
          <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy">Data saver</span><span className="text-xs text-muted">Lessons play the smaller video when the teacher has uploaded one. Also in every video lesson.</span></span>
          <Toggle label="Data saver" on={dataSaver} onChange={saver} />
        </label>
      </div>
      {isStudent && (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[15px] font-extrabold text-navy">Privacy</h3>
          <div className={groupBox}>
            <label className={clsx(row, 'cursor-pointer')}>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy">Show my name on leaderboards</span><span className="text-xs text-muted">Off: classmates see you as “A classmate”. You always see your own place.</span></span>
              <Toggle label="Show my name on leaderboards" on={prefs.leaderboardVisible} onChange={x => save({ leaderboardVisible: x })} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Your data ───────────────────────────────────────────── */

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
  const card = 'flex flex-col gap-2.5 rounded-lg border p-5';
  const ico = 'flex h-10 w-10 items-center justify-center rounded-[9px]';

  return (
    <div className="flex flex-col gap-4">
      <Title t="Your data" sub="Everything we hold about you, and how to leave." />
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
              <div><button onClick={keep} disabled={busy === 'keep'} className={btnLine}>Keep my account</button></div>
            </>
          ) : step === 'code' ? (
            <>
              <p className="text-sm text-ink2">We sent a six-digit code to <strong className="text-navy">{me.email}</strong>. Type it to confirm.</p>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code from your email"
                className="h-11 w-44 rounded-lg border border-line px-3 text-center text-xl font-extrabold tracking-[0.3em] text-navy outline-none focus:border-azure" />
              <label className="flex items-center gap-2 text-[13.5px] text-ink2"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} className="h-[18px] w-[18px] accent-[#C1352B]" />I understand my courses and certificates stop working.</label>
              <div className="flex gap-2">
                <button onClick={confirm} disabled={busy === 'confirm' || code.length < 6 || !sure} className="h-9 rounded-md bg-[#C1352B] px-3.5 text-[13.5px] font-bold text-white disabled:opacity-50">Delete in 7 days</button>
                <button onClick={() => setStep('idle')} className={btnLine}>Cancel</button>
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
      <p className="rounded-lg border border-line px-4 py-3 text-[13px] text-ink2"><strong className="text-navy">What we keep and why:</strong> profile and progress while your account is open · payments for 6 years, for tax · sign-in codes for 10 minutes.</p>
    </div>
  );
}
