'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const NAME = 'cpa_consent';
export type Consent = 'essential' | 'all';

/** The visitor's choice, or null before they've made one */
export function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  const v = document.cookie.split('; ').find(c => c.startsWith(`${NAME}=`))?.split('=')[1];
  return v === 'essential' || v === 'all' ? v : null;
}
/** "Cookie settings" links call this to show the notice again */
export function openCookieSettings() { window.dispatchEvent(new Event('cpa:cookie-settings')); }

/**
 * Asks once, on every page, until the visitor chooses. Today the site only uses the sign-in cookie and a few
 * choices saved on the device, which it needs to work; "Accept all" also allows analytics if they're added later.
 * The choice is kept for a year in the cpa_consent cookie, so the server can read it too.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const again = () => setOpen(true);
    window.addEventListener('cpa:cookie-settings', again);
    return () => window.removeEventListener('cpa:cookie-settings', again);
  }, []);
  function choose(c: Consent) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${NAME}=${c}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
    window.dispatchEvent(new CustomEvent('cpa:consent', { detail: c }));
    setOpen(false);
  }
  if (!open) return null;
  const current = readConsent();

  return (
    <div role="dialog" aria-label="Cookies" aria-live="polite"
      className="keep-light fixed bottom-3 left-1/2 z-[60] w-[calc(100%-20px)] max-w-[900px] -translate-x-1/2 animate-[cpa-pop_.35s_ease-out] rounded-[14px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,20,52,0.92)] p-4 text-[14px] leading-relaxed text-[#D6DEF7] shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-md sm:bottom-[22px] sm:flex sm:w-auto sm:items-center sm:gap-4 sm:py-3 sm:pl-5 sm:pr-3"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <p className="sm:max-w-[560px]">
        <b className="mb-1 block text-[#FFFFFF] sm:hidden">Cookies</b>
        We use one cookie to keep you signed in, and remember a few choices on your device. No ads.{' '}
        <Link href="/legal/cookies" className="whitespace-nowrap text-[#FFFFFF] underline underline-offset-[3px]">Cookie policy</Link>
        {current && <span className="mt-1 block text-[12.5px] text-[#9AA8D2]">You chose {current === 'all' ? '“Accept all”' : '“Essential only”'}.</span>}
      </p>
      <div className="mt-3 flex gap-2 sm:mt-0 sm:flex-shrink-0">
        <button type="button" onClick={() => choose('essential')} className="h-[42px] flex-1 whitespace-nowrap rounded-lg bg-[rgba(255,255,255,0.1)] px-3.5 font-bold text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.18)] sm:h-9 sm:flex-none">Essential only</button>
        <button type="button" onClick={() => choose('all')} className="h-[42px] flex-1 whitespace-nowrap rounded-lg bg-[#3F6FE8] px-3.5 font-extrabold text-[#FFFFFF] hover:bg-[#2F57C9] sm:h-9 sm:flex-none">Accept all</button>
      </div>
    </div>
  );
}
