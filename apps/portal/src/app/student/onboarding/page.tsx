'use client';
import { useEffect, useMemo, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Select } from '@/components/ui/Select';
import api, { setAuthToken } from '@/lib/api';
import { money } from '@/lib/money';

type ProgrammeType = 'NATIONAL_CURRICULUM' | 'INTERNATIONAL_EXAM' | 'PROFESSIONAL_LICENSURE' | 'LANGUAGE_PROFICIENCY' | 'CPD' | 'UNIVERSITY';
type Step = 0 | 1 | 2 | 3;
interface Country { id: string; name: string; }
interface Level { id: string; name: string; tier: string; sortOrder?: number }
interface Programme {
  id: string; name: string; shortName: string | null; type: ProgrammeType;
  levels: Level[]; countries: { id: string }[];
  _count?: { subjects?: number; platformCourses?: number };
}
interface Course {
  id: string; title: string; source: string; isSoldIndividually: boolean; priceAmount: number | null; priceCurrency: string | null;
  levelId: string | null; programme: { id: string; shortName: string | null; name: string } | null;
  teacher: { firstName: string | null; lastName: string | null } | null;
}

const TYPES: { type: ProgrammeType | 'ALL'; label: string; tag: string }[] = [
  { type: 'ALL', label: 'All', tag: '' },
  { type: 'NATIONAL_CURRICULUM', label: 'School exams', tag: 'School' },
  { type: 'INTERNATIONAL_EXAM', label: 'International', tag: 'International' },
  { type: 'PROFESSIONAL_LICENSURE', label: 'Professional', tag: 'Professional' },
  { type: 'LANGUAGE_PROFICIENCY', label: 'Language', tag: 'Language' },
  { type: 'CPD', label: 'CPD', tag: 'CPD' },
  { type: 'UNIVERSITY', label: 'University', tag: 'University' },
];
const tagOf = (t: ProgrammeType) => TYPES.find(x => x.type === t)?.tag ?? '';
const groupTitle = (t: ProgrammeType) => ({
  NATIONAL_CURRICULUM: 'School exams', INTERNATIONAL_EXAM: 'International exams', PROFESSIONAL_LICENSURE: 'Professional',
  LANGUAGE_PROFICIENCY: 'Language', CPD: 'CPD', UNIVERSITY: 'University',
} as Record<ProgrammeType, string>)[t];

