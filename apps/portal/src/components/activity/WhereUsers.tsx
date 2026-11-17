'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { flag } from '@/components/activity/Activity';

interface Where {
  people: number; active: number; located: number; notSet: number;
  countries: { country: string; code: string | null; profile: number; signIn: number }[];
  cities: { city: string; country: string; code: string; n: number }[];
}
const ROLES: [string, string][] = [['ALL', 'Everyone'], ['STUDENT', 'Students'], ['TEACHER', 'Teachers'], ['COUNTRY_REP', 'Reps']];

/**
 * Insights → Where your users are: for each country, how many people chose it on their profile and how many
 * sign in from it (each person once, at their latest sign-in in the last 30 days); and the top cities.
 */
export function WhereUsers() {
  const [role, setRole] = useState('ALL');
  const [d, setD] = useState<Where | null>(null);
  useEffect(() => { setD(null); api.get(`/admin/activity/where?role=${role}`).then(r => setD(r.data)).catch(() => {}); }, [role]);
  const max = d ? Math.max(1, ...d.countries.map(c => Math.max(c.profile, c.signIn)), d.notSet) : 1;
  const cmax = d ? Math.max(1, ...d.cities.map(c => c.n)) : 1;
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-extrabold text-navy">Where your users are</h2>
          <p className="text-[13px] text-muted">{d ? `${d.people} people · ${d.countries.length} countries · ${d.located} signed in from a known place in the last 30 days` : '…'}</p>
        </div>
        <span role="group" aria-label="Who" className="inline-flex gap-0.5 rounded-lg border border-line bg-white p-[3px]">
          {ROLES.map(([k, l]) => <button key={k} onClick={() => setRole(k)} aria-pressed={role === k} className={clsx('h-7 rounded-md px-2.5 text-[12.5px] text-navy', role === k ? 'bg-accent-soft font-bold' : 'hover:bg-subtle')}>{l}</button>)}
        </span>
      </div>
      {!d ? <div className="h-48 animate-pulse rounded-md bg-subtle" /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap justify-between gap-2 text-[12px] text-muted">
              <span className="font-bold uppercase tracking-[0.06em]">By country</span>
              <span className="flex gap-3"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#3F6FE8]" />Profile country</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8FB0FF]" />Signs in from</span></span>
            </div>
            {d.countries.map(c => (
              <div key={c.country} className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]">
                <span className="truncate text-navy">{flag(c.code)} {c.country}</span>
                <span className="flex flex-col gap-[3px]">
                  <span className="h-2 overflow-hidden rounded bg-[#EAF0FF]"><span className="block h-2 rounded bg-[#3F6FE8]" style={{ width: `${(c.profile / max) * 100}%` }} /></span>
                  <span className="h-2 overflow-hidden rounded bg-[#EAF0FF]"><span className="block h-2 rounded bg-[#8FB0FF]" style={{ width: `${(c.signIn / max) * 100}%` }} /></span>
                </span>
                <span className="text-right font-bold tabular-nums text-navy">{c.profile} · {c.signIn}</span>
              </div>
            ))}
            {d.notSet > 0 && (
              <div className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]">
                <span className="text-muted">Not set on profile</span>
                <span className="h-2 overflow-hidden rounded bg-[#F1F4FA]"><span className="block h-2 rounded bg-[#C9D3E8]" style={{ width: `${(d.notSet / max) * 100}%` }} /></span>
                <span className="text-right font-bold tabular-nums text-muted">{d.notSet}</span>
              </div>
            )}
            {!d.countries.length && <p className="text-[13px] text-muted">No countries yet.</p>}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Top cities, last 30 days</span>
            {d.cities.length ? d.cities.map(c => (
              <div key={`${c.city}${c.code}`} className="grid grid-cols-[minmax(0,1fr)_90px_28px] items-center gap-2 text-[13px]">
                <span className="truncate text-navy">{c.city} <span className="text-muted">{flag(c.code)}</span></span>
                <span className="h-2 overflow-hidden rounded bg-[#EAF0FF]"><span className="block h-2 rounded bg-[#3F6FE8]" style={{ width: `${(c.n / cmax) * 100}%` }} /></span>
                <span className="text-right font-bold tabular-nums text-navy">{c.n}</span>
              </div>
            )) : <p className="text-[13px] text-muted">Places appear as people sign in.</p>}
          </div>
        </div>
      )}
      <p className="text-[11.5px] text-muted">People, not visits: each person counts once. Places come from IP addresses and are approximate (mobile data often shows the operator’s nearest big city). <a href="https://db-ip.com" target="_blank" rel="noreferrer" className="hover:underline">IP data by DB-IP</a>.</p>
    </section>
  );
}

interface Places { places: { city: string | null; country: string; code: string | null; signIns: number; last: string }[]; profileCountry: string | null; matches: boolean | null }

/** People → a person → Signs in from */
export function PersonPlaces({ userId }: { userId: string }) {
  const [d, setD] = useState<Places | null>(null);
  useEffect(() => { api.get(`/admin/activity/places/${userId}`).then(r => setD(r.data)).catch(() => setD({ places: [], profileCountry: null, matches: null })); }, [userId]);
  if (!d) return <div className="h-12 animate-pulse rounded-md bg-subtle" />;
  if (!d.places.length) return <p className="text-[13px] text-muted">No known places yet: they appear from their next sign-in.</p>;
  return (
    <div className="flex flex-col divide-y divide-line text-[13.5px]">
      {d.places.map((p, i) => (
        <div key={`${p.city}${p.code}`} className="flex items-center gap-3 py-1.5">
          <span className="min-w-0 flex-1 text-navy"><strong>{[p.city, p.country].filter(Boolean).join(', ')}</strong> {flag(p.code)}{i === 0 && d.places.length > 1 && <span className="text-xs text-muted"> · usually</span>}</span>
          <span className="text-xs text-muted">{p.signIns} sign-in{p.signIns === 1 ? '' : 's'}</span>
        </div>
      ))}
      <div className="flex items-center gap-3 py-1.5">
        <span className="flex-1 text-muted">Profile country</span>
        <span className={clsx('text-xs font-semibold', d.matches === false ? 'text-[#8A5A00]' : 'text-muted')}>{d.profileCountry ?? 'Not set'}{d.matches === true ? ' ✓ matches' : d.matches === false ? ' · differs from where they sign in' : ''}</span>
      </div>
    </div>
  );
}
