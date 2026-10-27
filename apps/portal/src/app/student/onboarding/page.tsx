'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import api, { setAuthToken } from '@/lib/api';

type ProgrammeType = 'NATIONAL_CURRICULUM' | 'INTERNATIONAL_EXAM' | 'PROFESSIONAL_LICENSURE' | 'LANGUAGE_PROFICIENCY' | 'CPD' | 'UNIVERSITY';
type Step = 0 | 1 | 2 | 3;
interface Country { id: string; name: string; }

interface Programme {
  id: string; name: string; shortName: string | null; type: ProgrammeType;
  levels: { id: string; name: string; tier: string }[];
}

const TYPE_LABELS: Record<ProgrammeType, string> = {
  NATIONAL_CURRICULUM:    'National Curriculum',
  INTERNATIONAL_EXAM:     'International Exam',
  PROFESSIONAL_LICENSURE: 'Professional',
  LANGUAGE_PROFICIENCY:   'Language',
  CPD:                    'CPD',
  UNIVERSITY:             'University',
};

const TYPE_COLORS: Record<ProgrammeType, string> = {
  NATIONAL_CURRICULUM:    'bg-navy/10 text-navy',
  INTERNATIONAL_EXAM:     'bg-azure/10 text-azure',
  PROFESSIONAL_LICENSURE: 'bg-royal/10 text-royal',
  LANGUAGE_PROFICIENCY:   'bg-emerald-50 text-emerald-700',
  CPD:                    'bg-amber-50 text-amber-700',
  UNIVERSITY:             'bg-violet-50 text-violet-700',
};

const TIER_ORDER = ['PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY', 'POST_SECONDARY', 'TERTIARY', 'PROFESSIONAL', 'ALL'];

