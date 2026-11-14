'use client';
import Link from 'next/link';
import { useAppStatus } from '@/components/settings/AuthenticatorApp';

/**
 * Admin pages: a reminder until the admin sets up an authenticator app, and once their date has passed,
 * a screen in place of the page (the API refuses admin requests then too). Settings stays open.
 */
export function AdminAppGate({ children }: { children: React.ReactNode }) {
  const [s] = useAppStatus();
  if (!s || !s.required || s.enabled) return <>{children}</>;
  const due = s.dueAt ? new Date(s.dueAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  if (s.overdue) return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="flex max-w-[480px] flex-col gap-3 rounded-lg border border-line bg-white p-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#3F6FE8]">One step first</p>
        <h1 className="text-[24px] font-extrabold leading-tight text-navy">Set up your authenticator app to use admin pages.</h1>
        <p className="text-sm leading-relaxed text-ink2">Admin accounts can move money and see everyone’s details, so signing in now needs a code from an app on your phone: Google Authenticator, Microsoft Authenticator or Authy. It takes about two minutes.</p>
        <Link href="/settings#security" className="inline-flex h-10 w-fit items-center rounded-md bg-azure-strong px-4 text-sm font-bold text-on-accent">Set it up now</Link>
        <p className="text-xs text-muted">Lost access to your phone? Ask another admin to reset your app.</p>
      </div>
    </div>
  );
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b border-[#F1D9A6] bg-[#FFF8E8] px-4 py-2.5 text-[13.5px] text-navy lg:px-7">
      <span className="min-w-0 flex-1"><strong>Set up an authenticator app by {due}.</strong> After that, admin pages ask for a code from your phone when you sign in.</span>
      <Link href="/settings#security" className="font-bold text-azure-strong hover:underline">Set it up</Link>
    </div>
    {children}
  </>;
}
