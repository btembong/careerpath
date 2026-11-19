'use client';
import { openCookieSettings } from '@/components/public/CookieConsent';

export function CookieSettingsButton({ className = 'inline-flex h-10 items-center rounded-md bg-[#2F57C9] px-4 text-[14px] font-bold text-[#FFFFFF] hover:bg-[#2548AE]' }: { className?: string }) {
  return <button type="button" onClick={openCookieSettings} className={className}>Change my cookie choice</button>;
}
