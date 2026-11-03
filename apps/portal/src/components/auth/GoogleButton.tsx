'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

declare global {
  interface Window { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } } }
}

/**
 * Google's own sign-in button. Shown only when Google sign-in is set up on the API (GOOGLE_CLIENT_ID);
 * the API checks Google's token before trusting anything about the person.
 */
export function GoogleButton({ onCredential, onReady }: { onCredential: (credential: string) => void; onReady?: (on: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/auth/google/config').then(r => { setClientId(r.data?.clientId ?? null); onReady?.(!!r.data?.clientId); }).catch(() => onReady?.(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    const draw = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential) });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', width: box.current.offsetWidth || 400, text: 'continue_with', shape: 'rectangular' });
    };
    if (window.google) { draw(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = draw;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null;
  return <div ref={box} className="flex h-[50px] w-full justify-center" />;
}
