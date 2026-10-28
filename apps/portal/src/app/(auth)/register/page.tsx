'use client';
import { useState, useEffect, useRef, useCallback, KeyboardEvent, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { AnimatePresence, motion } from 'framer-motion';
import { slideRight, slideLeft, spring, scaleFade } from '@/lib/motion';
import api, { setAuthToken } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────
type Role = 'student' | 'teacher';
type WizardStep = 1 | 'otp' | 2 | 3 | 4;
interface Country { id: string; name: string; code: string; currency: string; }
interface TaxSubject { id: string; name: string; category: string; }
interface TaxProgramme { id: string; name: string; shortName: string | null; type: string; }
type TeacherForm = {
  firstName: string; lastName: string; email: string;
  password: string; confirmPassword: string; phone: string; countryId: string;
  subjectAreas: string[]; teachingSubjectIds: string[]; teachingProgrammeIds: string[]; yearsExperience: number;
  qualification: string; teachingModality: string;
  bio: string; linkedinUrl: string; websiteUrl: string; documentUrl: string;
};

const ROLE_HOME: Record<string, string> = {
  STUDENT: '/student/dashboard', TEACHER: '/teacher/dashboard', ADMIN: '/admin/dashboard',
};

// ── Password strength ──────────────────────────────────────────────────────
function pwStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors  = ['', '#ef4444', '#f59e0b', '#5889FA', '#405FAD', '#072061'];
  return { score: s, label: labels[s] ?? '', color: colors[s] ?? '#e6ecfd' };
}

// ── Suggested subject chips ────────────────────────────────────────────────
const SUGGESTED_SUBJECTS = [
  'Python', 'Data Science', 'Business', 'Design', 'Marketing',
  'Finance', 'Leadership', 'Project Mgmt', 'Cybersecurity', 'AI & ML',
];

const QUALIFICATIONS = [
  { value: 'HIGH_SCHOOL',  label: 'High school',  icon: '🎒' },
  { value: 'BACHELOR',     label: "Bachelor's",   icon: '🎓' },
  { value: 'MASTER',       label: "Master's",     icon: '📜' },
  { value: 'PHD',          label: 'PhD',          icon: '🔬' },
  { value: 'PROFESSIONAL', label: 'Professional', icon: '🏅' },
];

const MODALITIES = [
  { value: 'ONLINE',    label: 'Online',     emoji: '💻', desc: 'Teach from anywhere' },
  { value: 'IN_PERSON', label: 'In-person',  emoji: '🏫', desc: 'Face-to-face sessions' },
  { value: 'HYBRID',    label: 'Hybrid',     emoji: '🔄', desc: 'Best of both worlds' },
];

// ── Left panel content per step ────────────────────────────────────────────
const LEFT_CONTENT: Record<string, { eyebrow: string; headline: string; sub: string; visual: string }> = {
  role:  { eyebrow: 'Join 12,400+ professionals', headline: 'Your journey\nstarts here.', sub: 'Learn in-demand skills, get certified, and build a career across Africa.', visual: 'role' },
  '1':   { eyebrow: 'Step 1 of 4 · Account setup', headline: 'Create your\nfree account.', sub: 'Your email will be verified before you can continue.', visual: 'account' },
  otp:   { eyebrow: 'Email verification', headline: 'One quick\ncheck.', sub: 'We sent a 6-digit code to your inbox. It expires in 10 minutes.', visual: 'otp' },
  '2':   { eyebrow: 'Step 2 of 4 · Teaching profile', headline: 'What will\nyou teach?', sub: 'Tell us your subjects and how you prefer to deliver sessions.', visual: 'teaching' },
  '3':   { eyebrow: 'Step 3 of 4 · About you', headline: 'Make your\nprofile shine.', sub: 'A great bio and credentials help get your application approved faster.', visual: 'about' },
  '4':   { eyebrow: 'Step 4 of 4 · Review', headline: 'Almost\nthere!', sub: 'Review your application before submitting. You can edit any section.', visual: 'review' },
};

// ── OTP countdown ring ─────────────────────────────────────────────────────
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28, circ = 2 * Math.PI * r;
  const progress = seconds / total;
  const dash = circ * progress;
  const isLow = seconds < 60;
  return (
    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#E6ECFD" strokeWidth="4" />
      <circle cx="36" cy="36" r={r} fill="none"
        stroke={isLow ? '#405FAD' : '#5889FA'} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }} />
      <text x="36" y="40" textAnchor="middle" className="rotate-90"
        style={{ fill: '#072061', fontSize: 12, fontWeight: 700, transform: 'rotate(90deg)', transformOrigin: '36px 36px' }}>
        {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
      </text>
    </svg>
  );
}

