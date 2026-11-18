'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { Flag } from '@/components/ui/Flag';

export interface Entry {
  id: string; at: string; action: string; area: string; summary: string;
  actor: { id: string; name: string; role: string | null; avatarUrl: string | null } | null;
  target: { type: string; id: string | null; label: string | null } | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; metadata: Record<string, unknown> | null;
  device: string | null; ip: string | null; fullIp: string | null;
  place: { city: string | null; country: string; code: string | null } | null; newCountry: boolean;
}

/** A country's flag from its two-letter code (Windows shows the letters instead) */
export const flag = (code?: string | null) => code && /^[A-Za-z]{2}$/.test(code) ? String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))) : '';
export const placeText = (p?: { city: string | null; country: string } | null) => p ? [p.city, p.country].filter(Boolean).join(', ') : null;

export const AREA_STYLE: Record<string, string> = {
  People: 'bg-[#EAF0FF] text-[#2F57C9]', Courses: 'bg-[#FFF1D6] text-[#8A5A00]', Money: 'bg-[#E3F5EA] text-[#17703A]',
  Selling: 'bg-[#FDEBF3] text-[#A0306A]', 'Sign-in': 'bg-[#F3EAFE] text-[#6B3FB8]', Settings: 'bg-[#F1F4FA] text-[#3A4A6B]',
};
const ROLE: Record<string, string> = { ADMIN: 'Admin', TEACHER: 'Teacher', STUDENT: 'Student', COUNTRY_REP: 'Country rep', SUBJECT_REVIEWER: 'Reviewer', ORG_ADMIN: 'School admin' };
const AV = ['#3F6FE8', '#17703A', '#6B3FB8', '#A0306A', '#8A5A00', '#2F57C9'];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  const long = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return diff === 0 ? `Today · ${long}` : diff === 1 ? `Yesterday · ${long}` : long;
}

/** Where an item opens in the admin portal */
export function itemHref(t: Entry['target']): string | null {
  if (!t?.id) return null;
  switch (t.type) {
    case 'PlatformCourse': return `/admin/courses/${t.id}`;
    case 'Package': return '/admin/packages';
    case 'Coupon': return '/admin/coupons';
    case 'Cohort': return '/admin/cohorts';
    case 'Country': return '/admin/countries';
    default: return null;
  }
}

export function Who({ e }: { e: Entry }) {
  if (!e.actor) return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#C9D3E8] text-[12px] font-extrabold text-white">?</span>
      <span className="min-w-0"><span className="block truncate text-[13.5px] font-bold text-navy">No name recorded</span><span className="block text-[11.5px] text-muted">{/^teacher\./.test(e.action) ? 'Saved before names were added' : 'The system'}</span></span>
    </span>
  );
  const color = AV[e.actor.id.charCodeAt(0) % AV.length];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {e.actor.avatarUrl ? <img src={e.actor.avatarUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
        : <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[11.5px] font-extrabold text-white" style={{ background: color }}>{initials(e.actor.name)}</span>}
      <span className="min-w-0"><span className="block truncate text-[13.5px] font-bold text-navy">{e.actor.name}</span><span className="block text-[11.5px] text-muted">{ROLE[e.actor.role ?? ''] ?? e.actor.role ?? ''}</span></span>
    </span>
  );
}

export const AreaTag = ({ area }: { area: string }) => <span className={clsx('inline-flex h-[22px] items-center rounded-md px-2 text-[11.5px] font-bold', AREA_STYLE[area] ?? AREA_STYLE.Settings)}>{area}</span>;

const show = (v: unknown): string => v == null || v === '' ? '—' : typeof v === 'object' ? (Array.isArray(v) ? v.map(show).join(' · ') : JSON.stringify(v)) : String(v);
const WORD: Record<string, string> = {
  priceAmount: 'Price (smallest unit)', priceCurrency: 'Currency', isSoldIndividually: 'Sold on its own', accessMonths: 'Access (months)', catalogueHidden: 'Hidden from catalogue',
  teacherId: 'Teacher', teacherPending: 'No teacher yet', programmeId: 'Exam', subjectId: 'Subject', levelId: 'Level', shortDescription: 'Short description', coverUrl: 'Cover image',
  approvalStatus: 'Application', wpCourseUrl: 'Website link',
};
const word = (k: string) => WORD[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

/** Before and after, field by field; a list of courses shows one line per course that changed */
export function Changes({ e }: { e: Entry }) {
  const b = e.before ?? {}, a = e.after ?? {};
  if (Array.isArray((a as any).courses)) {
    const before = new Map(((b as any).courses ?? []).map((c: any) => [c.id, c]));
    const rows = ((a as any).courses as any[]).flatMap(c => {
      const was: any = before.get(c.id) ?? {};
      return Object.keys(c).filter(k => !['id', 'title'].includes(k) && JSON.stringify(was[k]) !== JSON.stringify(c[k])).map(k => ({ item: c.title, k, was: was[k], now: c[k] }));
    });
    if (!rows.length) return null;
    return <DiffTable rows={rows.slice(0, 40).map(r => [`${r.item} · ${word(r.k)}`, show(r.was), show(r.now)])} more={rows.length - 40} />;
  }
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => JSON.stringify((b as any)[k]) !== JSON.stringify((a as any)[k]));
  if (!keys.length) return null;
  return <DiffTable rows={keys.map(k => [word(k), show((b as any)[k]), show((a as any)[k])])} more={0} />;
}

