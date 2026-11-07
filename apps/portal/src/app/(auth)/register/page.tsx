'use client';
import { useState, useEffect, useRef, Fragment as _Fragment, KeyboardEvent, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Fragment = _Fragment as any;
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { scaleFade } from '@/lib/motion';
import api, { setAuthToken } from '@/lib/api';
import { AuthShell, AuthTitle, Divider, authButton, authInput, type Hero } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Icon } from '@/components/ui/Icon';

// ── Types ──────────────────────────────────────────────────────────────────
type Role = 'student' | 'teacher';
interface Country { id: string; name: string; code: string; currency: string; }
interface TaxSubject { id: string; name: string; }
interface TaxProgramme { id: string; name: string; shortName: string | null; subjects: TaxSubject[]; countries: { id: string }[]; }
interface Preview { name: string; country: string; meta: string; tags: string[]; bio: string; }
type LeftContent = Hero;



const QUALIFICATIONS = [
  { value: 'HIGH_SCHOOL', label: 'High school' },
  { value: 'BACHELOR', label: 'Bachelor’s' },
  { value: 'MASTER', label: 'Master’s' },
  { value: 'PHD', label: 'PhD' },
  { value: 'PROFESSIONAL', label: 'Professional qualification' },
];
const MODALITIES = [
  { value: 'ONLINE', label: 'Online', icon: 'monitor' as const, desc: 'Live and recorded' },
  { value: 'IN_PERSON', label: 'In person', icon: 'school' as const, desc: 'At a centre' },
  { value: 'HYBRID', label: 'Hybrid', icon: 'refresh' as const, desc: 'Both' },
];

const inputCls = authInput;

function apiError(err: any, fallback: string) {
  const m = err?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m ?? fallback;
}

// ── Password strength ──────────────────────────────────────────────────────
function pwStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#f59e0b', '#5889FA', '#405FAD', '#072061'];
  return { score: s, label: labels[s] ?? '', color: colors[s] ?? '#E6ECFD' };
}

// ── Small building blocks ──────────────────────────────────────────────────
function Field({ label, optional, hint, good, wide, children }: { label: string; optional?: boolean; hint?: React.ReactNode; good?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-semibold text-navy/70">{label} {optional && <span className="font-normal text-royal/40">(optional)</span>}</span>
      {children}
      {hint && <span className={`text-[11px] ${good ? 'font-semibold text-royal' : 'text-royal/45'}`}>{hint}</span>}
    </label>
  );
}

function PrimaryButton({ children, loading, disabled, onClick, type = 'submit' }: { children: React.ReactNode; loading?: boolean; disabled?: boolean; onClick?: () => void; type?: 'submit' | 'button' }) {
  return (
    <button type={type} onClick={onClick} disabled={loading || disabled}
      className={authButton}>
      {loading
        ? <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        : <>{children} <span aria-hidden>→</span></>}
    </button>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <AnimatePresence mode="wait">
      {error && (
        <motion.div key={error} variants={scaleFade} initial="hidden" animate="visible" exit="exit" role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-[11px] text-white">✕</span>{error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepBar({ labels, idx }: { labels: string[]; idx: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[11px] font-bold"><span className="text-navy">{labels[idx]}</span><span className="text-royal/50">Step {idx + 1} of {labels.length}</span></div>
      <div className="flex gap-1.5">
        {labels.map((_, i) => <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i < idx ? '#405FAD' : i === idx ? '#5889FA' : '#E6ECFD' }} />)}
      </div>
    </div>
  );
}

function Heading({ eyebrow, title, sub, onBack }: { eyebrow: string; title: string; sub?: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      {onBack && <button type="button" onClick={onBack} className="self-start text-[13px] text-muted hover:text-navy">‹ Back</button>}
      <p className="text-xs font-semibold text-[#3F6FE8]">{eyebrow}</p>
      <AuthTitle>{title}</AuthTitle>
      {sub && <p className="-mt-1 text-[14px] text-ink2">{sub}</p>}
    </div>
  );
}

// ── 6-digit code boxes ─────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, bad }: { value: string; onChange: (v: string) => void; bad: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function change(i: number, raw: string) {
    const d = raw.replace(/\D/g, '').slice(-1);
    const arr = value.padEnd(6, ' ').split('');
    arr[i] = d || ' ';
    onChange(arr.join('').replace(/\s+$/, ''));
    if (d && i < 5) refs.current[i + 1]?.focus();
  }
  function key(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[i]?.trim() && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }
  function paste(e: React.ClipboardEvent) {
    e.preventDefault();
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(p);
    refs.current[Math.min(p.length, 5)]?.focus();
  }
  return (
    <div className={`flex justify-center gap-2 sm:gap-2.5 ${bad ? 'animate-[shake_0.5s_ease]' : ''}`}>
      {Array.from({ length: 6 }, (_, i) => {
        const d = value[i]?.trim() ?? '';
        return (
          <input key={i} ref={el => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
            autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0}
            value={d} onChange={e => change(i, e.target.value)} onKeyDown={e => key(i, e)} onPaste={paste}
            className="h-14 w-11 rounded-lg border-2 text-center text-2xl font-black text-navy outline-none transition-all sm:w-12"
            style={{ borderColor: bad ? '#FCA5A5' : d ? '#5889FA' : '#E6ECFD', background: d ? 'rgba(88,137,250,0.06)' : '#fff', boxShadow: d ? '0 0 0 4px rgba(88,137,250,0.1)' : 'none' }} />
        );
      })}
    </div>
  );
}