// ── OTP Input boxes ────────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, shake }: { value: string; onChange: (v: string) => void; shake: boolean }) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    arr[idx] = digit;
    const next = arr.join('').padEnd(6, '').slice(0, 6);
    onChange(next);
    if (digit && idx < 5) boxRefs.current[idx + 1]?.focus();
  }

  function handleKey(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      boxRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) boxRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) boxRefs.current[idx + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    boxRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className={`flex gap-2 sm:gap-3 justify-center ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i}
          ref={el => { boxRefs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          className="h-12 w-10 sm:h-14 sm:w-11 rounded-xl sm:rounded-2xl border-2 text-center text-xl sm:text-2xl font-black text-navy outline-none transition-all"
          style={{
            borderColor: value[i] ? '#5889FA' : '#E6ECFD',
            background: value[i] ? 'rgba(88,137,250,0.06)' : '#fff',
            boxShadow: value[i] ? '0 0 0 4px rgba(88,137,250,0.1)' : 'none',
          }} />
      ))}
    </div>
  );
}

// ── Left Panel Visual ──────────────────────────────────────────────────────
function LeftVisual({ visual }: { visual: string }) {
  if (visual === 'role') return (
    <div className="space-y-3">
      {[
        { name: 'Amara D.', role: 'Data Scientist', tag: 'Python · ML', color: '#5889FA' },
        { name: 'Chisom E.', role: 'Business Analyst', tag: 'Finance · Strategy', color: '#405FAD' },
        { name: 'Kwame A.', role: 'UX Designer', tag: 'Design · Research', color: '#072061' },
      ].map((p, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
          style={{ animationDelay: `${i * 100}ms` }}>
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: p.color }}>
            {p.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">{p.name}</p>
            <p className="text-[11px] text-white/40 truncate">{p.role}</p>
          </div>
          <span className="text-[10px] font-semibold text-azure bg-azure/15 px-2 py-0.5 rounded-md">{p.tag}</span>
        </div>
      ))}
    </div>
  );

  if (visual === 'otp') return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-azure/20 backdrop-blur-sm">
        <svg className="h-10 w-10 text-azure" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white">256-bit encrypted</p>
        <p className="text-xs text-white/40">Your code expires in 10 minutes</p>
      </div>
      <div className="w-full space-y-2">
        {['Email verified', 'Account secured', 'No spam, ever'].map((t, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-3 w-3 text-green-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-xs text-white/60">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (visual === 'teaching') return (
    <div className="flex flex-wrap gap-2">
      {['Python', 'Data Science', 'Business Dev', 'UI/UX Design', 'Marketing', 'Finance', 'Leadership', 'Project Mgmt', 'Cybersecurity', 'AI & ML', 'Public Speaking', 'Entrepreneurship'].map((s, i) => (
        <span key={s} className="rounded-md border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-white/70"
          style={{ opacity: 0.4 + (i % 4) * 0.2 }}>
          {s}
        </span>
      ))}
    </div>
  );

  if (visual === 'about') return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-azure">HOW ADMINS SEE YOU</p>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-azure text-sm font-black text-white">K</div>
        <div>
          <p className="text-sm font-bold text-white">Kwame Mensah</p>
          <p className="text-xs text-white/40">Online · 5 yrs exp</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['Python', 'Data Science', 'ML'].map(s => (
          <span key={s} className="rounded-md bg-azure/20 px-2.5 py-0.5 text-[10px] font-semibold text-azure">{s}</span>
        ))}
      </div>
      <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">
        Experienced data scientist with 5+ years building ML models for African fintech companies. Passionate about teaching practical skills...
      </p>
    </div>
  );

  if (visual === 'review') return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-5xl">🎉</div>
      <div>
        <p className="text-base font-bold text-white">One step away</p>
        <p className="text-xs text-white/40 mt-1">Applications are reviewed within 1–2 business days</p>
      </div>
      <div className="w-full space-y-2 mt-2">
        {['Application received', 'Admin reviews profile', 'Decision by email', 'Start teaching!'].map((t, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-white/60">{i + 1}</div>
            <span className="text-xs text-white/60 text-left">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}

// ── Progress bar ───────────────────────────────────────────────────────────
const STEPS = ['Account', 'Verify', 'Teaching', 'About you', 'Review'];
function getStepIdx(step: WizardStep): number {
  if (step === 1) return 0;
  if (step === 'otp') return 1;
  if (step === 2) return 2;
  if (step === 3) return 3;
  return 4;
}

function ProgressBar({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="mb-8 space-y-2.5">
      {/* Segmented track — no numbers */}
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => {
          const done = stepIdx > i;
          const active = stepIdx === i;
          return (
            <div key={i} className="flex-1 h-[3px] rounded-full transition-all duration-500"
              style={{
                background: done ? '#5889FA' : active ? '#072061' : '#E6ECFD',
                boxShadow: active ? '0 0 8px rgba(88,137,250,0.45)' : 'none',
              }} />
          );
        })}
      </div>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-navy">{STEPS[stepIdx]}</span>
        <span className="text-[10px] font-medium text-royal/40">{stepIdx + 1} / {STEPS.length}</span>
      </div>
    </div>
  );
}

// ── Shared input style ─────────────────────────────────────────────────────
const inputCls = "w-full rounded-2xl border-2 border-cloud bg-white py-3.5 text-sm text-navy outline-none transition-all placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10";

// ── Custom country combobox ─────────────────────────────────────────────────
function CountrySelect({ value, onChange, countries }: {
  value: string;
  onChange: (id: string) => void;
  countries: Country[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = countries.find(c => c.id === value);
  const filtered = countries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.currency.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function toggle() {
    setOpen(v => !v);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function select(id: string) { onChange(id); setOpen(false); setSearch(''); }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setSearch(''); }
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button type="button" onClick={toggle} onKeyDown={onKey}
        className="group w-full flex items-center gap-3 rounded-2xl border-2 bg-white py-3.5 pl-11 pr-4 text-sm outline-none transition-all focus:ring-4 focus:ring-azure/10"
        style={{ borderColor: open ? '#5889FA' : '#E6ECFD', boxShadow: open ? '0 0 0 4px rgba(88,137,250,0.1)' : 'none' }}>
        {/* Globe icon */}
        <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors"
          style={{ color: open ? '#5889FA' : '#405FAD66' }}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
        <span className="flex-1 text-left truncate" style={{ color: selected ? '#072061' : '#405FAD55' }}>
          {selected ? selected.name : 'Select your country…'}
        </span>
        {selected && (
          <span className="flex-shrink-0 rounded-md bg-azure/10 px-2 py-0.5 text-[10px] font-bold text-azure font-mono">
            {selected.currency}
          </span>
        )}
        <svg className="flex-shrink-0 h-4 w-4 text-royal/40 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-2xl border border-cloud bg-white overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(7,32,97,0.14)' }}>
          {/* Search */}
          <div className="p-2 border-b border-cloud">
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-royal/40"
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={onKey} placeholder="Search country…"
                className="w-full rounded-xl border border-cloud bg-cloud/30 py-2 pl-8 pr-3 text-sm text-navy outline-none placeholder:text-royal/40 focus:border-azure focus:bg-white transition-all" />
            </div>
          </div>
          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-4 text-xs text-royal/40 text-center">No countries found</p>
            ) : filtered.map(c => (
              <button key={c.id} type="button" onClick={() => select(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                style={{ background: value === c.id ? 'rgba(88,137,250,0.07)' : undefined }}
                onMouseEnter={e => { if (value !== c.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,137,250,0.04)'; }}
                onMouseLeave={e => { if (value !== c.id) (e.currentTarget as HTMLButtonElement).style.background = ''; }}>
                <span className="flex-1 font-medium text-navy">{c.name}</span>
                <span className="text-[11px] text-royal/50 font-mono">{c.currency}</span>
                {value === c.id && (
                  <svg className="h-3.5 w-3.5 text-azure flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Teacher Wizard ──────────────────────────────────────────────────────────
function TeacherWizard({ countries, onStepChange }: { countries: Country[]; onStepChange?: (step: WizardStep) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [taxSubjects, setTaxSubjects] = useState<TaxSubject[]>([]);
  const [taxProgrammes, setTaxProgrammes] = useState<TaxProgramme[]>([]);
  const [taxLoading, setTaxLoading] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [progSearch, setProgSearch] = useState('');
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const [form, setForm] = useState<TeacherForm>({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
    phone: '', countryId: '',
    subjectAreas: [], teachingSubjectIds: [], teachingProgrammeIds: [], yearsExperience: 0, qualification: '', teachingModality: '',
    bio: '', linkedinUrl: '', websiteUrl: '', documentUrl: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpShake, setOtpShake] = useState(false);
  const [countdown, setCountdown] = useState(600);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState('');
  const tagRef = useRef<HTMLInputElement>(null);

  const strength = pwStrength(form.password);
  const pwMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const pwMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;
  const stepIdx = getStepIdx(step);

  // Countdown for OTP
  useEffect(() => {
    if (step !== 'otp') return;
    setCountdown(600);
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Load taxonomy subjects + programmes when entering step 2
  useEffect(() => {
    if (step !== 2 || taxSubjects.length > 0) return;
    setTaxLoading(true);
    // Programmes carry their subjects, so one request gives both lists
    api.get('/catalogue/programmes')
      .then(r => {
        const allSubjects: TaxSubject[] = [];
        const seen = new Set<string>();
        for (const prog of r.data) {
          for (const s of (prog.subjects ?? [])) {
            if (!seen.has(s.id)) { seen.add(s.id); allSubjects.push(s); }
          }
        }
        setTaxSubjects(allSubjects.sort((a: TaxSubject, b: TaxSubject) => a.name.localeCompare(b.name)));
        setTaxProgrammes(r.data.map((p: any) => ({ id: p.id, name: p.name, shortName: p.shortName, type: p.type })));
      })
      .catch(() => {})
      .finally(() => setTaxLoading(false));
  }, [step]);

  function setField(field: keyof TeacherForm, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function goTo(s: WizardStep, direction: 'forward' | 'back' = 'forward') {
    setDir(direction);
    setError('');
    setStep(s);
    onStepChange?.(s);
  }

  // Subject tag input
  function addTag() {
    const val = tagInput.trim();
    if (val && !form.subjectAreas.includes(val) && form.subjectAreas.length < 8) {
      setField('subjectAreas', [...form.subjectAreas, val]);
    }
    setTagInput('');
  }
  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput && form.subjectAreas.length) {
      setField('subjectAreas', form.subjectAreas.slice(0, -1));
    }
  }
  function toggleSuggested(s: string) {
    if (form.subjectAreas.includes(s)) {
      setField('subjectAreas', form.subjectAreas.filter(x => x !== s));
    } else if (form.subjectAreas.length < 8) {
      setField('subjectAreas', [...form.subjectAreas, s]);
    }
  }

  // Step 1 → send OTP
  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) { triggerError('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirmPassword) { triggerError('Passwords do not match.'); return; }
    setOtpSending(true);
    try {
      await api.post('/auth/otp/send', { email: form.email });
      goTo('otp');
    } catch (err: any) {
      triggerError(err.response?.data?.message ?? 'Could not send verification code.');
    } finally { setOtpSending(false); }
  }

  async function resendOtp() {
    if (countdown > 540) return; // throttle first 60s
    setOtpSending(true);
    try {
      await api.post('/auth/otp/send', { email: form.email });
      setCountdown(600);
    } catch { setError('Failed to resend. Try again.'); }
    finally { setOtpSending(false); }
  }

  // OTP verify → step 2
  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.replace(/\D/g, '').length < 6) { triggerError('Enter all 6 digits.'); return; }
    setOtpVerifying(true);
    try {
      await api.post('/auth/otp/verify', { email: form.email, code: otp });
      goTo(2);
    } catch (err: any) {
      setOtp('');
      setOtpShake(true);
      setTimeout(() => setOtpShake(false), 600);
      triggerError(err.response?.data?.message ?? 'Incorrect code. Try again.');
    } finally { setOtpVerifying(false); }
  }

  // Step 2 → step 3
  function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    if (form.teachingSubjectIds.length === 0 && form.subjectAreas.length === 0) { triggerError('Select at least one subject.'); return; }
    if (!form.teachingModality) { triggerError('Select a teaching modality.'); return; }
    goTo(3);
  }

  // Step 3 → review
  function handleStep3(e: React.FormEvent) {
    e.preventDefault();
    if (form.bio.length < 100) { triggerError('Bio must be at least 100 characters.'); return; }
    if (!form.qualification) { triggerError('Select your highest qualification.'); return; }
    goTo(4);
  }

  // CV upload
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('email', form.email);
      const r = await api.post('/files/application-doc', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded / (p.total ?? 1)) * 100)),
      });
      setField('documentUrl', r.data.url);
    } catch (err: any) { triggerError(err.response?.data?.message ?? 'File upload failed. Please try again.'); }
    finally { setUploading(false); setUploadProgress(0); }
  }

  // Final submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSubmitting(true);
    try {
      await api.post('/auth/register/teacher', {
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, password: form.password,
        phone: form.phone || undefined,
        countryId: form.countryId || undefined,
        subjectAreas: form.subjectAreas.length ? form.subjectAreas : form.teachingSubjectIds.map(id => taxSubjects.find(s => s.id === id)?.name ?? id),
        teachingSubjectIds: form.teachingSubjectIds,
        teachingProgrammeIds: form.teachingProgrammeIds,
        yearsExperience: form.yearsExperience || undefined,
        qualification: form.qualification || undefined,
        teachingModality: form.teachingModality || undefined,
        bio: form.bio,
        documentUrl: form.documentUrl || undefined,
        linkedinUrl: form.linkedinUrl || undefined,
        websiteUrl: form.websiteUrl || undefined,
        agreementAccepted: agreementAccepted,
        agreementVersion: 'v1.0',
      });
      router.push('/apply/success');
    } catch (err: any) {
      triggerError(err.response?.data?.message ?? 'Submission failed. Please try again.');
      goTo(1, 'back');
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      <ProgressBar stepIdx={stepIdx} />

      {/* Error banner */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key={error}
            variants={scaleFade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`mb-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}
          >
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 mt-0.5">
              <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
      {/* ── Step 1: Account ── */}
      {step === 1 && (
        <motion.div key="step1" variants={dir === 'forward' ? slideRight : slideLeft} initial="hidden" animate="visible" exit="exit">
        <form onSubmit={handleStep1} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70">First name</label>
              <input value={form.firstName} onChange={e => setField('firstName', e.target.value)}
                placeholder="Kwame" required className={`${inputCls} px-4`} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70">Last name</label>
              <input value={form.lastName} onChange={e => setField('lastName', e.target.value)}
                placeholder="Mensah" required className={`${inputCls} px-4`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy/70">Email address</label>
            <div className="group relative">
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                placeholder="kwame@example.com" required className={`${inputCls} pl-11 pr-4`} />
            </div>
            <p className="text-[10px] text-royal/40">We'll send a 6-digit verification code to this address</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy/70">Password</label>
            <div className="group relative">
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input type={showPw ? 'text' : 'password'} value={form.password}
                onChange={e => setField('password', e.target.value)}
                placeholder="Min. 8 characters" required className={`${inputCls} pl-11 pr-12`} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-royal/40 hover:text-azure transition-colors">
                {showPw
                  ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
            {form.password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ background: i <= strength.score ? strength.color : '#E6ECFD' }} />
                  ))}
                </div>
                <p className="text-[10px] font-semibold" style={{ color: strength.color }}>{strength.label}</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy/70">Confirm password</label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword}
                onChange={e => setField('confirmPassword', e.target.value)}
                placeholder="Repeat your password" required className={`${inputCls} pl-4 pr-12`}
                style={{ borderColor: pwMismatch ? '#405FAD' : pwMatch ? '#5889FA' : undefined }} />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {pwMatch && <svg className="h-4 w-4 text-azure" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                {pwMismatch && <svg className="h-4 w-4 text-royal/60" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="text-royal/40 hover:text-azure transition-colors">
                  {showConfirm
                    ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
            </div>
            {pwMismatch && <p className="text-[10px] text-royal/70 font-medium">Passwords don't match</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy/70">
              Country <span className="font-normal text-royal/40">· determines payout currency</span>
            </label>
            <CountrySelect value={form.countryId} onChange={id => setField('countryId', id)} countries={countries} />
          </div>

          <button type="submit" disabled={otpSending}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.99] disabled:opacity-70"
            style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
            {otpSending
              ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Sending code…</>
              : <>Continue — Verify email <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
            }
          </button>
        </form>
        </motion.div>
      )}

      {/* ── OTP Verify ── */}
      {step === 'otp' && (
        <motion.div key="step-otp" variants={slideRight} initial="hidden" animate="visible" exit="exit">
        <form onSubmit={handleOtpVerify} className="space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <CountdownRing seconds={countdown} total={600} />
            <div>
              <p className="text-base font-bold text-navy">Check your inbox</p>
              <p className="text-sm text-royal/50 mt-1">
                Code sent to <span className="font-semibold text-navy">{form.email}</span>
              </p>
            </div>
          </div>

          <OtpBoxes value={otp} onChange={setOtp} shake={otpShake} />

          <button type="submit" disabled={otpVerifying || otp.replace(/\D/g,'').length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.99] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
            {otpVerifying
              ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Verifying…</>
              : <>Verify &amp; continue <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
            }
          </button>

          <div className="flex items-center justify-center gap-4 text-xs">
            <button type="button" onClick={() => goTo(1, 'back')} className="text-royal/50 hover:text-navy transition">
              ← Wrong email?
            </button>
            <span className="text-royal/20">|</span>
            <button type="button" onClick={resendOtp} disabled={otpSending || countdown > 540}
              className="font-semibold text-azure hover:text-royal transition disabled:opacity-40">
              {otpSending ? 'Sending…' : countdown > 540 ? `Resend in ${countdown - 540}s` : 'Resend code'}
            </button>
          </div>
        </form>
        </motion.div>
      )}

      {/* ── Step 2: Teaching Profile ── */}
      {step === 2 && (
        <motion.div key="step2" variants={dir === 'forward' ? slideRight : slideLeft} initial="hidden" animate="visible" exit="exit">
        <form onSubmit={handleStep2} className="space-y-5">

          {/* Subject areas — taxonomy */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy/70">
              Subjects you teach <span className="text-azure/60">*</span>
              <span className="font-normal text-royal/40 ml-1">· pick up to 8</span>
            </label>
            <input value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)}
              placeholder="Search subjects…"
              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
            {taxLoading ? (
              <p className="text-xs text-royal/40 py-2">Loading subjects…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {taxSubjects
                  .filter(s => !subjectSearch || s.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                  .map(s => {
                    const sel = form.teachingSubjectIds.includes(s.id);
                    return (
                      <button key={s.id} type="button"
                        onClick={() => {
                          if (sel) setField('teachingSubjectIds', form.teachingSubjectIds.filter(x => x !== s.id));
                          else if (form.teachingSubjectIds.length < 8) setField('teachingSubjectIds', [...form.teachingSubjectIds, s.id]);
                        }}
                        className="rounded-md border px-3 py-1 text-xs font-semibold transition-all"
                        style={{
                          borderColor: sel ? '#5889FA' : '#E6ECFD',
                          background: sel ? 'rgba(88,137,250,0.1)' : '#fff',
                          color: sel ? '#5889FA' : '#405FAD88',
                        }}>
                        {sel && '✓ '}{s.name}
                      </button>
                    );
                  })}
              </div>
            )}
            {form.teachingSubjectIds.length > 0 && (
              <p className="text-[10px] text-azure/70">{form.teachingSubjectIds.length} subject{form.teachingSubjectIds.length > 1 ? 's' : ''} selected</p>
            )}
          </div>

          {/* Programmes taught */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy/70">
              Programmes / exam boards <span className="font-normal text-royal/40">optional</span>
            </label>
            <input value={progSearch} onChange={e => setProgSearch(e.target.value)}
              placeholder="Search programmes…"
              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {taxProgrammes
                .filter(p => !progSearch || p.name.toLowerCase().includes(progSearch.toLowerCase()) || (p.shortName ?? '').toLowerCase().includes(progSearch.toLowerCase()))
                .map(p => {
                  const sel = form.teachingProgrammeIds.includes(p.id);
                  return (
                    <button key={p.id} type="button"
                      onClick={() => {
                        if (sel) setField('teachingProgrammeIds', form.teachingProgrammeIds.filter(x => x !== p.id));
                        else setField('teachingProgrammeIds', [...form.teachingProgrammeIds, p.id]);
                      }}
                      className="rounded-md border px-3 py-1 text-xs font-semibold transition-all"
                      style={{
                        borderColor: sel ? '#072061' : '#E6ECFD',
                        background: sel ? 'rgba(7,32,97,0.07)' : '#fff',
                        color: sel ? '#072061' : '#405FAD88',
                      }}>
                      {sel && '✓ '}{p.shortName ?? p.name}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-cloud" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-royal/30">Teaching style</span>
            <div className="h-px flex-1 bg-cloud" />
          </div>

          {/* Teaching modality */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy/70">
              Teaching modality <span className="text-azure/60">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {MODALITIES.map(m => {
                const selected = form.teachingModality === m.value;
                return (
                  <button key={m.value} type="button" onClick={() => setField('teachingModality', m.value)}
                    className="relative flex flex-row sm:flex-col items-center sm:items-center gap-3 sm:gap-2 rounded-2xl border-2 p-4 text-left sm:text-center transition-all"
                    style={{
                      borderColor: selected ? '#5889FA' : '#E6ECFD',
                      background: selected ? 'rgba(88,137,250,0.05)' : '#fff',
                      boxShadow: selected ? '0 0 0 4px rgba(88,137,250,0.1)' : 'none',
                    }}>
                    {selected && (
                      <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-azure">
                        <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    <span className="text-2xl">{m.emoji}</span>
                    <span className="text-xs font-bold" style={{ color: selected ? '#5889FA' : '#072061' }}>{m.label}</span>
                    <span className="text-[10px] leading-tight" style={{ color: selected ? '#5889FA99' : '#405FAD66' }}>{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-cloud" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-royal/30">Details &amp; links</span>
            <div className="h-px flex-1 bg-cloud" />
          </div>

          {/* Years + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70">Years of experience</label>
              <div className="flex items-center gap-2 rounded-2xl border-2 border-cloud bg-white px-3 py-2.5 focus-within:border-azure focus-within:ring-4 focus-within:ring-azure/10 transition-all">
                <button type="button" onClick={() => setField('yearsExperience', Math.max(0, form.yearsExperience - 1))}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-cloud bg-white text-navy font-bold hover:bg-cloud transition">−</button>
                <span className="flex-1 text-center text-lg font-black text-navy">{form.yearsExperience}</span>
                <button type="button" onClick={() => setField('yearsExperience', Math.min(40, form.yearsExperience + 1))}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-cloud bg-white text-navy font-bold hover:bg-cloud transition">+</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70">Phone <span className="font-normal text-royal/40">optional</span></label>
              <input value={form.phone} onChange={e => setField('phone', e.target.value)}
                placeholder="+234 800 000 0000" className={`${inputCls} px-4`} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70 flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </label>
              <input value={form.linkedinUrl} onChange={e => setField('linkedinUrl', e.target.value)}
                placeholder="linkedin.com/in/…" className={`${inputCls} px-4`} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy/70 flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-royal/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                Website
              </label>
              <input value={form.websiteUrl} onChange={e => setField('websiteUrl', e.target.value)}
                placeholder="yoursite.com" className={`${inputCls} px-4`} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => goTo(1, 'back')}
              className="flex items-center gap-2 rounded-2xl border-2 border-cloud bg-white px-5 py-3.5 text-sm font-semibold text-navy hover:bg-cloud transition">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
              Back
            </button>
            <button type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
              Continue
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
        </form>
        </motion.div>
      )}

      {/* ── Step 3: About You ── */}
      {step === 3 && (
        <motion.div key="step3" variants={dir === 'forward' ? slideRight : slideLeft} initial="hidden" animate="visible" exit="exit">
        <form onSubmit={handleStep3} className="space-y-5">

          {/* Qualification cards */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy/70">
              Highest qualification <span className="text-azure/60">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {QUALIFICATIONS.map(q => {
                const selected = form.qualification === q.value;
                return (
                  <button key={q.value} type="button" onClick={() => setField('qualification', q.value)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3 px-2 text-center transition-all"
                    style={{
                      borderColor: selected ? '#5889FA' : '#E6ECFD',
                      background: selected ? 'rgba(88,137,250,0.05)' : '#fff',
                    }}>
                    <span className="text-xl">{q.icon}</span>
                    <span className="text-[10px] font-semibold leading-tight" style={{ color: selected ? '#5889FA' : '#072061' }}>{q.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bio with live counter */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy/70">
              Bio <span className="text-azure/60">*</span>
              <span className="font-normal text-royal/40 ml-1">· min. 100 characters</span>
            </label>
            <textarea value={form.bio} onChange={e => setField('bio', e.target.value)}
              rows={5} required
              placeholder="Tell students about your background, teaching philosophy, and why you're passionate about education in Africa…"
              className="w-full rounded-2xl border-2 border-cloud bg-white px-4 py-3 text-sm text-navy outline-none transition-all resize-none placeholder:text-royal/35 focus:border-azure focus:ring-4 focus:ring-azure/10" />
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-cloud overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (form.bio.length / 100) * 100)}%`,
                    background: form.bio.length >= 100 ? '#10b981' : form.bio.length >= 50 ? '#405FAD' : '#ef4444',
                  }} />
              </div>
              <span className="text-[10px] font-bold flex-shrink-0"
                style={{ color: form.bio.length >= 100 ? '#10b981' : form.bio.length >= 50 ? '#405FAD' : '#ef4444' }}>
                {form.bio.length >= 100
                  ? `${form.bio.length} chars`
                  : `${form.bio.length}/100 minimum`}
              </span>
            </div>
          </div>

          {/* CV upload */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy/70">
              CV / Resume <span className="font-normal text-royal/40">optional</span>
            </label>
            {form.documentUrl ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-azure/30 bg-azure/5 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-azure/15">
                  <svg className="h-4 w-4 text-azure" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="flex-1 text-xs font-semibold text-azure">CV uploaded successfully</p>
                <button type="button" onClick={() => setField('documentUrl', '')}
                  className="text-royal/40 hover:text-navy transition text-sm">×</button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-all"
                style={{ borderColor: uploading ? '#5889FA' : '#E6ECFD', background: uploading ? 'rgba(88,137,250,0.03)' : '#fff' }}>
                {uploading ? (
                  <>
                    <div className="w-full h-1.5 rounded-full bg-cloud overflow-hidden">
                      <div className="h-full rounded-full bg-azure transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-sm font-semibold text-azure">Uploading… {uploadProgress}%</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cloud">
                      <svg className="h-6 w-6 text-royal/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy">Drag & drop or click to upload</p>
                      <p className="text-xs text-royal/40 mt-0.5">PDF, DOC, DOCX · Max 10MB</p>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="sr-only"
                  onChange={handleFile} disabled={uploading} />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => goTo(2, 'back')}
              className="flex items-center gap-2 rounded-2xl border-2 border-cloud bg-white px-5 py-3.5 text-sm font-semibold text-navy hover:bg-cloud transition">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
              Back
            </button>
            <button type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
              Review application
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
        </form>
        </motion.div>
      )}

      {/* ── Step 4: Review ── */}
      {step === 4 && (
        <motion.div key="step4" variants={dir === 'forward' ? slideRight : slideLeft} initial="hidden" animate="visible" exit="exit">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* TeacherCard preview */}
          <div className="rounded-2xl border-2 border-cloud bg-white overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-4 px-5 py-4 border-b border-cloud">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-azure text-base font-black text-white flex-shrink-0">
                {form.firstName[0]}{form.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy">{form.firstName} {form.lastName}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-royal/50">{form.email}</p>
                  {form.teachingModality && (
                    <span className="text-[10px] font-semibold bg-cloud text-royal/60 px-2 py-0.5 rounded-md">
                      {MODALITIES.find(m => m.value === form.teachingModality)?.label}
                    </span>
                  )}
                </div>
              </div>
              <span className="rounded-md bg-azure/10 px-3 py-1 text-[10px] font-bold text-azure">PENDING</span>
            </div>

            {/* Subject chips */}
            {form.subjectAreas.length > 0 && (
              <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-cloud">
                {form.subjectAreas.map(s => (
                  <span key={s} className="rounded-md bg-azure/10 px-2.5 py-0.5 text-xs font-semibold text-azure">{s}</span>
                ))}
              </div>
            )}

            {/* Bio preview */}
            {form.bio && (
              <div className="px-5 py-3 border-b border-cloud">
                <p className="text-xs text-royal/40 font-semibold uppercase tracking-widest mb-1">Bio</p>
                <p className="text-sm text-navy/80 leading-relaxed line-clamp-3">{form.bio}</p>
              </div>
            )}

            {/* Meta row */}
            <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
              {form.yearsExperience > 0 && (
                <span className="text-xs text-royal/50">{form.yearsExperience}y experience</span>
              )}
              {form.qualification && (
                <span className="text-xs text-royal/50">
                  {QUALIFICATIONS.find(q => q.value === form.qualification)?.label}
                </span>
              )}
              {countries.find(c => c.id === form.countryId)?.name && (
                <span className="text-xs text-royal/50">
                  {countries.find(c => c.id === form.countryId)?.name}
                </span>
              )}
            </div>
          </div>

          {/* Edit buttons */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Edit Account', step: 1 as WizardStep },
              { label: 'Edit Teaching', step: 2 as WizardStep },
              { label: 'Edit About', step: 3 as WizardStep },
            ].map(({ label, step: s }) => (
              <button key={label} type="button" onClick={() => goTo(s, 'back')}
                className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-cloud bg-white py-2.5 text-xs font-semibold text-navy hover:bg-cloud hover:border-azure/30 transition">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.829l-3 1 1-3a4 4 0 01.828-1.414z" /></svg>
                {label}
              </button>
            ))}
          </div>

          {/* Agreement acceptance */}
          <div className="rounded-2xl border-2 border-azure/30 bg-azure/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-azure/20 flex items-center gap-2">
              <svg className="h-4 w-4 text-azure flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs font-bold text-navy">Tutor Offer Letter &amp; Content Ownership Agreement</p>
              <span className="ml-auto text-[10px] font-semibold text-azure bg-azure/10 px-2 py-0.5 rounded-md">Required</span>
            </div>
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-royal/70 leading-relaxed">
                By submitting this application you agree that all course materials, lessons, recordings, quizzes, and
                related content you create for CareerPath Africa become the property of CareerPath Africa. You also
                agree to the compensation, confidentiality, conduct, and termination terms set out in the agreement.
              </p>
              <a href="/legal/tutor-agreement" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-azure hover:underline">
                Read the full agreement
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input type="checkbox" className="peer sr-only" checked={agreementAccepted}
                    onChange={e => setAgreementAccepted(e.target.checked)} required />
                  <div className="h-4 w-4 rounded border-2 border-cloud bg-white transition peer-checked:border-azure peer-checked:bg-azure group-hover:border-azure/60" />
                  <svg className="absolute inset-0 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 transition pointer-events-none" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs text-navy/70 leading-relaxed">
                  I have read and agree to the <strong className="text-navy">Tutor Offer Letter &amp; Content Ownership Agreement</strong>,
                  including the intellectual-property assignment, compensation terms, and confidentiality obligations.
                </span>
              </label>
            </div>
          </div>

          {/* Notice */}
          <div className="flex items-start gap-3 rounded-2xl border-2 border-cloud bg-surface px-4 py-3">
            <svg className="h-4 w-4 text-azure mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-royal/60 leading-relaxed">
              Your application will be reviewed within <strong className="text-navy">1–2 business days</strong>. You&apos;ll receive an email decision.
            </p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => goTo(3, 'back')}
              className="flex items-center gap-2 rounded-2xl border-2 border-cloud bg-white px-5 py-3.5 text-sm font-semibold text-navy hover:bg-cloud transition">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
              Back
            </button>
            <button type="submit" disabled={submitting || !agreementAccepted}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: agreementAccepted ? '0 8px 24px rgba(88,137,250,0.35)' : 'none' }}>
              {submitting
                ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Submitting…</>
                : <>Submit application <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
              }
            </button>
          </div>
        </form>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

// ── Student Form ────────────────────────────────────────────────────────────
function StudentForm({ countries, nextUrl }: { countries: Country[]; nextUrl?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', countryId: '' });

  // Referral code from ?ref=…, kept for the session in case the role picker changes the URL
  const [referralCode, setReferralCode] = useState('');
  useEffect(() => {
    const fromUrl = searchParams?.get('ref')?.trim();
    try {
      if (fromUrl) sessionStorage.setItem('cpa_ref', fromUrl);
      setReferralCode(fromUrl || sessionStorage.getItem('cpa_ref') || '');
    } catch {
      setReferralCode(fromUrl ?? '');
    }
  }, [searchParams]);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const strength = pwStrength(form.password);

  // OTP step
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.countryId) { setError('Please select your country.'); setShake(true); setTimeout(() => setShake(false), 600); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/auth/otp/send', { email: form.email });
      setStep('otp');
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to send verification code.');
      setShake(true); setTimeout(() => setShake(false), 600);
    } finally { setLoading(false); }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setError(''); setOtpLoading(true);
    try {
      await api.post('/auth/otp/verify', { email: form.email, code: otp.trim() });
      const { data } = await api.post('/auth/register/student', { ...form, ...(referralCode && { referralCode }) });
      try { sessionStorage.removeItem('cpa_ref'); } catch { /* storage unavailable */ }
      if (data.accessToken) {
        await setAuthToken(data.accessToken, true);
        const decoded = jwtDecode<{ role: string }>(data.accessToken);
        const destination = decoded.role === 'STUDENT'
          ? '/student/onboarding'
          : (ROLE_HOME[decoded.role] ?? '/student/dashboard');
        router.push(destination);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Registration failed. Please try again.');
      setShake(true); setTimeout(() => setShake(false), 600);
    } finally { setOtpLoading(false); }
  }

  async function resendOtp() {
    if (resendCooldown > 0) return;
    setError('');
    try {
      await api.post('/auth/otp/send', { email: form.email });
      setResendCooldown(60);
    } catch { /* silent */ }
  }

  if (step === 'otp') return (
    <form onSubmit={handleOtpSubmit} className="space-y-5">
      <AnimatePresence mode="wait">
        {error && (
          <motion.div key={error} variants={scaleFade} initial="hidden" animate="visible" exit="exit"
            className={`flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 mt-0.5">
              <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azure/10 mx-auto mb-3">
          <svg className="h-6 w-6 text-azure" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>
        <h3 className="text-base font-bold text-navy">Verify your email</h3>
        <p className="text-sm text-royal/60 mt-1">We sent a 6-digit code to <strong className="text-navy">{form.email}</strong></p>
      </div>
      <OtpBoxes value={otp} onChange={setOtp} shake={shake} />
      <button type="submit" disabled={otpLoading || otp.replace(/\D/g, '').length < 6}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.99] disabled:opacity-70"
        style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
        {otpLoading
          ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Creating account…</>
          : 'Verify & create account'}
      </button>
      <div className="text-center">
        <button type="button" onClick={() => setStep('form')} className="text-xs text-royal/50 hover:text-navy underline mr-4">Change email</button>
        <button type="button" onClick={resendOtp} disabled={resendCooldown > 0} className="text-xs text-azure hover:text-royal disabled:text-royal/40">
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AnimatePresence mode="wait">
        {error && (
          <motion.div key={error} variants={scaleFade} initial="hidden" animate="visible" exit="exit"
            className={`flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500 mt-0.5">
              <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-navy/70">First name</label>
          <input value={form.firstName} onChange={set('firstName')} placeholder="Amara" required className={`${inputCls} px-4`} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-navy/70">Last name</label>
          <input value={form.lastName} onChange={set('lastName')} placeholder="Diallo" required className={`${inputCls} px-4`} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-navy/70">Email address</label>
        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required className={`${inputCls} pl-11 pr-4`} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-navy/70">Password</label>
        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required className={`${inputCls} pl-11 pr-12`} />
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-royal/40 hover:text-azure transition-colors">
            {showPw
              ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            }
          </button>
        </div>
        {form.password.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: i <= strength.score ? strength.color : '#E6ECFD' }} />
              ))}
            </div>
            <span className="text-[10px] font-bold" style={{ color: strength.color }}>{strength.label}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-navy/70">Phone number <span className="text-royal/40 font-normal">(optional)</span></label>
        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-royal/40 group-focus-within:text-azure transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </div>
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+234 800 000 0000" className={`${inputCls} pl-11 pr-4`} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-navy/70">Country</label>
        <CountrySelect value={form.countryId} onChange={id => setForm(f => ({ ...f, countryId: id }))} countries={countries} />
      </div>

      <button type="submit" disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.99] disabled:opacity-70"
        style={{ background: 'linear-gradient(135deg, #5889FA 0%, #405FAD 100%)', boxShadow: '0 8px 24px rgba(88,137,250,0.35)' }}>
        {loading
          ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Creating account…</>
          : <>Create my account <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
        }
      </button>
    </form>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
function RegisterPageInner() {
  const searchParams = useSearchParams();
  const nextUrl = searchParams?.get('next') ?? null;
  const [role, setRole] = useState<Role | null>(() => {
    // Allow /apply?role=teacher (or /register?role=teacher) to pre-select teacher
    const param = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
    return param === 'teacher' ? 'teacher' : param === 'student' ? 'student' : null;
  });
  const [countries, setCountries] = useState<Country[]>([]);
  const [teacherStep, setTeacherStep] = useState<WizardStep>(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Also handle search param after hydration
    const param = searchParams?.get('role');
    if (param === 'teacher' || param === 'student') setRole(param);
    api.get('/countries').then(r => setCountries(r.data)).catch(() => {});
  }, []);

  useEffect(() => { setTeacherStep(1); }, [role]);

  // Determine left panel content key
  const leftKey = role === null ? 'role' : role === 'student' ? '1' : String(teacherStep);
  const left = LEFT_CONTENT[leftKey] ?? LEFT_CONTENT['role'];

  return (
    <div className="flex min-h-screen overflow-hidden">

      {/* ═══════════════════ LEFT PANEL ═══════════════════ */}
      <div className="hidden lg:flex lg:w-[48%] relative flex-col overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #020a1f 0%, #061a4d 40%, #0a2570 100%)' }}>

        {/* Drifting gradient blobs */}
        <div className="pointer-events-none absolute top-[10%] right-[5%] h-[420px] w-[420px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: 'radial-gradient(circle, #5889FA, transparent 65%)', animation: 'blob-drift-1 20s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute bottom-[5%] left-[0%] h-[380px] w-[380px] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: 'radial-gradient(circle, #405FAD, transparent 65%)', animation: 'blob-drift-2 25s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute top-[40%] left-[30%] h-[300px] w-[300px] rounded-full opacity-[0.08] blur-3xl"
          style={{ background: 'radial-gradient(circle, #3730a3, transparent 65%)', animation: 'blob-drift-3 30s ease-in-out infinite' }} />

        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-azure shadow-lg shadow-azure/40">
              <span className="text-base font-black text-white tracking-tight">C</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              CareerPath<span className="text-azure">Africa</span>
            </span>
          </Link>

          {/* Dynamic content — animated on step change */}
          <AnimatePresence mode="wait">
            <motion.div
              key={leftKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              className="space-y-6"
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-md border border-azure/30 bg-azure/10 px-4 py-1.5 mb-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-azure" />
                  <span className="text-[11px] font-semibold text-azure tracking-wider">{left.eyebrow.toUpperCase()}</span>
                </div>
                <h1 className="text-5xl font-black text-white leading-[1.08] tracking-tight whitespace-pre-line">
                  {left.headline}
                </h1>
                <p className="mt-4 text-base text-white/40 leading-relaxed max-w-sm">{left.sub}</p>
              </div>
              <div>
                <LeftVisual visual={left.visual} />
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Bottom trusted by */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {['#5889FA', '#405FAD', '#072061', '#8EB0FC'].map((c, i) => (
                <div key={i} className="h-7 w-7 rounded-full border-2 border-navy flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: c }}>
                  {['A', 'K', 'C', 'M'][i]}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40">Joined by <span className="text-white font-semibold">12,400+</span> professionals</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════ RIGHT PANEL ═══════════════════ */}
      <div className={`flex flex-1 flex-col lg:rounded-l-[2.5rem] lg:shadow-[-20px_0_50px_rgba(3,14,48,0.3)] lg:bg-white ${role === 'teacher' ? 'bg-[#0a2570]' : 'bg-white'}`}>

        {/* Mobile top bar — branded sheet header for teacher, standard for others */}
        {role === 'teacher' ? (
          <div className="lg:hidden" style={{ background: 'linear-gradient(145deg, #020a1f 0%, #061a4d 40%, #0a2570 100%)' }}>
            <div className="px-6 pt-8 pb-14">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  {teacherStep === 1 ? (
                    <button type="button" onClick={() => setRole(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition">
                      <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                      </svg>
                    </button>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                      <span className="text-[10px] font-black text-white">C</span>
                    </div>
                  )}
                  <span className="text-sm font-bold text-white">CareerPath<span className="text-azure">Africa</span></span>
                </div>
                <Link href="/login" className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 transition">
                  Sign in
                </Link>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-1">{left.eyebrow}</p>
              <h2 className="text-xl font-black text-white tracking-tight">{left.headline.replace(/\n/g, ' ')}</h2>
              <p className="text-xs text-white/40 mt-1.5 max-w-[280px] leading-relaxed">{left.sub}</p>
              <div className="flex items-center gap-1.5 mt-4">
                {[0, 1, 2, 3, 4].map(i => {
                  const idx = getStepIdx(teacherStep);
                  return (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-6 bg-azure' : i < idx ? 'w-1.5 bg-azure/60' : 'w-1.5 bg-white/20'}`} />
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-6 pt-8 pb-4 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy">
                <span className="text-xs font-black text-white">C</span>
              </div>
              <span className="text-sm font-bold text-navy">CareerPath<span className="text-azure">Africa</span></span>
            </div>
            <Link href="/login" className="rounded-xl border border-cloud px-4 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
              Sign in
            </Link>
          </div>
        )}

        <div className={`flex flex-1 items-start justify-center px-6 overflow-y-auto transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${role === 'teacher' ? '-mt-6 rounded-t-3xl bg-white shadow-[0_-4px_20px_rgba(3,14,48,0.12)] pt-2 pb-10 lg:mt-0 lg:rounded-none lg:shadow-none lg:py-10' : 'py-10'}`}>
          <div className="w-full max-w-[460px]">
            {role === 'teacher' && <div className="flex justify-center pt-1 pb-4 lg:hidden"><div className="w-10 h-1 rounded-full bg-navy/10" /></div>}

            {/* ── Role picker (initial screen) ── */}
            {role === null && (
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-azure mb-2">Get started</p>
                  <h2 className="text-3xl font-black text-navy tracking-tight mb-2">Create your account</h2>
                  <p className="text-sm text-royal/50">
                    Already have an account?{' '}
                    <Link href="/login" className="font-semibold text-azure hover:text-royal transition">Sign in</Link>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { r: 'student' as Role, emoji: '🎓', label: 'Student', sub: 'Learn new skills & get certified', color: '#5889FA' },
                    { r: 'teacher' as Role, emoji: '👨‍🏫', label: 'Teacher', sub: 'Share expertise & earn income', color: '#405FAD' },
                  ].map(({ r, emoji, label, sub, color }) => (
                    <button key={r} type="button" onClick={() => setRole(r)}
                      className="group flex flex-col items-start gap-3 rounded-3xl border-2 border-cloud bg-white p-6 text-left transition-all hover:border-azure/50 hover:shadow-lg hover:-translate-y-0.5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-transform group-hover:scale-110"
                        style={{ background: `${color}18` }}>
                        {emoji}
                      </div>
                      <div>
                        <p className="text-base font-black text-navy">{label}</p>
                        <p className="text-xs text-royal/50 leading-relaxed mt-0.5">{sub}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-semibold mt-auto" style={{ color }}>
                        Get started
                        <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </div>
                    </button>
                  ))}
                </div>

                <p className="text-center text-xs text-royal/40">
                  By continuing you agree to our{' '}
                  <a href="#" className="underline hover:text-royal">Terms</a> and{' '}
                  <a href="#" className="underline hover:text-royal">Privacy Policy</a>
                </p>
              </div>
            )}

            {/* ── Student form ── */}
            {role === 'student' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <button onClick={() => setRole(null)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-cloud hover:bg-cloud transition">
                    <svg className="h-4 w-4 text-royal/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
                  </button>
                  <div>
                    <h2 className="text-2xl font-black text-navy tracking-tight">Student account</h2>
                    <p className="text-xs text-royal/50">Get access to all courses and live sessions</p>
                  </div>
                </div>
                <StudentForm countries={countries} nextUrl={nextUrl} />
              </div>
            )}

            {/* ── Teacher wizard ── */}
            {role === 'teacher' && (
              <div className="space-y-4">
                {teacherStep === 1 && (
                  <div className="hidden lg:flex items-center gap-3 mb-6">
                    <button onClick={() => setRole(null)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-cloud hover:bg-cloud transition">
                      <svg className="h-4 w-4 text-royal/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
                    </button>
                    <div>
                      <h2 className="text-2xl font-black text-navy tracking-tight">Teacher application</h2>
                      <p className="text-xs text-royal/50">4 quick steps to apply</p>
                    </div>
                  </div>
                )}
                <TeacherWizard countries={countries} onStepChange={setTeacherStep} />
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%  { transform: translateX(-6px); }
          30%  { transform: translateX(6px); }
          45%  { transform: translateX(-4px); }
          60%  { transform: translateX(4px); }
          75%  { transform: translateX(-2px); }
          90%  { transform: translateX(2px); }
        }
        .animate-\\[shake_0\\.5s_ease\\] { animation: shake 0.5s ease; }
      `}</style>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}
