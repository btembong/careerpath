'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { Icon } from '@/components/ui/Icon';
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

// ── Installing the portal as an app ──────────────────────────────────────────
const INSTALL_KEY = 'cpa:install-prompt';
const SHOWN_KEY = 'cpa:invite-shown'; // one card per visit: install first, notifications on a later visit

// Chrome, Edge and Android offer installing in an event that fires once, often before this code has loaded:
// a script at the top of every page (app/layout.tsx) keeps it on window.__cpaInstall and says "cpa-install"
const installListeners = new Set<() => void>();
const installChanged = () => installListeners.forEach(f => f());
const offer = (): any => (typeof window !== 'undefined' ? (window as any).__cpaInstall ?? null : null);
if (typeof window !== 'undefined') window.addEventListener('cpa-install', installChanged);

/** Can this device install the portal: a real Install button (Chrome, Edge, Android) or the iPhone steps */
export function useInstall() {
  const [, tick] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = () => tick(x => x + 1);
    installListeners.add(f); setReady(true);
    return () => { installListeners.delete(f); };
  }, []);
  const isInstalled = ready && installed();
  const canInstall = ready && !isInstalled && !!offer();
  const ios = ready && !isInstalled && isIOS();
  const install = useCallback(async () => {
    const e = offer();
    if (!e) return false;
    e.prompt();
    const choice = await e.userChoice.catch(() => null);
    (window as any).__cpaInstall = null; installChanged();
    return choice?.outcome === 'accepted';
  }, []);
  return { ready, installed: isInstalled, canInstall, ios, available: canInstall || ios, install };
}

/** Opens the iPhone "add to home screen" steps from anywhere (the menu, the strip) */
export const showIosSteps = () => window.dispatchEvent(new Event('cpa-ios-steps'));

const due = (key: string) => { try { return Date.now() - Number(localStorage.getItem(key) ?? 0) > PROMPT_AGAIN_DAYS * 86_400_000; } catch { return false; } };
const putOff = (key: string) => { try { localStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ } };
// Never over a lesson, a test, a live class, mentoring or a call, nor the welcome tour
const BUSY = [/\/learn\/[^/]+\/lesson\//, /\/tests\/(?!new|history|papers|mocks|cat$)[^/]+$/, /\/tests\/cat\/[^/]+/, /\/live\/[^/]+$/, /\/mentorship\/(session|board)\//, /\/quiz\/[^/]+/];
const busy = () => BUSY.some(r => r.test(location.pathname)) || !!document.querySelector('[aria-labelledby="tour-title"], [aria-label="Hang up"], [aria-label^="Incoming call"]');

// Floats just above the phone's tab bar; bottom-right on a computer
const CARD = 'fixed left-2.5 right-2.5 z-[55] rounded-[18px] border border-line bg-white p-3.5 shadow-[0_16px_40px_rgba(7,32,97,0.28)] bottom-[calc(16px+env(safe-area-inset-bottom))] [html[data-tabbar=shown]_&]:bottom-[calc(90px+env(safe-area-inset-bottom))] lg:left-auto lg:right-6 lg:w-[400px] lg:bottom-6 [html[data-tabbar=shown]_&]:lg:bottom-6';
const APP_ICON = <img src="/icons/icon-192.png" alt="" width={46} height={46} className="h-[46px] w-[46px] shrink-0 rounded-xl" />;

function CardButtons({ no, yes, onNo, onYes }: { no: string; yes: string; onNo: () => void; onYes: () => void }) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button onClick={onNo} className="h-9 rounded-[10px] px-3 text-[13px] font-bold text-muted hover:text-navy">{no}</button>
      <button onClick={onYes} className="h-9 rounded-[10px] bg-[#3F6FE8] px-4 text-[13px] font-extrabold text-[#FFFFFF] hover:brightness-95">{yes}</button>
    </div>
  );
}

/** iPhone: Safari has no install button, so the three steps, pointing at its Share button */
function IosSteps({ onClose }: { onClose: () => void }) {
  const ipad = /iPad/.test(navigator.userAgent);
  const step = (n: number, text: React.ReactNode, icon: React.ReactNode) => (
    <li className="flex items-center gap-3 border-b border-line py-2.5">
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-extrabold text-azure-strong">{n}</span>
      <span className="flex-1 text-[13.5px] leading-snug text-navy">{text}</span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle">{icon}</span>
    </li>
  );
  return (
    <>
      <div className="fixed inset-0 z-[62] bg-[rgba(7,21,48,0.28)]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Add CareerPath to your home screen" className="fixed inset-x-0 bottom-0 z-[63] mx-auto max-w-[480px] rounded-t-[22px] bg-white px-[18px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-2.5">
        <div aria-hidden className="mx-auto mb-3 h-[5px] w-[38px] rounded-full bg-line" />
        <div className="flex items-center gap-3">
          {APP_ICON}
          <div><p className="text-[15px] font-bold text-navy">Add CareerPath to your home screen</p><p className="text-[12.5px] text-muted">iPhone needs this before it can send you notifications</p></div>
        </div>
        <ol className="mt-2">
          {step(1, <>Tap <strong>Share</strong> {ipad ? 'at the top' : 'at the bottom'} of Safari</>, <Icon name="shareIos" size={18} line className="text-[#0A84FF]" />)}
          {step(2, <>Scroll down, tap <strong>Add to Home Screen</strong></>, <Icon name="addSquare" size={18} line className="text-navy" />)}
          {step(3, <>Open <strong>CareerPath</strong> from your home screen and turn on notifications</>, <img src="/icons/icon-192.png" alt="" width={22} height={22} className="rounded-md" />)}
        </ol>
        <button onClick={onClose} className="mt-3 h-11 w-full rounded-[11px] bg-[#3F6FE8] text-[14px] font-extrabold text-[#FFFFFF]">Got it</button>
        {!ipad && <span aria-hidden className="mt-1 block animate-bounce text-center text-[20px] leading-none text-azure-strong">↓</span>}
      </div>
    </>
  );
}

