'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Icon } from '@/components/ui/Icon';

const POLL_MS = 5000;
/** Stop watching after this long; the webhook still grants access if they pay later */
const GIVE_UP_MS = 20 * 60 * 1000;
/** How long "Payment received" waits for the confirmation before saying so */
const CONFIRM_MS = 2 * 60 * 1000;

declare global { interface Window { __cpaPayWindow?: boolean } }

type Phase = 'pay' | 'confirming' | 'outside' | 'late';

/**
 * Tranzak's payment page in a window over the checkout, so the student never leaves CareerPath.
 * We ask our server every few seconds whether the payment is confirmed. When Tranzak sends the
 * student back, our page inside the window tells this one (see the root layout) instead of showing.
 */
export function PayWindow({ url, sessionId, amount, title, successHref, onClose }: {
  url: string; sessionId: string; amount: string; title: string; successHref: string;
  /** Closed without a confirmed payment: by the student, or Tranzak's Cancel */
  onClose: (why: 'closed' | 'cancelled') => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pay');
  const done = useRef(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function paid() {
    try { const { data } = await api.get('/payments/verify-purchase', { params: { sessionId } }); return !!data.completed; }
    catch { return false; }
  }
  function finish() { if (done.current) return; done.current = true; router.push(successHref); }
  async function close(why: 'closed' | 'cancelled') {
    if (done.current) return;
    // One last look, so someone who paid just before closing still gets in
    if (await paid()) return finish();
    done.current = true; onClose(why);
  }
  function confirming() {
    setPhase('confirming');
    if (!confirmTimer.current) confirmTimer.current = setTimeout(() => setPhase(p => (p === 'confirming' ? 'late' : p)), CONFIRM_MS);
  }

  useEffect(() => {
    window.__cpaPayWindow = true;
    const started = Date.now();
    const poll = setInterval(async () => {
      if (done.current) return;
      if (await paid()) finish();
      else if (Date.now() - started > GIVE_UP_MS) clearInterval(poll);
    }, POLL_MS);
    // Tranzak sent the student back to one of our pages inside the window
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'cpa-pay-return') return;
      const href = String(e.data.href ?? '');
      if (/\/success\b|[?&]added=1/.test(href)) { confirming(); paid().then(ok => ok && finish()); }
      else close('cancelled');
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close('closed'); };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      delete window.__cpaPayWindow;
      clearInterval(poll);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(7,15,40,0.55)] sm:p-4" role="dialog" aria-modal="true" aria-label={`Pay ${amount}`}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:h-[min(720px,calc(100dvh-2rem))] sm:max-w-[480px] sm:rounded-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-accent-soft text-azure-strong"><Icon name="lock" size={16} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14.5px] text-navy">Pay {amount}</b>
            <span className="block truncate text-xs text-muted">Secure payment by Tranzak · {title}</span>
          </span>
          <button type="button" onClick={() => close('closed')} aria-label="Close" className="rounded p-1.5 text-muted hover:bg-subtle hover:text-navy"><Icon name="close" size={18} /></button>
        </div>

        {phase === 'pay' ? (
          <iframe src={url} title="Tranzak payment" allow="payment" className="min-h-0 w-full flex-1 border-0 bg-[#F3F3F3]" />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-md bg-accent-soft text-azure-strong"><Icon name={phase === 'outside' ? 'externalLink' : phase === 'late' ? 'clock' : 'check'} size={26} /></span>
            {phase === 'confirming' && <>
              <p className="text-xl font-extrabold text-navy">Payment received</p>
              <p className="max-w-[34ch] text-sm text-ink2">Confirming with Tranzak and opening your {successHref.includes('/packages') ? 'package' : 'course'}…</p>
            </>}
            {phase === 'late' && <>
              <p className="text-xl font-extrabold text-navy">Still waiting for Tranzak</p>
              <p className="max-w-[36ch] text-sm text-ink2">Their confirmation hasn’t reached us yet. You’ll get access and an email as soon as it does. If it doesn’t come within an hour, contact support.</p>
              <button type="button" onClick={() => close('closed')} className="mt-2 h-9 rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Close</button>
            </>}
            {phase === 'outside' && <>
              <p className="text-xl font-extrabold text-navy">Finish paying in the new tab</p>
              <p className="max-w-[36ch] text-sm text-ink2">Tranzak’s page opened in another tab. This page moves on by itself once your payment is confirmed.</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Open it again</a>
                <button type="button" onClick={() => setPhase('pay')} className="h-9 rounded-md px-3.5 text-[13.5px] font-semibold text-muted hover:text-navy">Pay here instead</button>
              </div>
            </>}
          </div>
        )}

        {phase !== 'late' && (
          <div className="flex items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-[12.5px] text-ink2" aria-live="polite">
            <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-azure-strong" />
            <span className="min-w-0 flex-1">{phase === 'confirming' ? 'This takes a few seconds' : 'Waiting for your payment…'}</span>
            {phase === 'pay' && <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setPhase('outside')} className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-azure-strong hover:underline">Open in a new tab <Icon name="externalLink" size={13} /></a>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )}</>;
}
