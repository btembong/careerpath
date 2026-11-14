'use client';
import { clsx } from 'clsx';

/**
 * The top of a student or teacher page, in the profile hero's style: blue, a small line, a big
 * two-tone headline (the second part in white), a sentence, chips and buttons. On the right a white card,
 * slightly tilted, with something only this page has; on the left, optionally, a tilted photo card.
 */
export function PageHero({ kicker, l1, l2, l2First, sub, chips, actions, aside, photo, asideClassName }: {
  kicker: string; l1: React.ReactNode; l2?: React.ReactNode; l2First?: boolean; sub?: React.ReactNode;
  chips?: { t: string; strong?: boolean }[]; actions?: React.ReactNode; aside?: React.ReactNode; photo?: React.ReactNode;
  /** e.g. "hidden lg:flex" to keep the white card off phones */
  asideClassName?: string;
}) {
  return (
    <section className={clsx('keep-light relative grid items-center gap-5 overflow-hidden rounded-[14px] bg-[#3F6FE8] p-5 text-navy sm:gap-7 sm:px-[30px] sm:py-7',
      photo && aside ? 'lg:grid-cols-[auto_minmax(0,1fr)_340px]' : aside ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : photo ? 'sm:grid-cols-[auto_minmax(0,1fr)]' : '')}>
      <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -top-16 right-[38%] hidden h-[240px] w-[240px] opacity-[0.14] lg:block"><circle cx="100" cy="100" r="80" fill="none" stroke="#FFFFFF" strokeWidth="22" /></svg>
      {photo && <div className="relative w-fit">{photo}</div>}
      <div className="relative flex min-w-0 flex-col gap-2.5">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] sm:text-[12.5px]">{kicker}</p>
        <h1 className="text-[30px] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-[44px]">
          {l2First ? <><span className="text-[#FFFFFF]">{l2}</span>{l1}</> : <>{l1}{l2 && <><br /><span className="text-[#FFFFFF]">{l2}</span></>}</>}
        </h1>
        {sub && <p className="max-w-[580px] text-sm leading-relaxed text-[#0B1F55] sm:text-[15px]">{sub}</p>}
        {chips && chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {chips.map(c => <span key={c.t} className={clsx('inline-flex h-7 items-center rounded-md px-2.5 text-[12.5px] font-bold', c.strong ? 'bg-[#FFFFFF] text-navy' : 'bg-[rgba(255,255,255,0.25)] text-navy')}>{c.t}</span>)}
          </div>
        )}
        {actions && <div className="mt-1.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {aside && (
        <div className={clsx("relative flex min-w-0 flex-col gap-2.5 rounded-xl bg-[#FFFFFF] p-4 text-navy shadow-[0_14px_30px_rgba(7,32,97,0.22)] lg:-rotate-2", asideClassName)}>
          {aside}
        </div>
      )}
    </section>
  );
}

/** A tilted photo card, like the profile hero's */
export function HeroPhoto({ src, initials, caption }: { src?: string | null; initials: string; caption?: string }) {
  return (
    <div className="relative h-[120px] w-[120px] -rotate-3 overflow-hidden rounded-[22px] bg-[#FFFDF8] shadow-[0_12px_26px_rgba(7,32,97,0.25)] sm:h-[136px] sm:w-[136px]">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-[44px] font-extrabold text-[#3F6FE8]">{initials}</span>}
      {caption && <span className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(7,32,97,0.75))] px-2 pb-1.5 pt-4 text-center text-[11px] font-bold text-[#FFFFFF]">{caption}</span>}
    </div>
  );
}

export const heroBtn = 'inline-flex h-10 items-center justify-center rounded-md bg-[#FFFFFF] px-4 text-sm font-bold text-[#2F57C9] hover:bg-[#EAF0FF]';
export const heroBtnDark = 'inline-flex h-10 items-center justify-center rounded-md bg-[#072061] px-4 text-sm font-bold text-[#FFFFFF]';
export const heroBtnLine = 'inline-flex h-10 items-center justify-center rounded-md border border-[rgba(255,255,255,0.7)] px-3.5 text-sm font-semibold text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.1)]';
export const asideLabel = 'text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted';

/** A ring showing a share, with a number in the middle */
export function HeroRing({ value, max, label, size = 56 }: { value: number; max: number; label?: string; size?: number }) {
  const r = 24, c = 2 * Math.PI * r, f = max ? Math.min(1, value / max) : 0;
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} role="img" aria-label={label ?? `${value} of ${max}`} className="flex-shrink-0">
      <circle cx="30" cy="30" r={r} fill="none" stroke="#EAF0FF" strokeWidth="8" />
      {f > 0 && <circle cx="30" cy="30" r={r} fill="none" stroke="#3F6FE8" strokeWidth="8" strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 30 30)" strokeLinecap="round" />}
    </svg>
  );
}
