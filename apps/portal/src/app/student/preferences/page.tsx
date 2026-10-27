'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import api, { setAuthToken } from '@/lib/api';

type ProgrammeType = 'NATIONAL_CURRICULUM' | 'INTERNATIONAL_EXAM' | 'PROFESSIONAL_LICENSURE' | 'LANGUAGE_PROFICIENCY' | 'CPD' | 'UNIVERSITY';

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

export default function StudentPreferencesPage() {
  const router = useRouter();
  const [programmes,  setProgrammes]  = useState<Programme[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<string[]>([]);
  const [levelId,     setLevelId]     = useState('');
  const [activeStep,  setActiveStep]  = useState<1 | 2>(1);

  useEffect(() => {
    Promise.all([
      api.get('/catalogue/programmes').catch(() => ({ data: [] })),
      api.get('/auth/me').catch(() => ({ data: null })),
    ]).then(([pr, mr]) => {
      const typeOrder: ProgrammeType[] = [
        'NATIONAL_CURRICULUM', 'INTERNATIONAL_EXAM', 'PROFESSIONAL_LICENSURE',
        'LANGUAGE_PROFICIENCY', 'CPD', 'UNIVERSITY',
      ];
      const sorted = (pr.data ?? []).sort((a: Programme, b: Programme) => {
        const ti = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
        return ti !== 0 ? ti : a.name.localeCompare(b.name);
      });
      setProgrammes(sorted);

      // Pre-fill current interests
      const currentInterests: string[] = mr.data?.programmeInterestIds ?? [];
      if (currentInterests.length > 0) setSelected(currentInterests);
      if (mr.data?.levelId) setLevelId(mr.data.levelId);
    }).finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const levels = programmes
    .filter(p => selected.includes(p.id))
    .flatMap(p => p.levels)
    .filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

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
    setSaving(true);
    try {
      const { data } = await api.post('/auth/onboarding', {
        programmeIds: selected,
        levelId: levelId || undefined,
      });
      if (data?.accessToken) {
        await setAuthToken(data.accessToken, true);
      }
      notify.success('Preferences saved');
      router.push('/student/catalogue');
    } catch {
      notify.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    if (selected.length === 0) return;
    if (levels.length > 0) {
      setActiveStep(2);
    } else {
      save();
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Learning Preferences" subtitle="Update your programmes and study level" />

      <div className="flex-1 px-4 sm:px-6 py-6 max-w-2xl w-full mx-auto space-y-4">

        {/* Step indicator */}
        {levels.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            {([1, 2] as const).map(n => (
              <button key={n} onClick={() => n < activeStep && setActiveStep(n)}
                className={`flex items-center gap-1.5 ${n < activeStep ? 'cursor-pointer' : 'cursor-default'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
                  activeStep === n ? 'bg-azure text-white' : activeStep > n ? 'bg-azure/20 text-azure' : 'bg-cloud text-royal/40'
                }`}>
                  {activeStep > n ? <Icon name="check" size={12} /> : n}
                </div>
                <span className={`text-xs font-medium ${activeStep === n ? 'text-navy' : 'text-royal/40'}`}>
                  {n === 1 ? 'Programmes' : 'Level'}
                </span>
                {n < 2 && <span className="text-royal/20 mx-1">›</span>}
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Programme selection */}
        {activeStep === 1 && (
          <Card padding="none" className="overflow-hidden">
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-navy mb-0.5">Your programmes</p>
                <p className="text-xs text-royal/50">Select the programmes you&apos;re studying</p>
              </div>

              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/40" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search programmes…"
                  className="w-full rounded-xl border border-cloud bg-white pl-9 pr-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                />
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-royal/40">Loading…</div>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
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
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-cloud bg-surface">
              <p className="text-xs text-royal/50">
                {selected.length > 0 ? `${selected.length} selected` : 'Select at least one'}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
                <Button disabled={selected.length === 0} onClick={handleNext}>
                  {levels.length > 0 ? 'Next' : 'Save'} <Icon name="arrowRight" size={13} />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Level selection */}
        {activeStep === 2 && (
          <Card padding="none" className="overflow-hidden">
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-navy mb-0.5">Your study level</p>
                <p className="text-xs text-royal/50">Based on your selected programmes</p>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
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
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-cloud bg-surface">
              <Button variant="secondary" onClick={() => setActiveStep(1)}>
                <Icon name="arrowLeft" size={13} /> Back
              </Button>
              <Button className="flex-1" loading={saving} onClick={save}>
                Save preferences <Icon name="check" size={13} />
              </Button>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-royal/40">
          Your catalogue will be personalised based on your selections
        </p>
      </div>
    </div>
  );
}