const short = (p: { shortName: string | null; name: string }) => p.shortName ?? p.name;
const isWebsite = (c: Course) => c.source === 'WORDPRESS' && !c.isSoldIndividually;
const priceLabel = (c: Course) =>
  (c.isSoldIndividually && !c.priceAmount) || isWebsite(c) ? 'Free'
    : c.isSoldIndividually && c.priceAmount && c.priceCurrency ? money(c.priceAmount, c.priceCurrency)
    : 'In a package';

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 text-[9px] text-white transition ${on ? 'border-azure bg-azure' : 'border-cloud'}`}>
      {on && '✓'}
    </span>
  );
}

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = params.get('next');
  const nextUrl = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [error, setError] = useState('');

  // Step 0: only for accounts without a country (e.g. imported from WordPress)
  const [needsAbout, setNeedsAbout] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [about, setAbout] = useState({ firstName: '', lastName: '', phone: '', countryId: '' });

  // Step 1: programmes · step 2: level
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ProgrammeType | 'ALL'>('ALL');
  const [levelId, setLevelId] = useState('');

  // Step 3: courses to start with
  const [suggested, setSuggested] = useState<Course[] | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  useEffect(() => {
    api.get('/auth/me').catch(() => ({ data: null })).then(async mr => {
      const me = mr.data;
      if (me?.firstName) setFirstName(me.firstName);
      if (me?.countryId) setCountryId(me.countryId);
      if (Array.isArray(me?.programmeInterestIds)) setSelected(me.programmeInterestIds);
      if (me?.levelId) setLevelId(me.levelId);
      if (me && !me.countryId) {
        setNeedsAbout(true); setStep(0);
        setAbout({ firstName: me.firstName ?? '', lastName: me.lastName ?? '', phone: me.phone ?? '', countryId: '' });
        api.get('/countries').then(r => setCountries(r.data ?? [])).catch(() => {});
      }
      await loadProgrammes(me?.countryId ?? '');
    }).finally(() => setLoading(false));
  }, []);

  // Same set the catalogue offers: global programmes plus the ones for the student's country
  async function loadProgrammes(cid: string) {
    const url = cid ? `/catalogue/programmes?countryId=${encodeURIComponent(cid)}` : '/catalogue/programmes';
    const r = await api.get(url).catch(() => ({ data: [] }));
    setProgrammes(r.data ?? []);
  }

  const countryName = (countries.find(c => c.id === countryId)?.name) ?? '';
  const [meCountry, setMeCountry] = useState('');
  useEffect(() => {
    if (!countryId || countryName) { setMeCountry(countryName); return; }
    api.get('/countries').then(r => setMeCountry((r.data ?? []).find((c: Country) => c.id === countryId)?.name ?? '')).catch(() => {});
  }, [countryId, countryName]);

  const courseCount = (p: Programme) => p._count?.platformCourses ?? 0;
  const byCourses = (a: Programme, b: Programme) => (courseCount(b) > 0 ? 1 : 0) - (courseCount(a) > 0 ? 1 : 0) || short(a).localeCompare(short(b));

  // Search + tab filter, then "Popular in <country>" first and the rest by type
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = programmes.filter(p =>
      (tab === 'ALL' || p.type === tab) &&
      (!q || p.name.toLowerCase().includes(q) || (p.shortName ?? '').toLowerCase().includes(q)));
    const local = countryId ? match.filter(p => p.countries?.some(c => c.id === countryId)) : [];
    const rest = match.filter(p => !local.includes(p));
    const out: { title: string; items: Programme[] }[] = [];
    if (local.length) out.push({ title: meCountry ? `Popular in ${meCountry}` : 'For your country', items: [...local].sort(byCourses) });
    for (const t of TYPES.slice(1)) {
      const items = rest.filter(p => p.type === t.type).sort(byCourses);
      if (items.length) out.push({ title: groupTitle(t.type as ProgrammeType), items });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmes, search, tab, countryId, meCountry]);

  const chosen = programmes.filter(p => selected.includes(p.id));
  const withLevels = chosen.filter(p => p.levels?.length);
  const withoutLevels = chosen.filter(p => !p.levels?.length);
  const levelName = programmes.flatMap(p => p.levels ?? []).find(l => l.id === levelId)?.name;

  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  function apiError(err: any) {
    const m = err?.response?.data?.message;
    return Array.isArray(m) ? m.join(' · ') : m ?? 'Could not save your details. Please try again.';
  }

  const aboutFields = () => needsAbout ? {
    firstName: about.firstName.trim() || undefined, lastName: about.lastName.trim() || undefined,
    phone: about.phone.trim() || undefined, countryId: about.countryId,
  } : {};

  async function advanceFromAbout() {
    if (!about.countryId) { setError('Please pick your country.'); return; }
    setError('');
    if (about.firstName.trim()) setFirstName(about.firstName.trim());
    setCountryId(about.countryId);
    setLoading(true);
    await loadProgrammes(about.countryId);
    setLoading(false);
    setStep(1);
  }

  async function skip() {
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/auth/onboarding', { programmeIds: [], ...aboutFields() });
      if (data?.accessToken) await setAuthToken(data.accessToken, true);
      router.push(nextUrl ?? '/student/catalogue');
    } catch (err) { setError(apiError(err)); setSaving(false); }
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const keepLevel = withLevels.some(p => p.levels.some(l => l.id === levelId)) ? levelId : undefined;
      const { data } = await api.post('/auth/onboarding', { programmeIds: selected, levelId: keepLevel, ...aboutFields() });
      if (data?.accessToken) await setAuthToken(data.accessToken, true);
      setStep(3);
      loadSuggestions(keepLevel);
    } catch (err) { setError(apiError(err)); }
    finally { setSaving(false); }
  }

  // One course per chosen programme (their level first, free first), up to three
  async function loadSuggestions(level?: string) {
    const lists = await Promise.all(chosen.slice(0, 6).map(p =>
      api.get(`/platform-courses?programmeId=${encodeURIComponent(p.id)}`).then(r => (r.data ?? []) as Course[]).catch(() => [] as Course[])));
    const rank = (c: Course) => (level && c.levelId === level ? 0 : 2) + (priceLabel(c) === 'Free' ? 0 : 1);
    const sorted = lists.map(l => [...l].sort((a, b) => rank(a) - rank(b)));
    const picks: Course[] = [];
    for (let round = 0; picks.length < 3 && sorted.some(l => l.length > round); round++) {
      for (const l of sorted) if (l[round] && picks.length < 3 && !picks.some(x => x.id === l[round].id)) picks.push(l[round]);
    }
    setSuggested(picks);
    api.get('/live/student/overview').then(r => setLiveCount((r.data?.live?.length ?? 0) + (r.data?.upcoming?.length ?? 0))).catch(() => setLiveCount(null));
  }

  function next() {
    if (!selected.length) return;
    if (withLevels.length) setStep(2);
    else save();
  }

  const dots: Step[] = needsAbout ? [0, 1, 2] : [1, 2];
  const title = step === 0 ? (firstName ? `Welcome, ${firstName}! Let’s finish your account` : 'Let’s finish your account')
    : step === 1 ? (firstName ? `Hi ${firstName}! What are you preparing for?` : 'What are you preparing for?')
    : step === 2 ? 'Which year are you in?'
    : firstName ? `You’re all set, ${firstName}!` : 'You’re all set!';
  const sub = step === 0 ? 'A few details we need before you start learning'
    : step === 1 ? 'Pick every exam or programme. Your catalogue starts with these.'
    : step === 2 ? (withLevels.length === 1 ? `For ${short(withLevels[0])}` : 'So we show the right courses first')
    : 'Your dashboard and catalogue now lead with these.';
  const btn = 'rounded-md px-4 py-2.5 text-[13px] font-bold transition disabled:opacity-50';

  // Set like the sign-in pages' blue panel: navy headline with its last word in white, no icon above
  const words = title.split(' ');
  const lastWord = words.pop() ?? '';

  return (
    <div className="keep-light flex min-h-screen flex-col items-center bg-[#3F6FE8] px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-7 text-center">
          <h1 className="mx-auto max-w-[760px] text-[clamp(30px,4.2vw,48px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-navy [text-wrap:balance]">
            {words.join(' ')} <span className="text-[#FFFFFF]">{lastWord}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[17px] leading-relaxed text-navy/80">{sub}</p>
          {step !== 3 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              {dots.map(n => <span key={n} className={`h-2 rounded-full transition-all duration-300 ${step === n ? 'w-8 bg-[#FFFFFF]' : step > n ? 'w-2 bg-navy' : 'w-2 bg-[#FFFFFF]/40'}`} />)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-[10px] bg-white p-5 shadow-2xl sm:p-6">
          {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-600">{error}</p>}

          {step === 0 && (
            <>
              <p className="rounded-lg bg-azure/[0.07] px-3.5 py-2.5 text-[12.5px] text-royal">Your account came from our website, so we need your country once. It sets your currency and your local team.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-xs font-semibold text-navy">First name</span>
                  <input value={about.firstName} onChange={e => setAbout(a => ({ ...a, firstName: e.target.value }))} className="w-full rounded-lg border border-cloud px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure" /></label>
                <label className="space-y-1.5"><span className="text-xs font-semibold text-navy">Last name</span>
                  <input value={about.lastName} onChange={e => setAbout(a => ({ ...a, lastName: e.target.value }))} className="w-full rounded-lg border border-cloud px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure" /></label>
                <div className="space-y-1.5"><span className="text-xs font-semibold text-navy">Country</span>
                  <Select value={about.countryId} onValueChange={v => setAbout(a => ({ ...a, countryId: v }))} placeholder="Select your country" options={countries.map(c => ({ value: c.id, label: c.name }))} /></div>
                <label className="space-y-1.5"><span className="text-xs font-semibold text-navy">Phone <span className="font-normal text-royal/40">(optional)</span></span>
                  <input type="tel" placeholder="+237 6 77 12 34 56" value={about.phone} onChange={e => setAbout(a => ({ ...a, phone: e.target.value }))} className="w-full rounded-lg border border-cloud px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" /></label>
              </div>
              <div className="flex justify-end border-t border-cloud pt-3">
                <button onClick={advanceFromAbout} className={`${btn} bg-azure text-white hover:bg-royal`}>Continue →</button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex flex-col gap-2.5">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams and programmes: GCE, BAC, IELTS, ACCA…"
                  className="h-10 w-full rounded-lg border border-cloud px-3.5 text-[13.5px] text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                <div role="tablist" className="flex flex-wrap gap-1 self-start rounded-lg border border-cloud p-[3px] text-[13px]">
                  {TYPES.map(t => (
                    <button key={t.type} role="tab" aria-selected={tab === t.type} onClick={() => setTab(t.type)}
                      className={`rounded-md px-2.5 py-1.5 transition ${tab === t.type ? 'bg-azure/10 font-semibold text-navy' : 'text-royal/70 hover:text-navy'}`}>{t.label}</button>
                  ))}
                </div>
              </div>

              {loading ? <p className="py-12 text-center text-sm text-royal/40">Loading programmes…</p>
                : groups.length === 0 ? <p className="py-12 text-center text-sm text-royal/40">Nothing matches “{search}”.</p>
                : (
                  <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
                    {groups.map(g => (
                      <div key={g.title}>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-royal/45">{g.title}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {g.items.map(p => {
                            const on = selected.includes(p.id);
                            const n = courseCount(p);
                            return (
                              <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                                className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition ${on ? 'border-azure bg-azure/5' : 'border-cloud hover:border-azure/40'}`}>
                                <Tick on={on} />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <strong className="text-[12.5px] leading-tight text-navy">{short(p)}</strong>
                                  {p.shortName && <span className="truncate text-[10.5px] text-royal/55">{p.name}</span>}
                                  <span className="mt-1 flex items-center gap-1.5">
                                    <span className="rounded bg-azure/10 px-1.5 py-px text-[9px] font-bold uppercase text-royal">{tagOf(p.type)}</span>
                                    <span className="text-[10.5px] text-royal/55">{n ? `${n} course${n === 1 ? '' : 's'}` : 'No courses yet'}</span>
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              <div className="flex flex-wrap items-center gap-2 border-t border-cloud pt-3">
                <p className="min-w-0 flex-1 truncate text-xs text-royal/60">
                  {selected.length ? `${selected.length} selected: ${chosen.map(short).join(', ')}` : 'Pick at least one'}
                </p>
                {needsAbout && <button onClick={() => { setError(''); setStep(0); }} className={`${btn} border border-cloud text-navy hover:bg-cloud/50`}>← Back</button>}
                <button onClick={skip} disabled={saving} className={`${btn} border border-cloud text-navy hover:bg-cloud/50`}>Skip for now</button>
                <button onClick={next} disabled={!selected.length || saving} className={`${btn} bg-azure text-white hover:bg-royal`}>
                  {withLevels.length ? 'Next →' : saving ? 'Saving…' : 'Finish ✓'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-4">
                {withLevels.map(p => (
                  <div key={p.id} className="space-y-2">
                    {withLevels.length > 1 && <p className="text-[13px] font-bold text-navy">{short(p)}</p>}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {[...p.levels].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(l => {
                        const on = levelId === l.id;
                        return (
                          <button key={l.id} type="button" onClick={() => setLevelId(on ? '' : l.id)} aria-pressed={on}
                            className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition ${on ? 'border-azure bg-azure/5' : 'border-cloud hover:border-azure/40'}`}>
                            <Tick on={on} /><span><strong className="text-[12.5px] text-navy">{l.name}</strong><br /><span className="text-[10.5px] text-royal/45">{l.tier.replace(/_/g, ' ').toLowerCase()}</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setLevelId('')} aria-pressed={!levelId}
                  className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition sm:w-1/2 lg:w-1/3 ${!levelId ? 'border-azure bg-azure/5' : 'border-cloud hover:border-azure/40'}`}>
                  <Tick on={!levelId} /><span><strong className="text-[12.5px] text-navy">I’m preparing on my own</strong><br /><span className="text-[10.5px] text-royal/45">Not in school right now</span></span>
                </button>
              </div>
              {withoutLevels.length > 0 && (
                <p className="text-xs text-royal/55">{withoutLevels.map(short).join(' and ')} {withoutLevels.length === 1 ? 'has' : 'have'} no levels, so there’s nothing to pick for {withoutLevels.length === 1 ? 'it' : 'them'}.</p>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-cloud pt-3">
                <button onClick={() => setStep(1)} className={`${btn} border border-cloud text-navy hover:bg-cloud/50`}>← Back</button>
                <button onClick={save} disabled={saving} className={`${btn} bg-azure text-white hover:bg-royal`}>{saving ? 'Saving…' : 'Finish setup ✓'}</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {chosen.map(p => (
                  <span key={p.id} className="rounded-md bg-azure/10 px-3 py-1 text-xs font-bold text-royal">
                    {short(p)}{levelName && p.levels?.some(l => l.id === levelId) ? ` · ${levelName}` : ''}
                  </span>
                ))}
              </div>

              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-royal/45">Start with these</p>
              {suggested === null ? <p className="py-6 text-center text-sm text-royal/40">Finding courses…</p>
                : suggested.length === 0 ? <p className="rounded-lg border-2 border-dashed border-cloud px-4 py-5 text-center text-[13px] text-royal/60">No courses for these yet. Teachers are adding more every week; the catalogue has everything that’s ready now.</p>
                : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {suggested.map(c => (
                      <Link key={c.id} href={`/student/catalogue?course=${c.id}`} className="flex flex-col gap-1.5 rounded-lg border-2 border-cloud p-3 transition hover:border-azure/50">
                        <span className="h-20 rounded-md" style={{ background: 'linear-gradient(135deg, #E6ECFD, #C9D6FF)' }} />
                        <strong className="line-clamp-2 text-[13px] text-navy">{c.title}</strong>
                        <span className="text-[11px] text-royal/55">{[c.programme && short(c.programme), c.teacher && [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</span>
                        <span className={`text-xs font-extrabold ${priceLabel(c) === 'Free' ? 'text-royal' : 'text-navy'}`}>{priceLabel(c)}</span>
                      </Link>
                    ))}
                  </div>
                )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  { icon: '🔴', t: 'Live classes', d: liveCount ? `${liveCount} coming up for you` : 'See what’s on', href: '/student/live' },
                  { icon: '🧭', t: 'Book a mentor', d: '1-to-1 sessions', href: '/student/mentorship' },
                  { icon: '🎁', t: 'Invite a friend', d: 'Share your referral link', href: '/student/referrals' },
                ].map(n => (
                  <Link key={n.t} href={n.href} className="flex items-start gap-2.5 rounded-lg border-2 border-cloud p-3 transition hover:border-azure/50">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-azure/10">{n.icon}</span>
                    <span><strong className="text-[13px] text-navy">{n.t}</strong><br /><span className="text-[11px] text-royal/55">{n.d}</span></span>
                  </Link>
                ))}
              </div>

              <div className="flex justify-end border-t border-cloud pt-3">
                <button onClick={() => router.push(nextUrl ?? '/student/catalogue')} className={`${btn} bg-azure text-white hover:bg-royal`}>
                  {nextUrl ? 'Continue →' : 'Explore your catalogue →'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-white/30">You can change these any time in Preferences. They decide what your catalogue shows first.</p>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>;
}
