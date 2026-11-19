'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { BrandLogo } from '@/components/brand/BrandLogo';

const LINKS: [string, string][] = [['/courses', 'Courses'], ['/teachers', 'Teachers'], ['/#test-centre', 'Test Centre'], ['/#schools', 'For schools'], ['/register?role=teacher', 'Teach']];

/**
 * The landing page's menu: floats over the blue hero, slightly see-through. Once you scroll down it shrinks
 * into a smaller floating bar; scrolling back to the top opens it out again.
 */
export function LandingNav() {
  const [small, setSmall] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSmall(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className={clsx('fixed inset-x-0 top-0 z-50 transition-[padding] duration-300', small ? 'px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]' : 'px-0 pt-[env(safe-area-inset-top,0px)]')}>
      <header className={clsx('mx-auto flex items-center gap-5 backdrop-blur-md transition-all duration-300',
        small
          ? 'h-14 max-w-[940px] rounded-xl bg-[rgba(47,87,201,0.82)] px-4 shadow-[0_10px_30px_rgba(7,32,97,0.28)] sm:px-5'
          : 'h-[72px] max-w-[1240px] rounded-none bg-[rgba(63,111,232,0.72)] px-4 sm:px-8 lg:px-14')}>
        <span className={clsx('origin-left transition-transform duration-300', small && 'scale-[0.86]')}><BrandLogo tone="onBlue" size="lg" href="/" /></span>
        <span className="flex-1" />
        <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
          {LINKS.map(([href, l]) => <Link key={href} href={href} className={clsx('text-[#FFFFFF]/90 hover:text-[#FFFFFF]', small ? 'text-[13.5px]' : 'text-sm')}>{l}</Link>)}
        </nav>
        <Link href="/login" className={clsx('font-bold text-[#FFFFFF] hover:underline', small ? 'text-[13.5px]' : 'text-sm')}>Sign in</Link>
        <Link href="/register" className={clsx('hidden items-center rounded-md bg-[#FFFFFF] font-bold text-[#2F57C9] hover:bg-[#F4F7FF] sm:inline-flex', small ? 'h-9 px-3.5 text-[13.5px]' : 'h-[38px] px-4 text-sm')}>Start free</Link>
        <button type="button" aria-label={open ? 'Close the menu' : 'Open the menu'} aria-expanded={open} onClick={() => setOpen(v => !v)}
          className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-md text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.15)] md:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </header>
      {open && (
        <nav aria-label="Main" className={clsx('mx-auto mt-2 flex flex-col rounded-xl bg-[rgba(255,255,255,0.97)] p-2 shadow-[0_14px_34px_rgba(7,32,97,0.25)] backdrop-blur md:hidden', small ? 'max-w-[940px]' : 'mx-3')}>
          {LINKS.map(([href, l]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-navy hover:bg-subtle">{l}</Link>)}
          <Link href="/register" onClick={() => setOpen(false)} className="mt-1 inline-flex h-11 items-center justify-center rounded-md bg-[#2F57C9] text-[15px] font-bold text-[#FFFFFF]">Start free</Link>
        </nav>
      )}
    </div>
  );
}
