'use client';
import { useEffect } from 'react';
import Cookies from 'js-cookie';

const sent = new Set<string>();

/** Tells Admin → Errors when something breaks in the browser. The same error is sent once per page load. */
export function reportError(message: string, stack?: string) {
  try {
    const key = message.slice(0, 200);
    if (!message || sent.has(key) || sent.size > 20) return;
    sent.add(key);
    const token = Cookies.get('cpa_token');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/errors`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, stack: stack?.slice(0, 4000), where: `Portal · ${window.location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '[id]')}` }),
    }).catch(() => {});
  } catch { /* never fail while reporting a failure */ }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Browser noise that isn't a real problem
      if (/ResizeObserver loop|Script error\.?$/i.test(e.message ?? '')) return;
      reportError(e.message || 'Script error', e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string; isAxiosError?: boolean } | undefined;
      // Failed API calls are recorded by the API itself
      if (r?.isAxiosError) return;
      reportError(r?.message ?? String(e.reason ?? 'Unhandled promise rejection'), r?.stack);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