function DiffTable({ rows, more }: { rows: string[][]; more: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[460px] border-collapse text-[12.5px]">
        <thead><tr className="bg-[#FAFBFE] text-left text-[11px] uppercase tracking-[0.06em] text-muted"><th className="px-3 py-2 font-bold">What</th><th className="px-3 py-2 font-bold">Before</th><th className="px-3 py-2 font-bold">After</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-[#EEF1F7] align-top">
            <td className="px-3 py-2 text-navy">{r[0]}</td>
            <td className="max-w-[340px] break-words px-3 py-2 text-[#9B2C22] line-through decoration-[#9B2C22]/40">{r[1]}</td>
            <td className="max-w-[340px] break-words px-3 py-2 font-semibold text-[#17703A]">{r[2]}</td>
          </tr>
        ))}</tbody>
      </table>
      {more > 0 && <p className="border-t border-line px-3 py-2 text-xs text-muted">and {more} more changes</p>}
    </div>
  );
}

/** The details under an entry: before and after, where and how, the item */
export function EntryDetails({ e }: { e: Entry }) {
  const href = itemHref(e.target);
  const m = e.metadata as any;
  return (
    <div className="flex flex-col gap-2.5">
      <Changes e={e} />
      <dl className="grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-[auto_1fr]">
        {e.target && <><dt className="text-muted">Item</dt><dd className="text-navy">{href ? <Link href={href} className="font-semibold text-azure-strong hover:underline">{e.target.label ?? e.target.type}</Link> : (e.target.label ?? e.target.type)}</dd></>}
        <dt className="text-muted">When</dt><dd className="text-navy">{new Date(e.at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' })}</dd>
        <dt className="text-muted">From</dt><dd className="text-navy">{placeText(e.place) && <>{placeText(e.place)} <Flag code={e.place?.code} title={e.place?.country} />{(e.device || e.fullIp) && ' · '}</>}{[e.device, e.fullIp].filter(Boolean).join(' · ') || (!placeText(e.place) && 'Not recorded (older entry, or the system)')}{e.newCountry && <span className="ml-2 rounded-md bg-[#FFF1D6] px-1.5 py-0.5 text-[11px] font-extrabold text-[#8A5A00]">New country for them</span>}</dd>
        {m?.route && <><dt className="text-muted">Request</dt><dd className="font-mono text-[11.5px] text-ink2">{m.method} {m.route}{m.fields?.length ? ` · fields: ${m.fields.join(', ')}` : ''}</dd></>}
        {m?.rejectionReason && <><dt className="text-muted">Reason</dt><dd className="text-navy">{m.rejectionReason}</dd></>}
        <dt className="text-muted">Reference</dt><dd className="font-mono text-[11.5px] text-ink2">{e.action} · {e.id.slice(0, 8)}</dd>
      </dl>
    </div>
  );
}

/**
 * The History section in a drawer: this item's entries, newest first. `person` shows what someone did and
 * what was done to them.
 */
export function ActivityHistory({ targetType, targetId, person, limit = 15 }: { targetType?: string; targetId?: string; person?: string; limit?: number }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), ...(person ? { person } : { targetType: targetType ?? '', targetId: targetId ?? '' }) });
    api.get(`/admin/activity?${params}`).then(r => { setRows(r.data.entries); setTotal(r.data.total); }).catch(() => setRows([]));
  }, [targetType, targetId, person, limit]);
  if (!rows) return <div className="h-16 animate-pulse rounded-md bg-subtle" />;
  if (!rows.length) return <p className="text-[13px] text-muted">No changes recorded yet. From now on, every change shows here.</p>;
  const all = person ? `/admin/activity?person=${person}` : `/admin/activity?targetType=${targetType}&targetId=${targetId}`;
  return (
    <div className="flex flex-col">
      {rows.map((e, i) => (
        <div key={e.id} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 py-2">
          {i < rows.length - 1 && <span className="absolute left-[6px] top-6 -bottom-2 w-0.5 bg-line" />}
          <span className="mt-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-[#3F6FE8] ring-2 ring-[#3F6FE8]" />
          <span className="min-w-0">
            <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="block text-left text-[13.5px] font-bold text-navy hover:text-azure-strong">{e.summary}</button>
            <span className="block text-xs text-muted">{e.actor?.name ?? 'No name recorded'} · {new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {time(e.at)}</span>
            {open === e.id && <div className="mt-2"><EntryDetails e={e} /></div>}
          </span>
        </div>
      ))}
      {total > rows.length && <Link href={all} className="mt-1 text-[13px] font-semibold text-azure-strong hover:underline">All {total} entries in the Activity log</Link>}
    </div>
  );
}
