'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface Rep { id: string; email: string; }
interface Country {
  id: string; name: string; code: string; currency: string;
  repCommissionPercent: number | null; perStudentBonus: number | null;
  rep: Rep | null;
}
interface EditState { repCommissionPercent: string; perStudentBonus: string; }

export default function AdminCountriesPage() {
  const [countries, setCountries]       = useState<Country[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [editing, setEditing]           = useState<string | null>(null);
  const [editState, setEditState]       = useState<Record<string, EditState>>({});
  const [form, setForm]                 = useState({ name: '', code: '', currency: '', repCommissionPercent: '', perStudentBonus: '' });

  // Rep search state (per-country)
  const [repSearch, setRepSearch]       = useState<Record<string, string>>({});
  const [repResults, setRepResults]     = useState<Record<string, Rep[]>>({});
  const [selectedRep, setSelectedRep]   = useState<Record<string, Rep | null>>({});
  const searchTimers                    = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function loadCountries() {
    const r = await api.get('/countries/admin/countries');
    setCountries(r.data);
  }

  useEffect(() => {
    loadCountries().catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function createCountry(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/countries/admin/countries', {
        name: form.name, code: form.code.toUpperCase(), currency: form.currency.toUpperCase(),
        ...(form.repCommissionPercent && { repCommissionPercent: parseFloat(form.repCommissionPercent) }),
        ...(form.perStudentBonus && { perStudentBonus: parseInt(form.perStudentBonus) }),
      });
      await loadCountries();
      setShowForm(false);
      setForm({ name: '', code: '', currency: '', repCommissionPercent: '', perStudentBonus: '' });
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  async function updateCountry(id: string) {
    const state = editState[id]; if (!state) return;
    const rep = selectedRep[id];
    setSaving(true);
    try {
      await api.patch(`/countries/admin/countries/${id}`, {
        ...(state.repCommissionPercent && { repCommissionPercent: parseFloat(state.repCommissionPercent) }),
        ...(state.perStudentBonus && { perStudentBonus: parseInt(state.perStudentBonus) }),
        ...(rep && { repId: rep.id }),
      });
      await loadCountries();
      setEditing(null);
      setSelectedRep(r => ({ ...r, [id]: null }));
      setRepSearch(r => ({ ...r, [id]: '' }));
      setRepResults(r => ({ ...r, [id]: [] }));
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  function startEdit(c: Country) {
    setEditing(c.id);
    setEditState(s => ({ ...s, [c.id]: {
      repCommissionPercent: c.repCommissionPercent?.toString() ?? '',
      perStudentBonus: c.perStudentBonus?.toString() ?? '',
    }}));
    setSelectedRep(r => ({ ...r, [c.id]: c.rep }));
    setRepSearch(r => ({ ...r, [c.id]: c.rep?.email ?? '' }));
  }

  function handleRepSearch(countryId: string, value: string) {
    setRepSearch(r => ({ ...r, [countryId]: value }));
    setSelectedRep(r => ({ ...r, [countryId]: null }));
    if (searchTimers.current[countryId]) clearTimeout(searchTimers.current[countryId]);
    if (value.length < 2) { setRepResults(r => ({ ...r, [countryId]: [] })); return; }
    searchTimers.current[countryId] = setTimeout(async () => {
      try {
        const res = await api.get(`/portals/admin/users/search?email=${encodeURIComponent(value)}`);
        setRepResults(r => ({ ...r, [countryId]: res.data }));
      } catch { setRepResults(r => ({ ...r, [countryId]: [] })); }
    }, 300);
  }

  function pickRep(countryId: string, rep: Rep) {
    setSelectedRep(r => ({ ...r, [countryId]: rep }));
    setRepSearch(r => ({ ...r, [countryId]: rep.email }));
    setRepResults(r => ({ ...r, [countryId]: [] }));
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Countries" subtitle="Manage markets, currencies and country reps" />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COUNTRIES</p>
            <h2 className="text-base font-bold text-navy">{countries.length} active market{countries.length !== 1 ? 's' : ''}</h2>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Icon name="add" size={14} /> Add country
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">NEW COUNTRY</p>
            <form onSubmit={createCountry} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { field: 'name', label: 'Country name', placeholder: 'Nigeria' },
                { field: 'code', label: 'ISO code', placeholder: 'NG' },
                { field: 'currency', label: 'Currency code', placeholder: 'NGN' },
                { field: 'repCommissionPercent', label: 'Rep commission %', placeholder: '10' },
                { field: 'perStudentBonus', label: 'Per-student bonus', placeholder: '500' },
              ].map(({ field, label, placeholder }) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-semibold text-navy">{label}</label>
                  <input value={(form as any)[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder} required={['name','code','currency'].includes(field)}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
                </div>
              ))}
              <div className="col-span-2 sm:col-span-3 flex gap-3 pt-1">
                <Button type="submit" loading={saving} size="sm">Create</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Countries grid */}
        {countries.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="countries" title="No countries yet" description="Add your first country to start assigning reps and tracking revenue" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {countries.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, ...spring.smooth }}
              >
              <Card padding="none" className="overflow-hidden">
                {/* Header */}
                <div className="bg-navy p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/20">
                      <Icon name="countries" size={18} className="text-azure" />
                    </div>
                    <span className="rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-bold text-azure">{c.currency}</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{c.name}</h3>
                  <p className="text-xs text-white/40">{c.code}</p>
                </div>

                <div className="p-4 space-y-2">
                  {editing === c.id ? (
                    <div className="space-y-3">
                      {/* Commission + bonus */}
                      {[
                        { field: 'repCommissionPercent', label: 'Commission %', placeholder: '10' },
                        { field: 'perStudentBonus',      label: 'Per-student bonus', placeholder: '500' },
                      ].map(({ field, label, placeholder }) => (
                        <div key={field} className="space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{label}</label>
                          <input
                            value={(editState[c.id] as any)?.[field] ?? ''}
                            onChange={e => setEditState(s => ({ ...s, [c.id]: { ...s[c.id], [field]: e.target.value } }))}
                            placeholder={placeholder}
                            className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                          />
                        </div>
                      ))}

                      {/* Rep email search */}
                      <div className="space-y-1 relative">
                        <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">
                          Assign Rep <span className="normal-case text-royal/30">(search by email)</span>
                        </label>
                        <div className="relative">
                          <Icon name="search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
                          <input
                            value={repSearch[c.id] ?? ''}
                            onChange={e => handleRepSearch(c.id, e.target.value)}
                            placeholder="Type email to search…"
                            className="w-full rounded-xl border border-cloud bg-white pl-8 pr-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
                          />
                          {selectedRep[c.id] && (
                            <Icon name="check" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-azure" />
                          )}
                        </div>

                        {/* Search dropdown */}
                        {(repResults[c.id] ?? []).length > 0 && (
                          <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-cloud bg-white shadow-lg overflow-hidden">
                            {repResults[c.id].map(u => (
                              <button key={u.id} type="button" onClick={() => pickRep(c.id, u)}
                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cloud transition">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cloud text-xs font-bold text-azure">
                                  {u.email[0].toUpperCase()}
                                </div>
                                <span className="text-sm text-navy truncate">{u.email}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {selectedRep[c.id] && (
                          <p className="text-[10px] text-azure">
                            Will promote <span className="font-semibold">{selectedRep[c.id]?.email}</span> → Country Rep & set wallet to {c.currency}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button size="sm" loading={saving} onClick={() => updateCountry(c.id)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-royal/50">Rep commission</span>
                        <span className="font-semibold text-navy">{c.repCommissionPercent != null ? `${c.repCommissionPercent}%` : '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-royal/50">Per-student bonus</span>
                        <span className="font-semibold text-navy">{c.perStudentBonus != null ? `${c.perStudentBonus} ${c.currency}` : '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-royal/50">Country rep</span>
                        {c.rep ? (
                          <span className="font-semibold text-azure truncate max-w-[140px]">{c.rep.email}</span>
                        ) : (
                          <span className="text-royal/30 italic">Not assigned</span>
                        )}
                      </div>
                      <button onClick={() => startEdit(c)}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-cloud py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                        <Icon name="edit" size={13} /> Edit settings
                      </button>
                    </>
                  )}
                </div>
              </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