/**
 * The two invitations, one at a time: install the app (where the device allows it), then, on a later visit,
 * notifications. "Not now" puts either off for a fortnight; once installed or switched on they don't come back.
 * Also keeps an existing permission subscribed, e.g. after signing in on a new account.
 */
export function PushPrompt() {
  const push = usePush();
  const inst = useInstall();
  const [card, setCard] = useState<null | 'install' | 'push'>(null);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const open = () => setSteps(true);
    window.addEventListener('cpa-ios-steps', open);
    return () => window.removeEventListener('cpa-ios-steps', open);
  }, []);

  useEffect(() => {
    // Installing doesn't wait for the notifications check: on a browser's first visit that waits for the
    // service worker to finish setting up, which can take a while
    if (!inst.ready) return;
    // Allowed before but not subscribed (new sign-in on this device): subscribe quietly
    if (push.ready && push.supported && push.permission === 'granted' && !push.subscribed) { push.enable(); return; }
    let shownThisVisit = false;
    try { shownThisVisit = sessionStorage.getItem(SHOWN_KEY) === '1'; } catch { /* storage blocked */ }
    const want = inst.available && due(INSTALL_KEY) ? 'install'
      : push.ready && !shownThisVisit && push.supported && !push.needsInstall && push.permission === 'default' && due(PROMPT_KEY) ? 'push' : null;
    if (!want) { setCard(null); return; }
    let t: ReturnType<typeof setTimeout>;
    const tryShow = () => {
      if (busy()) { t = setTimeout(tryShow, 5000); return; }
      try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch { /* storage blocked */ }
      setCard(want);
    };
    t = setTimeout(tryShow, 6000); // not the moment the page opens
    return () => clearTimeout(t);
  }, [push.ready, push.supported, push.permission, push.subscribed, inst.ready, inst.available]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeSteps = () => { setSteps(false); putOff(INSTALL_KEY); };
  return (
    <>
      {steps && <IosSteps onClose={closeSteps} />}
      {card === 'install' && !steps && (
        <div role="dialog" aria-label="Install CareerPath Africa" className={CARD}>
          <div className="flex gap-3">
            {APP_ICON}
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-navy">{inst.ios ? 'Add CareerPath to your home screen' : 'Install CareerPath Africa'}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">Open it from your home screen like any app: full screen, quicker to start, and calls and messages reach you when it’s closed.</p>
            </div>
          </div>
          <CardButtons no="Not now" yes={inst.ios ? 'Show me how' : 'Install'}
            onNo={() => { putOff(INSTALL_KEY); setCard(null); }}
            onYes={async () => { setCard(null); if (inst.ios) { setSteps(true); return; } putOff(INSTALL_KEY); if (await inst.install()) notify.success('CareerPath is on your home screen'); }} />
        </div>
      )}
      {card === 'push' && (
        <div role="dialog" aria-label="Turn on notifications" className={CARD}>
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-azure-strong"><Icon name="bell" size={22} line /></span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-navy">Get calls and messages when the portal is closed</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">Calls ring on this {deviceWord()}, and grades, class reminders and messages arrive even when CareerPath isn’t open.</p>
            </div>
          </div>
          <CardButtons no="Not now" yes="Turn on"
            onNo={() => { putOff(PROMPT_KEY); setCard(null); }}
            onYes={async () => { setCard(null); putOff(PROMPT_KEY); if (await push.enable()) notify.success('Notifications are on for this ' + deviceWord()); }} />
        </div>
      )}
    </>
  );
}

const deviceWord = () => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'phone' : 'computer');

/** The Notifications page: a strip while this device doesn't get them, with the way to turn them on */
export function PushStrip() {
  const push = usePush();
  if (!push.ready || (push.supported && push.subscribed && !push.needsInstall) || (!push.supported && !push.needsInstall)) return null;
  const blocked = !push.needsInstall && push.supported && push.permission === 'denied';
  const where = deviceWord();
  return (
    <div className="cpa-strip-warn flex items-center gap-2.5 rounded-[13px] border px-3 py-2.5">
      <Icon name="bellOff" size={20} line className="shrink-0 cpa-strip-icon" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        {push.needsInstall
          ? <><strong>Off on this iPhone.</strong> Add CareerPath to your home screen first, then turn them on.</>
          : blocked
            ? <><strong>Blocked on this {where}.</strong> Allow notifications for this site in your browser’s settings (the lock next to the address), then come back.</>
            : <><strong>Off on this {where}.</strong> You only see these when the portal is open.</>}
      </p>
      {push.needsInstall
        ? <button onClick={showIosSteps} className="h-8 shrink-0 whitespace-nowrap rounded-[9px] bg-[#3F6FE8] px-3 text-[12.5px] font-extrabold text-[#FFFFFF]">Show me how</button>
        : !blocked && <button onClick={async () => { if (await push.enable()) notify.success('Notifications are on for this ' + where); }} className="h-8 shrink-0 whitespace-nowrap rounded-[9px] bg-[#3F6FE8] px-3 text-[12.5px] font-extrabold text-[#FFFFFF]">Turn on</button>}
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
