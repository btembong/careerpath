'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

const PROMPT_KEY = 'cpa:push-prompt';
const PROMPT_AGAIN_DAYS = 14;

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const installed = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${br} on ${os}`;
}

/** This device's push notifications: can it, is it on, turn it on or off */
export function usePush() {
  const [state, setState] = useState<{ supported: boolean; permission: NotificationPermission | 'unsupported'; subscribed: boolean; needsInstall: boolean; ready: boolean }>({ supported: false, permission: 'unsupported', subscribed: false, needsInstall: false, ready: false });

  const refresh = useCallback(async () => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // iPhones only get web notifications once the portal is added to the home screen
    const needsInstall = isIOS() && !installed();
    if (!supported) { setState({ supported: false, permission: 'unsupported', subscribed: false, needsInstall, ready: true }); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setState({ supported: true, permission: Notification.permission, subscribed: !!sub, needsInstall, ready: true });
  }, []);
  useEffect(() => { refresh().catch(() => setState(s => ({ ...s, ready: true }))); }, [refresh]);

  const enable = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { await refresh(); notify.info('Notifications are blocked for this site. You can allow them in your browser’s site settings.'); return false; }
      const { data } = await api.get<{ key: string | null }>('/notifications/push/key');
      if (!data.key) { notify.error('Notifications aren’t set up on the server yet'); return false; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.key) });
      await api.post('/notifications/push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
      await refresh();
      return true;
    } catch (e: any) {
      notify.error(e?.response?.data?.message ?? 'Could not turn on notifications on this device');
      return false;
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      await refresh();
    } catch { notify.error('Could not turn notifications off'); }
  }, [refresh]);

  const test = useCallback(() => api.post('/notifications/push/test').then(() => notify.success('Sent. It shows when the portal isn’t open, or straight away on most computers.')).catch(() => notify.error('Could not send a test')), []);

  return { ...state, enable, disable, test, refresh };
}

/**
 * Asks once (and again a fortnight after "Not now") whether this device should get calls, messages and notices
 * when the portal is closed. Also keeps an existing permission subscribed, e.g. after signing in on a new account.
 */
export function PushPrompt() {
  const push = usePush();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!push.ready) return;
    // Allowed before but not subscribed (new sign-in on this device): subscribe quietly
    if (push.supported && push.permission === 'granted' && !push.subscribed) { push.enable(); return; }
    let last = 0;
    try { last = Number(localStorage.getItem(PROMPT_KEY) ?? 0); } catch { /* storage blocked */ }
    const due = Date.now() - last > PROMPT_AGAIN_DAYS * 86_400_000;
    const ask = (push.supported && push.permission === 'default') || (push.needsInstall && !push.supported);
    if (!due || !ask) return;
    const t = setTimeout(() => setShow(true), 6000); // not the moment the page opens
    return () => clearTimeout(t);
  }, [push.ready, push.supported, push.permission, push.subscribed, push.needsInstall]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = () => { try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch { /* storage blocked */ } setShow(false); };
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Turn on notifications" className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-[55] flex w-[min(94vw,440px)] -translate-x-1/2 flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-2xl lg:left-auto lg:right-6 lg:translate-x-0">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-azure-strong">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-navy">Get calls and messages when the portal is closed</p>
          <p className="mt-0.5 text-[13px] text-ink2">{push.needsInstall && !push.supported
            ? 'On iPhone, first add the portal to your home screen: tap Share, then “Add to Home Screen”. Open it from there and you can turn notifications on.'
            : 'Calls ring on this device, and grades, class reminders, messages and other notices arrive even when the portal isn’t open. You choose which ones in Settings.'}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={later} className="h-9 rounded-md px-3 text-[13px] font-semibold text-ink2 hover:text-navy">Not now</button>
        {!(push.needsInstall && !push.supported) && <button onClick={async () => { const ok = await push.enable(); later(); if (ok) notify.success('Notifications are on for this device'); }} className="h-9 rounded-md bg-azure-strong px-4 text-[13px] font-bold text-on-accent">Turn on</button>}
      </div>
    </div>
  );
}

/** Settings → Notifications: this device on or off, and a test */
export function PushSettings() {
  const push = usePush();
  if (!push.ready) return <div className="h-16 rounded-md bg-subtle animate-pulse" />;
  const blocked = push.permission === 'denied';
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-navy">Notifications on this device</p>
          <p className="text-xs text-muted">{!push.supported
            ? (push.needsInstall ? 'On iPhone, add the portal to your home screen (Share → Add to Home Screen), open it from there, then turn this on.' : 'This browser can’t show notifications from websites.')
            : blocked ? 'Blocked for this site. Allow notifications in your browser’s site settings (the lock next to the web address), then come back.'
            : 'Calls ring here, and the notices you’ve switched on above arrive even when the portal is closed.'}</p>
        </div>
        {push.supported && !blocked && (push.subscribed
          ? <><button onClick={push.test} className="h-8 rounded-md border border-line px-3 text-[12.5px] font-semibold text-navy hover:bg-subtle">Send a test</button><button onClick={push.disable} className="h-8 rounded-md border border-line px-3 text-[12.5px] font-semibold text-ink2 hover:bg-subtle">Turn off</button></>
          : <button onClick={async () => { if (await push.enable()) notify.success('Notifications are on for this device'); }} className="h-8 rounded-md bg-azure-strong px-3 text-[12.5px] font-bold text-on-accent">Turn on</button>)}
      </div>
    </div>
  );
}
