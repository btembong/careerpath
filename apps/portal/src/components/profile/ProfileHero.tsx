'use client';
import { useRef } from 'react';

/**
 * The top of a profile page: same blue as the dashboard hero, big photo, the name in two lines,
 * what the person is working towards, and up to two buttons.
 */
export function ProfileHero({ photo, initials, kicker, l1, l2, bio, chips, actions, onPhoto, uploading }: {
  photo?: string | null; initials: string; kicker: string; l1: string; l2: string; bio?: string | null; chips: string[];
  actions: React.ReactNode; onPhoto?: (f: File) => void; uploading?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <section className="keep-light relative grid items-center gap-6 overflow-hidden rounded-[14px] bg-[#3F6FE8] px-6 py-7 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="relative w-fit">
        {photo
          ? <img src={photo} alt="" className="h-[124px] w-[124px] -rotate-3 rounded-[22px] object-cover shadow-[0_12px_26px_rgba(7,32,97,0.25)]" />
          : <span className="flex h-[124px] w-[124px] -rotate-3 items-center justify-center rounded-[22px] bg-[#FFFDF8] text-[44px] font-extrabold text-[#3F6FE8] shadow-[0_12px_26px_rgba(7,32,97,0.25)]">{initials}</span>}
        {onPhoto && <>
          <button type="button" onClick={() => file.current?.click()} disabled={uploading} aria-label="Change photo"
            className="absolute -bottom-1.5 -right-1.5 flex h-[38px] w-[38px] items-center justify-center rounded-full border-[3px] border-[#3F6FE8] bg-white text-[#2F57C9] disabled:opacity-60">
            {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2F57C9] border-t-transparent" />
              : <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
          </button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
        </>}
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-navy/70">{kicker}</span>
        <h1 className="text-[clamp(32px,4vw,46px)] font-extrabold leading-[1.02] tracking-[-0.03em] text-navy">{l1}<br /><span className="text-white">{l2}</span></h1>
        {bio && <p className="max-w-[560px] text-[15px] leading-relaxed text-navy/80">{bio}</p>}
        {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map(c => <span key={c} className="rounded-md bg-white/20 px-2.5 py-1 text-[12.5px] font-bold text-white">{c}</span>)}</div>}
      </div>
      <div className="flex flex-wrap gap-2 self-start sm:col-span-2 lg:col-span-1 lg:flex-col">{actions}</div>
    </section>
  );
}

export const heroPrimary = 'inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-bold text-[#2F57C9] hover:bg-[#EAF0FF]';
export const heroSecondary = 'inline-flex h-10 items-center justify-center rounded-md border border-white/70 px-3.5 text-sm font-semibold text-white hover:bg-white/10';

export function StatTiles({ tiles }: { tiles: { l: string; v: string; d?: string }[] }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
      {tiles.map(t => (
        <div key={t.l} className="rounded-[10px] border border-line bg-white px-4 py-3.5">
          <span className="text-[12.5px] text-muted">{t.l}</span>
          <p className="mt-1 text-2xl font-extrabold text-navy">{t.v}</p>
          {t.d && <span className="text-[12.5px] font-semibold text-azure-strong">{t.d}</span>}
        </div>
      ))}
    </div>
  );
}
