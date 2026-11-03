import Link from 'next/link';
import { clsx } from 'clsx';

type Tone = 'light' | 'onBlue' | 'onDark';

const TILE: Record<Tone, string> = {
  light: 'bg-[#3F6FE8] text-white',
  onBlue: 'bg-white text-[#3F6FE8]',
  onDark: 'bg-[#3F6FE8] text-white',
};
const WORD: Record<Tone, string> = { light: 'text-navy', onBlue: 'text-navy', onDark: 'text-white' };
const DOT: Record<Tone, string> = { light: 'text-[#3F6FE8]', onBlue: 'text-white', onDark: 'text-[#8FB0FF]' };

/** The "careerpath." logo: a C tile and the word with a dot. One look everywhere. */
export function BrandLogo({ tone = 'light', size = 'md', wordOnly, hideWord, href = '/', className }: {
  tone?: Tone; size?: 'sm' | 'md' | 'lg'; wordOnly?: boolean; hideWord?: boolean; href?: string | null; className?: string;
}) {
  const tile = size === 'sm' ? 'h-[26px] w-[26px] rounded-md text-[13px]' : size === 'lg' ? 'h-[34px] w-[34px] rounded-lg text-[17px]' : 'h-[30px] w-[30px] rounded-[7px] text-[15px]';
  const word = size === 'sm' ? 'text-[15px]' : size === 'lg' ? 'text-[22px]' : 'text-[18px]';
  const inner = (
    <>
      {!wordOnly && <span className={clsx('brand-tile flex flex-shrink-0 items-center justify-center font-black', tile, TILE[tone])}>C</span>}
      {!hideWord && <strong className={clsx('brand-word font-extrabold tracking-[-0.02em]', word, WORD[tone])}>careerpath<span className={DOT[tone]}>.</span></strong>}
    </>
  );
  const cls = clsx('flex items-center gap-2.5', className);
  return href ? <Link href={href} className={cls} aria-label="CareerPath Africa home">{inner}</Link> : <span className={cls} aria-label="CareerPath Africa">{inner}</span>;
}
