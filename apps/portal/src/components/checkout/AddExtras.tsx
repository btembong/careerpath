'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';

interface Offers {
  currency: string; owned: boolean; bought: ('live' | 'mentorship')[];
  live: { price: number; cohortName: string; teacher: string | null } | null;
  mentorship: { price: number; perMonth: number } | null;
}

const money = (minor: number, cur: string) => `${cur === 'XAF' || cur === 'XOF' ? 'FCFA' : cur} ${minorToMajor(minor, cur).toLocaleString()}`;

/**
 * For a student who already has a course or package: the extras it offers that they haven't added yet,
 * each opening an extras-only checkout. Shows nothing when there's nothing to add.
 */
export function AddExtras({ kind, id }: { kind: 'course' | 'package'; id: string }) {
  const [o, setO] = useState<Offers | null>(null);
  useEffect(() => { api.get(`/payments/add-ons/${kind}/${id}`).then(r => setO(r.data)).catch(() => setO(null)); }, [kind, id]);
  if (!o?.owned) return null;

  const rows = [
    o.live && { k: 'live', t: 'Live classes', d: `${o.live.cohortName}${o.live.teacher ? ` with ${o.live.teacher}` : ''}`, price: o.live.price },
    o.mentorship && { k: 'mentorship', t: 'Mentorship', d: `${o.mentorship.perMonth} session${o.mentorship.perMonth === 1 ? '' : 's'} a month, 30 min each`, price: o.mentorship.price },
  ].filter(Boolean) as { k: 'live' | 'mentorship'; t: string; d: string; price: number }[];
  if (!rows.length) return null;
  const base = kind === 'course' ? `/student/courses/${id}/checkout` : `/packages/${id}/checkout`;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3.5">
      <p className="text-[13.5px] font-bold text-navy">Add to your {kind}</p>
      {rows.map(r => {
        const has = o.bought.includes(r.k);
        return (
          <div key={r.k} className="flex items-center gap-3 rounded-md border border-line p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-navy">{r.t}</p>
              <p className="mt-0.5 text-[12px] text-muted">{r.d}</p>
            </div>
            {has
              ? <span className="inline-flex h-6 items-center rounded bg-accent-soft px-2 text-xs font-bold text-navy">Added</span>
              : <Link href={`${base}?add=${r.k}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-azure px-2.5 text-[12.5px] font-semibold text-azure-strong hover:bg-accent-soft">Add · {money(r.price, o.currency)}</Link>}
          </div>
        );
      })}
      <p className="text-[12px] text-muted">Lasts as long as your access.</p>
    </div>
  );
}
