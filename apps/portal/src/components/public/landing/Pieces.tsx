import Link from 'next/link';
import { clsx } from 'clsx';

/** Live numbers for the public pages, cached for 10 minutes */
export interface SiteStats { courses: number; freeCourses: number; programmes: number; teachers: number; countries: { code: string; name: string }[]; exams: { id: string; name: string; courses: number }[] }
export async function loadSiteStats(): Promise<SiteStats> {
  const get = async <T,>(path: string): Promise<T | null> => {
    try { const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { next: { revalidate: 600 } }); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const [home, list, teachers] = await Promise.all([
    get<{ programmeCount: number; programmes: { id: string; name: string; courses: number }[] }>('/catalogue/home'),
    get<{ courses: { selling: string }[] }>('/catalogue/course-list'),
    get<{ country: { code: string; name: string } | null }[]>('/catalogue/teacher-list'),
  ]);
  const countries = new Map<string, { code: string; name: string; n: number }>();
  (teachers ?? []).forEach(t => { if (t.country) { const e = countries.get(t.country.code) ?? { ...t.country, n: 0 }; e.n++; countries.set(t.country.code, e); } });
  return {
    courses: list?.courses.length ?? 0,
    freeCourses: list?.courses.filter(c => c.selling === 'free').length ?? 0,
    programmes: home?.programmeCount ?? 0,
    teachers: teachers?.length ?? 0,
    countries: [...countries.values()].sort((a, b) => b.n - a.n).map(({ code, name }) => ({ code, name })),
    exams: (home?.programmes ?? []).filter(p => p.courses > 0).slice(0, 7),
  };
}

/** A real portal screen in a browser window */
export function BrowserShot({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={clsx('overflow-hidden rounded-xl border border-[#E1E7F2] bg-[#FFFFFF] shadow-[0_18px_44px_rgba(7,32,97,0.18)]', className)}>
      <div aria-hidden className="flex h-[26px] items-center gap-[5px] bg-[#EEF2FA] px-2.5"><i className="h-2 w-2 rounded-full bg-[#C9D3E8]" /><i className="h-2 w-2 rounded-full bg-[#C9D3E8]" /><i className="h-2 w-2 rounded-full bg-[#C9D3E8]" /></div>
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} className="block w-full" width={1440} height={900} />
    </div>
  );
}

/** A real portal screen on a phone */
export function PhoneShot({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={clsx('w-[230px] flex-shrink-0 overflow-hidden rounded-[30px] border-[8px] border-[#072061] bg-[#FFFFFF] shadow-[0_24px_50px_rgba(7,32,97,0.3)] sm:w-[250px]', className)}>
      <img src={src} alt={alt} loading="lazy" className="block w-full" width={390} height={844} />
    </div>
  );
}

/** A small card floating over a screenshot */
export function FloatCard({ icon, title, sub, className }: { icon: React.ReactNode; title: string; sub: string; className?: string }) {
  return (
    <div aria-hidden className={clsx('absolute z-[2] hidden items-center gap-2.5 rounded-[10px] bg-[#FFFDF8] px-3.5 py-2.5 text-[13px] text-[#072061] shadow-[0_14px_30px_rgba(7,32,97,0.25)] md:flex', className)}>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] font-extrabold text-[#3F6FE8]">{icon}</span>
      <span><b className="block text-[13.5px]">{title}</b>{sub}</span>
    </div>
  );
}

/**
 * A person in a photo slot. Drop pictures into /public/landing/people (e.g. student-1.jpg); until then an illustrated
 * face fills the slot. They decorate cards only: never shown beside a name or a quote as if they were a real review.
 */
export function PersonSlot({ src, tone = 0, className }: { src?: string; tone?: number; className?: string }) {
  const SKIN = ['#8D5524', '#6B3E1E', '#A0663A', '#5A3418'], TOP = ['#3F6FE8', '#17703A', '#8A5A00', '#6B3FB8'];
  return (
    <span aria-hidden className={clsx('block overflow-hidden rounded-[22px] bg-[#EAF0FF] shadow-[0_12px_26px_rgba(7,32,97,0.2)]', className)}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : (
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <rect width="120" height="120" fill={['#EAF0FF', '#E3F5EA', '#FFF1D6', '#F1E9FF'][tone % 4]} />
          <path d={`M18 120c4-24 22-36 42-36s38 12 42 36z`} fill={TOP[tone % 4]} />
          <circle cx="60" cy="52" r="22" fill={SKIN[tone % 4]} />
          <path d="M37 50c0-16 10-25 23-25s23 9 23 25c-5-7-13-11-23-11s-18 4-23 11z" fill="#1B1B1F" />
        </svg>
      )}
    </span>
  );
}

export function Kicker({ children, dark, center }: { children: React.ReactNode; dark?: boolean; center?: boolean }) {
  return <p className={clsx('text-[12.5px] font-extrabold uppercase tracking-[0.08em]', dark ? 'text-[#7FA3FF]' : 'text-[#3F6FE8]', center && 'text-center')}>{children}</p>;
}
export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={clsx('mt-2 text-[32px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[42px]', className)}>{children}</h2>;
}

/** Plain questions and answers that open in place, readable without scripts */
export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-4 max-w-[820px] border-b border-line">
      {items.map(([q, a]) => (
        <details key={q} className="group border-t border-line py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-bold text-navy">{q}<span aria-hidden className="text-[20px] text-[#3F6FE8] transition-transform group-open:rotate-45">+</span></summary>
          <p className="mt-2 max-w-[700px] text-[15px] leading-relaxed text-[#3A4A6B]">{a}</p>
        </details>
      ))}
    </div>
  );
}

/** The row of live numbers under a hero */
export function StatRow({ items, note }: { items: [string, string][]; note?: React.ReactNode }) {
  return (
    <div className="border-b border-line bg-[#FFFFFF]">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-5 px-4 py-6 sm:px-8 lg:flex lg:items-center lg:justify-between lg:px-14">
        {items.map(([v, l]) => <div key={l}><b className="block text-[28px] font-extrabold tracking-[-0.03em] text-navy sm:text-[30px]">{v}</b><span className="text-[13px] text-[#637090]">{l}</span></div>)}
        {note && <div className="col-span-2 lg:col-span-1">{note}</div>}
      </div>
    </div>
  );
}

export const btnWhite = 'inline-flex h-12 items-center rounded-[7px] bg-[#FFFFFF] px-5 text-[15.5px] font-extrabold text-[#2F57C9] hover:bg-[#F4F7FF]';
export const btnLine = 'inline-flex h-12 items-center rounded-[7px] border border-[rgba(255,255,255,0.7)] px-[18px] text-[15.5px] font-bold text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.1)]';
export const btnBlue = 'inline-flex h-11 items-center rounded-[7px] bg-[#2F57C9] px-[18px] text-[15px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]';
export const wrap = 'mx-auto w-full max-w-[1240px] px-4 sm:px-8 lg:px-14';

export function PayWithChips({ onBlue }: { onBlue?: boolean }) {
  const c = clsx('inline-flex h-[30px] items-center rounded-md px-2.5 text-[12.5px] font-extrabold', onBlue ? 'bg-[rgba(255,255,255,0.3)] text-navy' : 'bg-[#F1F4FA] text-[#3A4A6B]');
  return <span className="inline-flex flex-wrap items-center gap-2"><span className={c}>MTN MoMo</span><span className={c}>Orange Money</span><span className={c}>Card</span></span>;
}

export function DoorLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={clsx(btnBlue, className)}>{children}</Link>;
}