/** Asks for the emailed code and checks it. Resend waits a minute between sends. */
function CodeStep({ email, cta, busy, error, setError, onVerified, onChangeEmail }: {
  email: string; cta: string; busy?: boolean; error: string; setError: (e: string) => void;
  onVerified: () => Promise<void> | void; onChangeEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // Already checked (e.g. the account step after it failed): just try that again
    if (verified) { await onVerified(); return; }
    if (code.replace(/\D/g, '').length < 6) { setError('Enter all 6 digits.'); return; }
    setChecking(true);
    try {
      await api.post('/auth/otp/verify', { email, code });
      setVerified(true);
      await onVerified();
    } catch (err) {
      setCode(''); setBad(true); setTimeout(() => setBad(false), 600);
      setError(apiError(err, 'That code isn’t right.'));
    } finally { setChecking(false); }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError('');
    try { await api.post('/auth/otp/send', { email }); setCooldown(60); setCode(''); }
    catch (err) { setError(apiError(err, 'Could not send a new code. Try again.')); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-4 pt-1">
        {!verified && <OtpBoxes value={code} onChange={setCode} bad={bad} />}
        {verified && <p className="rounded-md bg-azure/10 px-3 py-1.5 text-xs font-semibold text-royal">✓ Email checked</p>}
        {!verified && (
          <p className="text-xs text-royal/55">
            <button type="button" onClick={onChangeEmail} className="underline hover:text-navy">Change email</button>
            <span className="mx-3">·</span>
            <button type="button" onClick={resend} disabled={cooldown > 0} className="font-semibold text-azure disabled:font-normal disabled:text-royal/45">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
            </button>
          </p>
        )}
      </div>
      <ErrorBox error={error} />
      <PrimaryButton loading={checking || busy}>{cta}</PrimaryButton>
    </form>
  );
}

// ── Country picker ─────────────────────────────────────────────────────────
function CountrySelect({ value, onChange, countries }: { value: string; onChange: (id: string) => void; countries: Country[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const selected = countries.find(c => c.id === value);
  const q = search.toLowerCase();
  const filtered = countries.filter(c => c.name.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q));

  useEffect(() => {
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);

  return (
    <div ref={wrap} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch(''); }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        className="flex w-full items-center gap-2 rounded-lg border-2 bg-white px-4 py-3 text-left text-sm outline-none transition-all"
        style={{ borderColor: open ? '#5889FA' : '#E6ECFD', boxShadow: open ? '0 0 0 4px rgba(88,137,250,0.1)' : 'none' }}>
        <span className="flex-1 truncate" style={{ color: selected ? '#072061' : 'rgba(64,95,173,0.4)' }}>{selected ? selected.name : 'Select your country'}</span>
        <span className="text-royal/40" style={{ transform: open ? 'rotate(180deg)' : undefined }}>▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-cloud bg-white" style={{ boxShadow: '0 8px 32px rgba(7,32,97,0.14)' }}>
          <div className="border-b border-cloud p-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} placeholder="Search country"
              className="w-full rounded-md border border-cloud bg-cloud/30 px-3 py-2 text-sm text-navy outline-none placeholder:text-royal/40 focus:border-azure focus:bg-white" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-4 py-4 text-center text-xs text-royal/40">No countries found</p>
              : filtered.map(c => (
                <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-azure/5 ${value === c.id ? 'bg-azure/[0.07]' : ''}`}>
                  <span className="flex-1 font-medium text-navy">{c.name}</span><span className="font-mono text-[11px] text-royal/50">{c.currency}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required minLength={8}
        autoComplete="new-password" className={`${inputCls} pr-16`} />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-royal/50 hover:text-azure">{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

function StrengthHint({ pw }: { pw: string }) {
  if (!pw) return <>At least 8 characters</>;
  const s = pwStrength(pw);
  return (
    <span className="flex items-center gap-2">
      <span className="flex flex-1 gap-1">{[1, 2, 3, 4, 5].map(i => <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= s.score ? s.color : '#E6ECFD' }} />)}</span>
      <span className="font-bold" style={{ color: s.color }}>{pw.length < 8 ? 'Too short' : s.label}</span>
    </span>
  );
}

// ── Teacher's profile preview (on the blue side) ──────────────────────────
function PreviewCard({ p }: { p: Preview }) {
  return (
    <div className="mt-2 flex w-[min(430px,92%)] -rotate-[1.5deg] flex-col gap-3 rounded-[10px] bg-[#FFFDF8] p-[18px] shadow-[0_10px_24px_rgba(7,32,97,0.18)]">
      <p className="text-[10px] font-bold tracking-[0.15em] text-[#3F6FE8]">HOW STUDENTS WILL SEE YOU</p>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3F6FE8] font-black text-white">{(p.name[0] ?? '?').toUpperCase()}</span>
        <div><p className="text-sm font-bold text-navy">{p.name || 'Your name'}</p><p className="text-xs text-muted">{p.meta}</p></div>
      </div>
      {p.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{p.tags.map(t => <span key={t} className="rounded-md bg-[#EAF0FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2F57C9]">{t}</span>)}</div>}
      <p className="line-clamp-3 text-xs leading-relaxed text-ink2">{p.bio}</p>
    </div>
  );
}

// ── Student sign-up ────────────────────────────────────────────────────────
type Existing = 'portal' | 'website' | null;

/** Before sending a code: if the email already has an account, point the person to sign in instead */
async function existingAccount(email: string): Promise<Existing> {
  try { return (await api.post<{ exists: Existing }>('/auth/register/check', { email: email.trim() })).data.exists; }
  catch { return null; } // can't tell: let sign-up carry on and decide
}

function AlreadyHaveAccount({ where, email }: { where: Exclude<Existing, null>; email: string }) {
  const q = `?email=${encodeURIComponent(email.trim())}`;
  return (
    <div role="alert" className="flex flex-col gap-2.5 rounded-lg border border-[#5889FA] bg-[#EAF0FF] px-4 py-3.5 text-[13.5px] text-navy">
      <strong className="text-sm">You already have an account with this email.</strong>
      <span className="text-ink2">{where === 'website'
        ? 'You signed up on careerpathafrica.com before. Sign in here with that same password; your portal account is made the first time you do.'
        : 'Sign in with your password, or with a code we email you.'}</span>
      <div className="flex flex-wrap gap-2">
        <Link href={`/login${q}`} className="inline-flex h-9 items-center rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-bold text-white hover:bg-[#2F57C9]">Sign in</Link>
        <Link href={`/forgot-password${q}`} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13px] font-semibold text-navy hover:bg-subtle">I forgot my password</Link>
      </div>
    </div>
  );
}

function StudentFlow({ countries, nextUrl, school, onBack, setLeft }: { countries: Country[]; nextUrl: string | null; school: string | null; onBack: () => void; setLeft: (c: LeftContent) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [form, setForm] = useState({ email: '', password: '', phone: '', countryId: '' });
  const [step, setStep] = useState<'details' | 'code' | 'finish'>('details');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<Existing>(null);

  // Referral code from ?ref=…, kept for the session in case the URL changes
  const [referralCode, setReferralCode] = useState('');
  useEffect(() => {
    const fromUrl = searchParams?.get('ref')?.trim();
    try {
      if (fromUrl) sessionStorage.setItem('cpa_ref', fromUrl);
      setReferralCode(fromUrl || sessionStorage.getItem('cpa_ref') || '');
    } catch { setReferralCode(fromUrl ?? ''); }
  }, [searchParams]);

  useEffect(() => {
    setLeft(step === 'details'
      ? { lines: ['Every pass', 'starts with one question.'], sub: 'Free to join. Pay only for the courses you take, by mobile money or card.', cards: [{ icon: 'Q', title: 'Question 1', body: 'Which measure is most affected by outliers?' }, { icon: 'Y', title: 'You', body: 'The mean. Got it first time.', pill: '+1 right' }] }
      : step === 'code'
        ? { lines: ['One quick', 'check.'], sub: 'We sent a six-digit code to your inbox. It works for ten minutes.', cards: [{ icon: '✉', title: 'CareerPath Africa', body: 'Your code is in your inbox. Look in spam if it isn’t.' }] }
        : { lines: ['Nearly', 'there.'], sub: 'A password to sign in with, and your country so prices show in your own currency.', cards: [{ icon: 'Y', title: 'You', body: 'Account ready. Picking my exams next.', pill: 'Last step' }] });
  }, [step, setLeft]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const country = countries.find(c => c.id === form.countryId);
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!firstName || !lastName) { setError('Write your first and last name.'); return; }
    setSending(true);
    const found = await existingAccount(form.email);
    setExisting(found);
    if (found) { setSending(false); return; }
    try { await api.post('/auth/otp/send', { email: form.email.trim() }); setStep('code'); }
    catch (err) { setError(apiError(err, 'Could not send the code. Try again.')); }
    finally { setSending(false); }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Your password needs at least 8 characters.'); return; }
    if (!form.countryId) { setError('Please pick your country.'); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/auth/register/student', { firstName, lastName, ...form, email: form.email.trim(), ...(referralCode && { referralCode }) });
      try { sessionStorage.removeItem('cpa_ref'); } catch { /* storage unavailable */ }
      await setAuthToken(data.accessToken, true);
      router.push(`/student/onboarding${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`);
    } catch (err) {
      setError(apiError(err, 'Could not create your account. Try again.'));
      setCreating(false);
    }
  }

  const banners = (
    <>
      {school && <div className="flex items-center gap-2.5 rounded-lg bg-[#EAF0FF] px-3.5 py-3 text-[13.5px] text-navy"><Icon name="school" size={20} className="flex-shrink-0 text-[#3F6FE8]" /><span><strong>Joining {school}.</strong> Your place is saved; it’s yours once your account is ready.</span></div>}
      {referralCode && <div className="rounded-lg bg-[#EAF0FF] px-3.5 py-2.5 text-[13px] text-navy">🎁 Invited by a friend. Code <strong>{referralCode}</strong> is applied.</div>}
    </>
  );

  if (step === 'code') return (
    <div className="flex flex-col gap-4">
      <Heading eyebrow="Student account · 2 of 3" title="Check your email." sub={<>Code sent to <strong className="text-navy">{form.email}</strong></>} onBack={() => { setError(''); setStep('details'); }} />
      <CodeStep email={form.email.trim()} cta="Continue" error={error} setError={setError}
        onVerified={() => { setError(''); setStep('finish'); }} onChangeEmail={() => { setError(''); setStep('details'); }} />
    </div>
  );

  if (step === 'finish') return (
    <form onSubmit={createAccount} className="flex flex-col gap-4">
      <Heading eyebrow="Student account · 3 of 3" title="Nearly there." sub={<>Signed up as <strong className="text-navy">{form.email}</strong> ✓</>} />
      {banners}
      <Field label="Password" hint={<StrengthHint pw={form.password} />}><PasswordInput value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} /></Field>
      <Field label="Country" hint={country ? `Prices in ${country.currency}` : 'Sets your currency'}><CountrySelect value={form.countryId} onChange={id => setForm(f => ({ ...f, countryId: id }))} countries={countries} /></Field>
      <Field label="Phone" optional hint="For mobile money and class reminders"><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+237 6 77 12 34 56" className={inputCls} /></Field>
      <ErrorBox error={error} />
      <PrimaryButton loading={creating}>Create my account</PrimaryButton>
    </form>
  );

  return (
    <form onSubmit={sendCode} className="flex flex-col gap-4">
      <Heading eyebrow="Student account" title="Good to have you." onBack={onBack} />
      {banners}
      <Field label="Your name"><input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" placeholder="First and last name" className={inputCls} /></Field>
      <Field label="Email address" hint="We’ll send a code to check it’s yours."><input type="email" value={form.email} onChange={e => { setExisting(null); set('email')(e); }} required autoComplete="email" placeholder="you@example.com" className={inputCls} /></Field>
      {existing && <AlreadyHaveAccount where={existing} email={form.email} />}
      <ErrorBox error={error} />
      <PrimaryButton loading={sending}>Send code</PrimaryButton>
      <p className="text-center text-[12.5px] text-muted">By creating an account, you agree to the Terms and Privacy Policy.</p>
    </form>
  );
}

// ── Teacher application ────────────────────────────────────────────────────
const T_STEPS = ['Account', 'Email code', 'Teaching', 'About you', 'Review'];

function ChipPicker({ label, items, selected, onToggle, placeholder }: {
  label: string; items: { id: string; name: string }[]; selected: string[]; onToggle: (id: string) => void; placeholder: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const picked = items.filter(i => selected.includes(i.id));
  const rest = items.filter(i => !selected.includes(i.id) && (!query || i.name.toLowerCase().includes(query)));
  const shown = [...picked, ...rest.slice(0, query ? 30 : 12)];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-navy/70">{label} {picked.length > 0 && <span className="font-normal text-royal/50">· {picked.length} chosen</span>}</span>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className={inputCls} />
      <div className="flex flex-wrap gap-1.5">
        {shown.map(i => {
          const on = selected.includes(i.id);
          return (
            <button key={i.id} type="button" onClick={() => onToggle(i.id)} aria-pressed={on}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${on ? 'bg-azure text-white' : 'border border-cloud text-royal/70 hover:border-azure/50'}`}>
              {on ? '✓ ' : ''}{i.name}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-xs text-royal/45">Nothing matches “{q}”.</span>}
      </div>
    </div>
  );
}

function TeacherFlow({ countries, onBack, setLeft }: { countries: Country[]; onBack: () => void; setLeft: (c: LeftContent) => void }) {
  const [step, setStep] = useState(0); // 0 account · 1 code · 2 teaching · 3 about · 4 review · 5 sent
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '', countryId: '',
    teachingProgrammeIds: [] as string[], teachingSubjectIds: [] as string[], teachingModality: '', yearsExperience: '',
    qualification: '', bio: '', documentUrl: '', documentName: '', linkedinUrl: '', websiteUrl: '',
  });
  const [programmes, setProgrammes] = useState<TaxProgramme[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<Existing>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/catalogue/programmes').then(r => setProgrammes((r.data ?? []).map((p: any) => ({ id: p.id, name: p.name, shortName: p.shortName, subjects: p.subjects ?? [], countries: p.countries ?? [] })))).catch(() => {});
  }, []);

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k: 'teachingProgrammeIds' | 'teachingSubjectIds', id: string) =>
    setForm(f => ({ ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] }));
  const go = (s: number) => { setError(''); setStep(s); window.scrollTo?.({ top: 0 }); };

  // Programme chips use the short name, the teacher's own country first; subjects come from the chosen programmes first
  const progItems = [...programmes]
    .sort((a, b) => Number(!!form.countryId && b.countries?.some(c => c.id === form.countryId)) - Number(!!form.countryId && a.countries?.some(c => c.id === form.countryId)))
    .map(p => ({ id: p.id, name: p.shortName ?? p.name }));
  const allSubjects = new Map<string, TaxSubject>();
  const chosenProgs = programmes.filter(p => form.teachingProgrammeIds.includes(p.id));
  for (const p of (chosenProgs.length ? chosenProgs : programmes)) for (const s of p.subjects) allSubjects.set(s.id, s);
  for (const p of programmes) for (const s of p.subjects) if (form.teachingSubjectIds.includes(s.id)) allSubjects.set(s.id, s);
  const subjectItems = [...allSubjects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const subjectName = (id: string) => programmes.flatMap(p => p.subjects).find(s => s.id === id)?.name ?? '';
  const country = countries.find(c => c.id === form.countryId);
  const modality = MODALITIES.find(m => m.value === form.teachingModality);
  const qualification = QUALIFICATIONS.find(q => q.value === form.qualification);
  const progNames = form.teachingProgrammeIds.map(id => progItems.find(p => p.id === id)?.name ?? '').filter(Boolean);
  const subjNames = form.teachingSubjectIds.map(subjectName).filter(Boolean);

  // Left panel: steps first, then a live preview built from what they've typed
  useEffect(() => {
    const preview: Preview = {
      name: `${form.firstName} ${form.lastName}`.trim(), country: country?.name ?? '',
      meta: [country?.name, modality?.label, form.yearsExperience ? `${form.yearsExperience} years teaching` : ''].filter(Boolean).join(' · ') || 'Your country and how you teach',
      tags: [...progNames, ...subjNames].slice(0, 6),
      bio: form.bio.trim() ? (form.bio.length > 160 ? form.bio.slice(0, 160) + '…' : form.bio) : 'Your bio shows here after the next step.',
    };
    const card = <PreviewCard p={preview} />;
    const L: LeftContent[] = [
      { lines: ['Teach students', 'across Africa.'], sub: 'Apply in five short steps. A person on our team reads every application.', cards: [{ icon: 'T', title: 'Your course', body: 'Built here, or brought from WordPress. You set the price.' }, { icon: '₵', title: 'Payouts', body: 'Paid monthly to mobile money or bank.', pill: 'Monthly' }] },
      { lines: ['One quick', 'check.'], sub: 'We sent a six-digit code to your inbox. It works for ten minutes. Five tries, then ask for a new one.', cards: [{ icon: '✉', title: 'CareerPath Africa', body: 'Your code is in your inbox. Look in spam if it isn’t.' }] },
      { lines: ['What will', 'you teach?'], sub: 'Students find teachers by programme and subject.', extra: card },
      { lines: ['Make your', 'profile shine.'], sub: 'A clear bio and a CV get you approved faster.', extra: card },
      { lines: ['Almost', 'there.'], sub: 'Check it over. You can’t change it after sending.', extra: card },
      { lines: ['Thanks,', `${form.firstName || 'teacher'}.`], sub: `We emailed a copy to ${form.email}.`, extra: card },
    ];
    setLeft(L[step]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form, programmes, countries, setLeft]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (form.password.length < 8) { setError('Your password needs at least 8 characters.'); return; }
    if (form.password !== form.confirmPassword) { setError('The two passwords don’t match.'); return; }
    if (!form.countryId) { setError('Please pick your country.'); return; }
    setBusy(true);
    const found = await existingAccount(form.email);
    setExisting(found);
    if (found) { setBusy(false); return; }
    try { await api.post('/auth/otp/send', { email: form.email.trim() }); go(1); }
    catch (err) { setError(apiError(err, 'Could not send the code. Try again.')); }
    finally { setBusy(false); }
  }

  function teachingNext(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teachingProgrammeIds.length && !form.teachingSubjectIds.length) { setError('Pick at least one programme or subject.'); return; }
    if (!form.teachingModality) { setError('Pick how you teach.'); return; }
    go(3);
  }

  function aboutNext(e: React.FormEvent) {
    e.preventDefault();
    if (!form.qualification) { setError('Pick your highest qualification.'); return; }
    if (form.bio.trim().length < 100) { setError('Your bio needs at least 100 characters.'); return; }
    go(4);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB.'); return; }
    setError(''); setUploading(1);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('email', form.email.trim());
      const r = await api.post('/files/application-doc', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: p => setUploading(Math.max(1, Math.round((p.loaded / (p.total ?? 1)) * 100))),
      });
      setForm(f => ({ ...f, documentUrl: r.data.url, documentName: `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` }));
    } catch (err) { setError(apiError(err, 'Upload failed. Try again.')); }
    finally { setUploading(0); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function submit() {
    if (!agree) { setError('Please accept the teacher agreement.'); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/register/teacher', {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), password: form.password,
        phone: form.phone.trim() || undefined, countryId: form.countryId || undefined,
        subjectAreas: subjNames.length ? subjNames : progNames,
        teachingSubjectIds: form.teachingSubjectIds, teachingProgrammeIds: form.teachingProgrammeIds,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        qualification: form.qualification || undefined, teachingModality: form.teachingModality || undefined,
        bio: form.bio.trim(), documentUrl: form.documentUrl || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined, websiteUrl: form.websiteUrl.trim() || undefined,
        agreementAccepted: true, agreementVersion: 'v1.0',
      });
      go(5);
    } catch (err) { setError(apiError(err, 'Could not send your application. Try again.')); }
    finally { setBusy(false); }
  }

  const head = (title: string, sub: React.ReactNode, back: () => void) => (
    <>
      <StepBar labels={T_STEPS} idx={step} />
      <Heading eyebrow="Teacher application" title={title} sub={sub} onBack={back} />
    </>
  );

  if (step === 0) return (
    <form onSubmit={sendCode} className="flex flex-col gap-5">
      {head('Your account', 'You’ll sign in with this once approved.', onBack)}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="First name"><input value={form.firstName} onChange={e => setF('firstName', e.target.value)} required autoComplete="given-name" className={inputCls} /></Field>
        <Field label="Last name"><input value={form.lastName} onChange={e => setF('lastName', e.target.value)} required autoComplete="family-name" className={inputCls} /></Field>
        <Field label="Email address" wide><input type="email" value={form.email} onChange={e => { setExisting(null); setF('email', e.target.value); }} required autoComplete="email" placeholder="you@example.com" className={inputCls} /></Field>
        <Field label="Password" hint={<StrengthHint pw={form.password} />}><PasswordInput value={form.password} onChange={v => setF('password', v)} /></Field>
        <Field label="Confirm" good={!!form.confirmPassword && form.confirmPassword === form.password}
          hint={form.confirmPassword ? (form.confirmPassword === form.password ? '✓ Passwords match' : 'Doesn’t match yet') : undefined}>
          <PasswordInput value={form.confirmPassword} onChange={v => setF('confirmPassword', v)} />
        </Field>
        <Field label="Country"><CountrySelect value={form.countryId} onChange={id => setF('countryId', id)} countries={countries} /></Field>
        <Field label="Phone" optional><input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} autoComplete="tel" placeholder="+233 24 123 4567" className={inputCls} /></Field>
      </div>
      {existing && <AlreadyHaveAccount where={existing} email={form.email} />}
      <ErrorBox error={error} />
      <PrimaryButton loading={busy}>Send my code</PrimaryButton>
    </form>
  );

  if (step === 1) return (
    <div className="flex flex-col gap-5">
      {head('Check your email', <>Code sent to <strong className="text-navy">{form.email}</strong></>, () => go(0))}
      <CodeStep email={form.email.trim()} cta="Verify" error={error} setError={setError} onVerified={() => go(2)} onChangeEmail={() => go(0)} />
    </div>
  );

  if (step === 2) return (
    <form onSubmit={teachingNext} className="flex flex-col gap-5">
      {head('Teaching profile', 'Pick everything that fits.', () => go(1))}
      <ChipPicker label="Programmes" items={progItems} selected={form.teachingProgrammeIds} onToggle={id => toggle('teachingProgrammeIds', id)} placeholder={`Search ${progItems.length || ''} programmes`.replace('  ', ' ')} />
      <ChipPicker label="Subjects" items={subjectItems} selected={form.teachingSubjectIds} onToggle={id => toggle('teachingSubjectIds', id)} placeholder="Search subjects" />
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-navy/70">How you teach</span>
        <div className="grid grid-cols-3 gap-2">
          {MODALITIES.map(m => {
            const on = form.teachingModality === m.value;
            return (
              <button key={m.value} type="button" onClick={() => setF('teachingModality', m.value)} aria-pressed={on}
                className={`flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-3 text-center transition ${on ? 'border-azure bg-azure/[0.06]' : 'border-cloud hover:border-azure/40'}`}>
                <Icon name={m.icon} size={22} className="text-[#3F6FE8]" /><strong className="text-[13px] text-navy">{m.label}</strong><span className="text-[11px] text-royal/55">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Years teaching" optional>
        <input type="number" min={0} max={60} value={form.yearsExperience} onChange={e => setF('yearsExperience', e.target.value)} placeholder="e.g. 6" className={inputCls} />
      </Field>
      <ErrorBox error={error} />
      <PrimaryButton>Continue</PrimaryButton>
    </form>
  );

  if (step === 3) return (
    <form onSubmit={aboutNext} className="flex flex-col gap-5">
      {head('About you', 'Students see your bio. The reviewer sees everything.', () => go(2))}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Highest qualification" wide>
          <select value={form.qualification} onChange={e => setF('qualification', e.target.value)} className={inputCls}>
            <option value="">Select</option>
            {QUALIFICATIONS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </Field>
        <Field label="Bio" wide good={form.bio.trim().length >= 100}
          hint={`${form.bio.trim().length} characters · at least 100`}>
          <textarea rows={5} value={form.bio} onChange={e => setF('bio', e.target.value)} maxLength={2000}
            placeholder="What you teach, where, for how long, and how your students do." className={`${inputCls} resize-y leading-relaxed`} />
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-navy/70">CV or certificate <span className="font-normal text-royal/40">(optional)</span></span>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden" onChange={upload} />
          {form.documentUrl ? (
            <div className="flex items-center gap-3 rounded-lg border-2 border-cloud px-4 py-3 text-sm text-navy">
              <span>📄</span><span className="flex-1 truncate">{form.documentName}</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, documentUrl: '', documentName: '' }))} className="text-xs font-semibold text-azure">Remove</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0}
              className="rounded-lg border-2 border-dashed border-cloud px-4 py-3 text-left text-sm text-royal/60 transition hover:border-azure/50">
              {uploading ? `Uploading… ${uploading}%` : '📎 Choose a file'}
            </button>
          )}
          <span className="text-[11px] text-royal/45">PDF, Word or image, up to 10 MB</span>
        </div>
        <Field label="LinkedIn" optional><input type="url" value={form.linkedinUrl} onChange={e => setF('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/…" className={inputCls} /></Field>
        <Field label="Website" optional><input type="url" value={form.websiteUrl} onChange={e => setF('websiteUrl', e.target.value)} placeholder="https://" className={inputCls} /></Field>
      </div>
      <ErrorBox error={error} />
      <PrimaryButton>Review my application</PrimaryButton>
    </form>
  );

  if (step === 4) {
    const sections: { t: string; s: number; rows: [string, string][] }[] = [
      { t: 'Account', s: 0, rows: [['Name', `${form.firstName} ${form.lastName}`], ['Email', `${form.email} ✓`], ['Country', [country?.name, form.phone].filter(Boolean).join(' · ')]] },
      { t: 'Teaching', s: 2, rows: [['Programmes', progNames.join(', ') || '—'], ['Subjects', subjNames.join(', ') || '—'], ['How', [modality?.label, form.yearsExperience ? `${form.yearsExperience} years` : ''].filter(Boolean).join(' · ')]] },
      { t: 'About you', s: 3, rows: [['Qualification', qualification?.label ?? '—'], ['Bio', form.bio.length > 90 ? form.bio.slice(0, 90) + '…' : form.bio], ['CV', form.documentName ? form.documentName.split(' · ')[0] : 'None'], ...(form.linkedinUrl ? [['LinkedIn', form.linkedinUrl] as [string, string]] : []), ...(form.websiteUrl ? [['Website', form.websiteUrl] as [string, string]] : [])] },
    ];
    return (
      <div className="flex flex-col gap-4">
        {head('Review and send', 'Tap Edit to change any section.', () => go(3))}
        {sections.map(sec => (
          <div key={sec.t} className="space-y-2 rounded-lg border-2 border-cloud px-4 py-3.5">
            <div className="flex justify-between"><strong className="text-[13px] text-navy">{sec.t}</strong>
              <button type="button" onClick={() => go(sec.s)} className="text-xs font-bold text-azure">Edit</button></div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              {sec.rows.map(([l, v]) => <Fragment key={l}><dt className="text-royal/55">{l}</dt><dd className="break-words text-navy">{v}</dd></Fragment>)}
            </dl>
          </div>
        ))}
        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] text-royal/80">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#5889FA]" />
          <span>I agree to the <Link href="/legal/tutor-agreement" target="_blank" className="font-bold text-azure">teacher agreement</Link>: I’m paid my share of each sale every month, and I only upload material I have the right to use.</span>
        </label>
        <ErrorBox error={error} />
        <PrimaryButton type="button" onClick={submit} loading={busy}>Send application</PrimaryButton>
      </div>
    );
  }

  const after: [string, string, boolean][] = [
    ['Sent', 'Today', true],
    ['An admin reviews it', 'Usually within 2 working days', false],
    ['We email you the decision', 'If something’s missing, we’ll say what', false],
    ['Sign in and set up', 'Payout details, then your first course', false],
  ];
  return (
    <div className="flex flex-col gap-5">
      <Heading eyebrow="All done" title="We’ve got your application" sub="Here’s what happens next." />
      <div className="text-center text-5xl">🎉</div>
      <ol className="space-y-2.5">
        {after.map(([t, d, done], i) => (
          <li key={t} className="flex items-center gap-3 rounded-lg border-2 border-cloud px-3.5 py-3 text-[13.5px]">
            <span className={`flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-azure text-white' : 'border-2 border-cloud text-royal/60'}`}>{done ? '✓' : i + 1}</span>
            <span><strong className="text-navy">{t}</strong><br /><span className="text-xs text-royal/60">{d}</span></span>
          </li>
        ))}
      </ol>
      <Link href="/" className="flex w-full items-center justify-center gap-2 rounded-md py-4 text-sm font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>Back to the website →</Link>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
const CHOOSE_LEFT: LeftContent = {
  lines: ['Every pass', 'starts with one question.'], sub: 'Exam prep, live classes and real teachers for students across Africa.',
  cards: [{ icon: 'T', title: 'Your teacher', body: 'New mock exam: WASSCE Maths, Paper 1.' }, { icon: 'Y', title: 'You', body: 'Starting it after school. Wish me luck.', pill: 'Free to join' }],
};

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams?.get('next') ?? null;
  const [nextUrl, setNextUrl] = useState(nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null);
  const initial = searchParams?.get('role');
  const [role, setRole] = useState<Role | null>(initial === 'teacher' || initial === 'student' ? initial : null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [left, setLeft] = useState<LeftContent>(CHOOSE_LEFT);
  const [school, setSchool] = useState<string | null>(null);
  const [schoolCode, setSchoolCode] = useState('');
  const [schoolError, setSchoolError] = useState('');
  const [checking, setChecking] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => { api.get('/countries').then(r => setCountries(r.data ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (!role) setLeft(CHOOSE_LEFT); }, [role]);

  // Came from a school's join link (or typed its code): show which school is holding the place
  useEffect(() => {
    let code: string | null = null;
    try { code = localStorage.getItem('cpa:pendingJoin'); } catch { /* storage unavailable */ }
    if (!code && nextUrl?.startsWith('/student/join/')) code = nextUrl.split('/')[3] ?? null;
    if (!code) return;
    api.get(`/org/join/${encodeURIComponent(code)}`).then(r => { if (r.data?.valid && r.data.open) setSchool(r.data.name); }).catch(() => {});
  }, [nextUrl]);

  async function joinSchool(e: React.FormEvent) {
    e.preventDefault();
    const code = schoolCode.trim();
    if (!code) return;
    setSchoolError(''); setChecking(true);
    try {
      const { data } = await api.get(`/org/join/${encodeURIComponent(code)}`);
      if (!data?.valid) setSchoolError('That code isn’t active. Check it with your school.');
      else if (!data.open) setSchoolError(`All of ${data.name}’s places are taken. Ask your school to add more.`);
      else {
        // The student area takes the seat right after sign-up, same as with the join link
        try { localStorage.setItem('cpa:pendingJoin', code); } catch { /* storage unavailable */ }
        setNextUrl(`/student/join/${code}`);
        setSchool(data.name);
        setRole('student');
      }
    } catch { setSchoolError('Couldn’t check that code. Try again.'); }
    finally { setChecking(false); }
  }

  async function withGoogle(credential: string) {
    try {
      const { data } = await api.post('/auth/google', { credential });
      await setAuthToken(data.accessToken, true);
      router.push(`/student/onboarding${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`);
    } catch (err) { setSchoolError(apiError(err, 'Google sign-in didn’t work. Try your email instead.')); }
  }

  const signIn = `/login${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`;
  return (
    <AuthShell hero={left} wide={role === 'teacher'}>
      {role === null && (
        <>
          <AuthTitle>Good to have you.</AuthTitle>
          {([
            { r: 'student' as Role, icon: 'student' as const, t: 'I’m a student', d: 'Prepare for exams and build skills' },
            { r: 'teacher' as Role, icon: 'teacher' as const, t: 'I want to teach', d: 'Apply in five short steps' },
          ]).map(c => (
            <button key={c.r} type="button" onClick={() => setRole(c.r)}
              className="flex items-center gap-3.5 rounded-lg border border-line bg-white px-[18px] py-4 text-left transition hover:border-[#5889FA]">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] text-[#3F6FE8]"><Icon name={c.icon} size={24} /></span>
              <span className="flex-1"><strong className="text-[15px] text-navy">{c.t}</strong><br /><span className="text-[13px] text-muted">{c.d}</span></span>
              <span className="text-muted">›</span>
            </button>
          ))}
          <form onSubmit={joinSchool} className="flex flex-col gap-2 rounded-lg border border-dashed border-[#5889FA] bg-white px-4 py-3.5">
            <label htmlFor="school-code" className="flex items-center gap-2 text-sm font-semibold text-navy"><Icon name="school" size={18} className="text-[#3F6FE8]" />Have a school code?</label>
            <div className="flex gap-2">
              <input id="school-code" value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} placeholder="e.g. ACCRA-7K2Q" autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 font-mono text-[15px] tracking-[0.1em] text-navy outline-none focus:border-[#5889FA]" />
              <button type="submit" disabled={checking || !schoolCode.trim()} className="h-11 rounded-lg bg-[#EAF0FF] px-4 text-sm font-semibold text-[#2F57C9] disabled:opacity-50">{checking ? 'Checking…' : 'Join my school'}</button>
            </div>
            {schoolError ? <span role="alert" className="text-xs text-[#C1352B]">{schoolError}</span> : <span className="text-xs text-muted">Your school paid for your place. You’ll create your account next.</span>}
          </form>
          <span className="my-1.5 h-px bg-line" />
          <p className="text-center text-sm text-ink2">Already have an account? <Link href={signIn} className="font-bold text-[#3F6FE8]">Sign in</Link></p>
        </>
      )}
      {role === 'student' && (
        <>
          <GoogleButton onCredential={withGoogle} onReady={setGoogleOn} />
          {googleOn && <Divider>or, with your email</Divider>}
          <StudentFlow countries={countries} nextUrl={nextUrl} school={school} onBack={() => setRole(null)} setLeft={setLeft} />
          <p className="text-center text-sm text-ink2">Already have an account? <Link href={signIn} className="font-bold text-[#3F6FE8]">Sign in</Link></p>
        </>
      )}
      {role === 'teacher' && <TeacherFlow countries={countries} onBack={() => setRole(null)} setLeft={setLeft} />}

      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-6px)} 30%{transform:translateX(6px)} 45%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 75%{transform:translateX(-2px)} 90%{transform:translateX(2px)} }
        .animate-\\[shake_0\\.5s_ease\\] { animation: shake 0.5s ease; }
      `}</style>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterPageInner /></Suspense>;
}
