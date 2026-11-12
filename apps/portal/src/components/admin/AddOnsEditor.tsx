'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Offers { currency: string; months: number | null; live: { price: number; cohortId: string } | null; mentorship: { price: number; perMonth: number } | null }
interface CohortOpt { id: string; name: string; teacher: string }

const fcfa = (c: string) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c);

/**
 * "Add-ons at checkout" for a course sold on its own or a package: live classes (a place in a cohort) and
 * mentorship (sessions a month), each switched on with its price. A package that already includes live
 * classes or mentorship doesn't offer it again.
 */
export function AddOnsEditor({ kind, id, includesLive, includesMentorship }: { kind: 'course' | 'package'; id: string; includesLive?: boolean; includesMentorship?: boolean }) {
  const [offers, setOffers] = useState<Offers | null>(null);
  const [cohorts, setCohorts] = useState<CohortOpt[]>([]);
  const [live, setLive] = useState(false), [cohortId, setCohortId] = useState(''), [livePrice, setLivePrice] = useState('');
  const [ment, setMent] = useState(false), [perMonth, setPerMonth] = useState('2'), [mentPrice, setMentPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/payments/add-ons/${kind}/${id}`).then(r => {
      const o: Offers = r.data; setOffers(o);
      setLive(!!o.live); setCohortId(o.live?.cohortId ?? ''); setLivePrice(o.live ? String(minorToMajor(o.live.price, o.currency)) : '');
      setMent(!!o.mentorship); setPerMonth(String(o.mentorship?.perMonth ?? 2)); setMentPrice(o.mentorship ? String(minorToMajor(o.mentorship.price, o.currency)) : '');
    }).catch(() => setOffers(null));
    api.get('/admin/cohort-pay').then(r => setCohorts((r.data?.cohorts ?? []).map((c: any) => ({ id: c.id, name: c.name, teacher: c.teacher })))).catch(() => {});
  }, [kind, id]);

  async function save() {
    if (!offers) return;
    setSaving(true);
    try {
      const n = (v: string) => Number(v.replace(/[,\s]/g, ''));
      const body = {
        ...(!includesLive && { live: live ? { cohortId, price: n(livePrice) } : null }),
        ...(!includesMentorship && { mentorship: ment ? { perMonth: n(perMonth), price: n(mentPrice) } : null }),
      };
      const r = await api.put(`/payments/admin/add-ons/${kind}/${id}`, body);
      setOffers(r.data);
      notify.success('Add-ons saved');
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save add-ons').join(', ')); }
    finally { setSaving(false); }
  }

  if (!offers) return <div className="h-24 animate-pulse rounded-md bg-subtle" />;
  const c = fcfa(offers.currency);
  const sw = (on: boolean) => clsx('relative h-[26px] w-11 flex-shrink-0 rounded-full transition-colors', on ? 'bg-[#3F6FE8]' : 'bg-[#C9D3E8]');
  const knob = (on: boolean) => clsx('absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all', on ? 'left-[21px]' : 'left-[3px]');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink2">Extras students can tick when buying this {kind}. Each adds its price to the total; coupons don’t discount them.</p>

      <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={live} aria-label="Offer live classes" disabled={includesLive} onClick={() => setLive(v => !v)} className={clsx(sw(live), includesLive && 'opacity-40')}><span className={knob(live)} /></button>
          <div className="min-w-0"><p className="text-[14px] font-bold text-navy">Live classes</p><p className="text-xs text-muted">{includesLive ? 'This package already includes live classes' : live ? 'Offered at checkout' : 'Not offered'}</p></div>
        </div>
        {live && !includesLive && (
          <div className="grid gap-2.5 sm:grid-cols-[1fr_160px]">
            <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-navy">Joins this class</span>
              <select value={cohortId} onChange={e => setCohortId(e.target.value)} className="input-base"><option value="">Choose a cohort</option>{cohorts.map(x => <option key={x.id} value={x.id}>{x.name} · {x.teacher}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-navy">Price ({c})</span>
              <input inputMode="decimal" value={livePrice} onChange={e => setLivePrice(e.target.value)} placeholder="e.g. 15000" className="input-base" /></label>
            <p className="text-xs text-muted sm:col-span-2">The class teacher gets their cohort share of this price, plus their fee for each class they teach.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={ment} aria-label="Offer mentorship" disabled={includesMentorship} onClick={() => setMent(v => !v)} className={clsx(sw(ment), includesMentorship && 'opacity-40')}><span className={knob(ment)} /></button>
          <div className="min-w-0"><p className="text-[14px] font-bold text-navy">Mentorship</p><p className="text-xs text-muted">{includesMentorship ? 'This package already includes mentorship' : ment ? 'Offered at checkout' : 'Not offered'}</p></div>
        </div>
        {ment && !includesMentorship && (
          <div className="grid gap-2.5 sm:grid-cols-[1fr_160px]">
            <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-navy">Sessions a month (30 min each)</span>
              <input inputMode="numeric" value={perMonth} onChange={e => setPerMonth(e.target.value)} className="input-base" /></label>
            <label className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold text-navy">Price ({c}){offers.months ? `, for ${offers.months} months` : ''}</span>
              <input inputMode="decimal" value={mentPrice} onChange={e => setMentPrice(e.target.value)} placeholder="e.g. 8000" className="input-base" /></label>
            <p className="text-xs text-muted sm:col-span-2">Lasts as long as the {kind} access. CareerPath keeps this; mentors are paid for each session that takes place.</p>
          </div>
        )}
      </div>

      <Button size="sm" className="self-start" onClick={save} loading={saving} disabled={(live && !includesLive && (!cohortId || !livePrice)) || (ment && !includesMentorship && (!perMonth || !mentPrice))}>Save add-ons</Button>
    </div>
  );
}