export default function OnboardingPage() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [step,       setStep]       = useState<Step>(1);
  const [firstName,  setFirstName]  = useState('');
  const [error,      setError]      = useState('');

  // Step 0 — "About you", only for accounts without a country (e.g. imported from WordPress)
  const [needsAbout, setNeedsAbout] = useState(false);
  const [countries,  setCountries]  = useState<Country[]>([]);
  const [about, setAbout] = useState({ firstName: '', lastName: '', phone: '', countryId: '' });

  // Step 1 — programmes
  const [selected, setSelected] = useState<string[]>([]);
  const [search,   setSearch]   = useState('');

  // Step 2 — level
  const [levelId, setLevelId] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/catalogue/programmes').catch(() => ({ data: [] })),
      api.get('/auth/me').catch(() => ({ data: null })),
    ]).then(([pr, mr]) => {
      // Sort programmes: by type order then alphabetically
      const typeOrder: ProgrammeType[] = [
        'NATIONAL_CURRICULUM', 'INTERNATIONAL_EXAM', 'PROFESSIONAL_LICENSURE',
        'LANGUAGE_PROFICIENCY', 'CPD', 'UNIVERSITY',
      ];
      const sorted = (pr.data ?? []).sort((a: Programme, b: Programme) => {
        const ti = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
        return ti !== 0 ? ti : (a.name).localeCompare(b.name);
      });
      setProgrammes(sorted);
      if (mr.data?.firstName) setFirstName(mr.data.firstName);
      if (mr.data && !mr.data.countryId) {
        setNeedsAbout(true);
        setStep(0);
        setAbout({
          firstName: mr.data.firstName ?? '', lastName: mr.data.lastName ?? '',
          phone: mr.data.phone ?? '', countryId: '',
        });
        api.get('/countries').then(r => setCountries(r.data ?? [])).catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, []);

  const aboutFields = () => needsAbout ? {
    firstName: about.firstName.trim() || undefined,
    lastName:  about.lastName.trim()  || undefined,
    phone:     about.phone.trim()     || undefined,
    countryId: about.countryId,
  } : {};

  function apiError(err: any) {
    const m = err?.response?.data?.message;
    return Array.isArray(m) ? m.join(' · ') : m ?? 'Could not save your details. Please try again.';
  }

  function advanceFromAbout() {
    if (!about.countryId) { setError('Please select your country.'); return; }
    setError('');
    if (about.firstName.trim()) setFirstName(about.firstName.trim());
    setStep(1);
  }

  async function skipProgrammes() {
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/auth/onboarding', { programmeIds: [], ...aboutFields() });
      if (data?.accessToken) await setAuthToken(data.accessToken, true);
      router.push('/student/catalogue');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Deduplicated, sorted levels from selected programmes
  const levels = programmes
    .filter(p => selected.includes(p.id))
    .flatMap(p => p.levels)
    .filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  // Filtered + grouped programmes for display
  const filtered = programmes.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.shortName ?? '').toLowerCase().includes(q);
  });

  const grouped: Partial<Record<ProgrammeType, Programme[]>> = {};
  for (const p of filtered) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type]!.push(p);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/auth/onboarding', {
        programmeIds: selected,
        levelId: levelId || undefined,
        ...aboutFields(),
      });
      // Replace cookie with fresh JWT that has onboardingCompleted = true
      if (data?.accessToken) {
        await setAuthToken(data.accessToken, true);
      }
      setStep(3);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  function advanceFromStep1() {
    if (selected.length === 0) return;
    if (levels.length > 0) {
      setLevelId('');
      setStep(2);
    } else {
      save();
    }
  }

  // Step indicator (only shown on steps 1 & 2)
  function StepDots() {
    const dots: Step[] = needsAbout ? [0, 1, 2] : [1, 2];
    return (
      <div className="flex items-center justify-center gap-3 mb-6">
        {dots.map(n => (
          <div key={n} className={`h-2 rounded-full transition-all duration-300 ${
            step === n ? 'w-8 bg-white' : step > n ? 'w-2 bg-azure' : 'w-2 bg-white/25'
          }`} />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#030e30] via-[#072061] to-[#0d2f8a] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur mb-4">
            <Icon name="graduate" size={28} className="text-white" />
          </div>
          {step !== 3 && (
            <>
              <h1 className="text-2xl font-black text-white mb-1">
                {step === 0
                  ? firstName ? `Welcome, ${firstName}! Let’s finish your account` : 'Let’s finish your account'
                  : step === 1
                  ? firstName ? `Hi ${firstName}! What are you studying?` : 'What are you studying?'
                  : 'What level are you at?'}
              </h1>
              <p className="text-white/50 text-sm">
                {step === 0
                  ? 'A few details we need before you start learning'
                  : step === 1
                  ? 'Select your programmes so we can personalise your catalogue view'
                  : 'Based on your selected programmes'}
              </p>
            </>
          )}
        </div>

        {step !== 3 && <StepDots />}

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {error && (
            <p role="alert" className="mx-6 mt-6 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs text-red-600">{error}</p>
          )}

          {/* ── Step 0: About you (accounts without a country) ── */}
          {step === 0 && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-navy">First name</span>
                  <input value={about.firstName} onChange={e => setAbout(a => ({ ...a, firstName: e.target.value }))}
                    className="w-full rounded-xl border border-cloud bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-navy">Last name</span>
                  <input value={about.lastName} onChange={e => setAbout(a => ({ ...a, lastName: e.target.value }))}
                    className="w-full rounded-xl border border-cloud bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure" />
                </label>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-navy">Country</span>
                <Select value={about.countryId} onValueChange={v => setAbout(a => ({ ...a, countryId: v }))}
                  placeholder="Select your country" options={countries.map(c => ({ value: c.id, label: c.name }))} />
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-navy">Phone <span className="font-normal text-royal/40">(optional)</span></span>
                <input type="tel" placeholder="+237 6XX XXX XXX" value={about.phone} onChange={e => setAbout(a => ({ ...a, phone: e.target.value }))}
                  className="w-full rounded-xl border border-cloud bg-white px-3.5 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              </label>
              <div className="flex justify-end pt-2 border-t border-cloud">
                <Button onClick={advanceFromAbout}>Continue <Icon name="arrowRight" size={13} /></Button>
              </div>
            </div>
          )}

          {/* ── Step 1: Programmes ── */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              <div className="relative">
                <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/40" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search programmes…"
                  className="w-full rounded-xl border border-cloud bg-white pl-9 pr-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                />
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-royal/40">Loading programmes…</div>
              ) : Object.keys(grouped).length === 0 ? (
                <div className="py-12 text-center text-sm text-royal/40">No programmes found</div>
              ) : (
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {(Object.keys(grouped) as ProgrammeType[]).map(type => (
                    <div key={type}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-2">
                        {TYPE_LABELS[type]}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {grouped[type]!.map(p => {
                          const sel = selected.includes(p.id);
                          return (
                            <button key={p.id} type="button" onClick={() => toggle(p.id)}
                              className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                                sel ? 'border-azure bg-azure/5' : 'border-cloud bg-white hover:border-azure/40'
                              }`}>
                              <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
                                sel ? 'border-azure bg-azure' : 'border-cloud'
                              }`}>
                                {sel && (
                                  <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-navy leading-tight">{p.shortName ?? p.name}</p>
                                {p.shortName && (
                                  <p className="text-[10px] text-royal/50 truncate mt-0.5">{p.name}</p>
                                )}
                                <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${TYPE_COLORS[type]}`}>
                                  {TYPE_LABELS[type]}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-cloud">
                <p className="text-xs text-royal/50">
                  {selected.length > 0 ? `${selected.length} selected` : 'Select at least one'}
                </p>
                <div className="flex gap-2">
                  {needsAbout && (
                    <Button variant="secondary" aria-label="Back" onClick={() => { setError(''); setStep(0); }}>
                      <Icon name="arrowLeft" size={13} />
                    </Button>
                  )}
                  <Button variant="secondary" loading={saving} onClick={skipProgrammes}>
                    Skip for now
                  </Button>
                  <Button disabled={selected.length === 0} onClick={advanceFromStep1}>
                    {levels.length > 0 ? 'Next' : 'Finish'} <Icon name="arrowRight" size={13} />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Level ── */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {levels.map(l => {
                  const sel = levelId === l.id;
                  return (
                    <button key={l.id} type="button" onClick={() => setLevelId(sel ? '' : l.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                        sel ? 'border-azure bg-azure/5' : 'border-cloud bg-white hover:border-azure/40'
                      }`}>
                      <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
                        sel ? 'border-azure bg-azure' : 'border-cloud'
                      }`}>
                        {sel && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy">{l.name}</p>
                        <p className="text-[10px] text-royal/40">{l.tier.replace(/_/g, ' ')}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2 border-t border-cloud">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <Icon name="arrowLeft" size={13} /> Back
                </Button>
                <Button className="flex-1" loading={saving} onClick={save}>
                  Finish setup <Icon name="check" size={13} />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done / Nudge ── */}
          {step === 3 && (
            <div className="p-8 text-center space-y-6">
              <div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-azure/10 mx-auto mb-4">
                  <svg className="h-8 w-8 text-azure" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-navy mb-1">
                  {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
                </h2>
                <p className="text-sm text-royal/50">Your preferences are saved. Here's what to do next:</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <Link href="/student/catalogue"
                  className="flex items-start gap-3 rounded-2xl border-2 border-cloud p-4 hover:border-azure hover:bg-azure/5 transition group">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10 text-azure group-hover:bg-azure group-hover:text-white transition">
                    <Icon name="notebook" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">Browse catalogue</p>
                    <p className="text-[11px] text-royal/50 mt-0.5">Explore courses by programme and subject</p>
                  </div>
                </Link>

                <Link href="/packages"
                  className="flex items-start gap-3 rounded-2xl border-2 border-cloud p-4 hover:border-azure hover:bg-azure/5 transition group">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10 text-azure group-hover:bg-azure group-hover:text-white transition">
                    <Icon name="packages" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">View packages</p>
                    <p className="text-[11px] text-royal/50 mt-0.5">Unlock multiple courses at once</p>
                  </div>
                </Link>

                <Link href="/student/live"
                  className="flex items-start gap-3 rounded-2xl border-2 border-cloud p-4 hover:border-azure hover:bg-azure/5 transition group">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10 text-azure group-hover:bg-azure group-hover:text-white transition">
                    <Icon name="live" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">Live classes</p>
                    <p className="text-[11px] text-royal/50 mt-0.5">Join scheduled sessions with teachers</p>
                  </div>
                </Link>

                <Link href="/student/mentorship"
                  className="flex items-start gap-3 rounded-2xl border-2 border-cloud p-4 hover:border-azure hover:bg-azure/5 transition group">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10 text-azure group-hover:bg-azure group-hover:text-white transition">
                    <Icon name="graduate" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">Book a mentor</p>
                    <p className="text-[11px] text-royal/50 mt-0.5">1-on-1 sessions with expert teachers</p>
                  </div>
                </Link>
              </div>

              <button
                onClick={() => router.push('/student/catalogue')}
                className="w-full rounded-2xl bg-azure py-3 text-sm font-bold text-white hover:bg-royal transition">
                Explore your catalogue
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-white/30 text-xs mt-4">
          You can always update your preferences from settings
        </p>
      </div>
    </div>
  );
}
