'use client';
import { useState } from 'react';
import { clsx } from 'clsx';

/**
 * A country's flag from /public/flags (country-flag-icons, MIT, 3:2).
 * Emoji flags show as two letters on Windows, so we use images. Unknown codes fall back to the letters.
 */
export function Flag({ code, className, title }: { code?: string | null; className?: string; title?: string }) {
  const [broken, setBroken] = useState(false);
  const c = code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
  if (!c) return null;
  const box = clsx('inline-block flex-shrink-0 overflow-hidden rounded-[3px] align-[-2px] shadow-[0_0_0_1px_rgba(7,32,97,0.12)]', className ?? 'h-3 w-[18px]');
  if (broken) return <span title={title} className={clsx(box, 'bg-subtle text-center text-[9px] font-extrabold leading-3 text-ink2')}>{c}</span>;
  return <img src={`/flags/${c}.svg`} alt={title ?? ''} title={title} loading="lazy" onError={() => setBroken(true)} className={clsx(box, 'object-cover')} />;
}
