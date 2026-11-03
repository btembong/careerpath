'use client';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Icons } from '@/lib/icons';

/** icon: an icon name (mail, user, lock…) or one of the old letters, which map to icons */
export interface HeroCard { icon: string; title: string; body: string; pill?: string }
export interface Hero {
  /** Two lines; the last word of the second line (or the last `white` words) is picked out in white */
  lines: [string, string];
  white?: number;
  sub: string;
  cards?: HeroCard[];
  /** Anything else for the left side, such as the teacher's profile preview */
  extra?: React.ReactNode;
}

const GLYPH: Record<string, IconName> = { '✉': 'mail', Y: 'user', T: 'teacher', Q: 'question', '₵': 'income', '🔒': 'lock' };
const iconOf = (k: string): IconName | null => (k in Icons ? (k as IconName) : GLYPH[k] ?? null);

function Card({ c, i }: { c: HeroCard; i: number }) {
  const name = iconOf(c.icon);
  return (
    <div className={`relative flex w-[min(430px,90%)] gap-3 rounded-[10px] bg-[#FFFDF8] px-[18px] py-4 shadow-[0_10px_24px_rgba(7,32,97,0.18)] ${i ? 'ml-8 -mt-2 rotate-[1.5deg]' : '-rotate-[2.5deg]'}`}>
      <span className={`flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg font-extrabold ${i ? 'bg-[#E9F1FF] text-[#2F57C9]' : 'bg-[#EAF0FF] text-[#3F6FE8]'}`}>{name ? <Icon name={name} size={20} /> : c.icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-navy"><strong>{c.title}</strong> <span className="text-[11px] text-[#97A2BD]">just now</span></span>
        <span className="text-sm text-ink2">{c.body}</span>
      </span>
      {c.pill && <span className="absolute -bottom-3.5 -right-2.5 rounded-md border border-line bg-white px-2.5 py-1 text-[12.5px] font-bold text-[#3F6FE8]">{c.pill}</span>}
    </div>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return <BrandLogo tone={light ? 'onBlue' : 'light'} size="lg" />;
}

/** Sign in, sign up and password pages: one colour and one line on the left, almost nothing on the right. */
export function AuthShell({ hero, children, back = { href: '/', label: 'Back to home' }, wide }: { hero: Hero; children: React.ReactNode; back?: { href: string; label: string } | null; wide?: boolean }) {
  const words = hero.lines[1].split(' ');
  const last = words.splice(Math.max(0, words.length - (hero.white ?? 1))).join(' ');
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[57%] flex-col overflow-hidden bg-[#3F6FE8] px-[72px] py-11 lg:flex">
        <Logo light />
        <div className="flex flex-1 flex-col justify-center gap-[22px] pl-6">
          <h1 className="text-[clamp(52px,5.3vw,76px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-navy">
            {hero.lines[0]}<br />{words.join(' ')} <span className="text-white">{last}</span>
          </h1>
          <p className="max-w-[420px] text-[17px] leading-relaxed text-navy/80">{hero.sub}</p>
          {hero.cards && <div className="mt-3.5 flex flex-col">{hero.cards.map((c, i) => <Card key={c.title + i} c={c} i={i} />)}</div>}
          {hero.extra}
        </div>
      </div>
      <div className="flex flex-1 flex-col bg-[#F8F9FC] px-6 py-6 sm:px-10 lg:px-16 lg:py-9">
        <div className="flex items-center justify-between">
          {back ? <Link href={back.href} className="text-[13px] text-muted hover:text-navy">‹ {back.label}</Link> : <span />}
          <span className="lg:hidden"><Logo /></span>
        </div>
        <div className={`mx-auto flex w-full flex-1 flex-col justify-center gap-3.5 py-8 ${wide ? 'max-w-[480px]' : 'max-w-[400px]'}`}>{children}</div>
      </div>
    </div>
  );
}

export const authInput = 'h-[50px] w-full rounded-lg border border-line bg-white px-3.5 text-[15px] text-navy outline-none transition placeholder:text-[#97A2BD] focus:border-[#5889FA] focus:ring-4 focus:ring-[#5889FA]/10';
export const authButton = 'flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#3F6FE8] px-[18px] text-[15px] font-semibold text-white transition hover:bg-[#2F57C9] disabled:opacity-60';

export function AuthTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 text-[clamp(30px,3vw,40px)] font-extrabold leading-tight tracking-[-0.03em] text-navy">{children}</h2>;
}

export function Divider({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 text-xs text-[#97A2BD]"><span className="h-px flex-1 bg-line" />{children}<span className="h-px flex-1 bg-line" /></div>;
}

export function AuthError({ error }: { error: string }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg border border-[#EFC4C0] bg-[#FDF1F0] px-3.5 py-2.5 text-[13.5px] text-[#C1352B]">{error}</p>;
}

export function AuthSwitch({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <>
      <span className="my-1.5 h-px bg-line" />
      <p className="text-center text-sm text-ink2">{text} <Link href={href} className="font-bold text-[#3F6FE8]">{link}</Link></p>
    </>
  );
}

/** Six boxes for an emailed code; paste fills them all */
export function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex justify-between gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} aria-label={`Digit ${i + 1}`} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} autoFocus={i === 0}
          value={value[i] ?? ''}
          onPaste={e => { e.preventDefault(); onChange(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)); }}
          onKeyDown={e => { if (e.key === 'Backspace' && !value[i] && i > 0) { onChange(value.slice(0, i - 1)); (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus(); } }}
          onChange={e => {
            const d = e.target.value.replace(/\D/g, '');
            if (!d) { onChange(value.slice(0, i) + value.slice(i + 1)); return; }
            const next = (value.slice(0, i) + d + value.slice(i + d.length)).slice(0, 6);
            onChange(next);
            const target = e.target.parentElement?.children[Math.min(i + d.length, 5)] as HTMLInputElement | undefined;
            target?.focus();
          }}
          className={`h-[60px] w-full min-w-0 rounded-lg border bg-white text-center text-[26px] font-extrabold text-navy outline-none focus:border-[#5889FA] focus:ring-4 focus:ring-[#5889FA]/10 ${value[i] ? 'border-[#5889FA]' : 'border-line'}`} />
      ))}
    </div>
  );
}
