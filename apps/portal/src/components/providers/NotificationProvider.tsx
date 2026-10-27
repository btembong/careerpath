'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ── Types ── */
type NotifKind = 'success' | 'error' | 'info';
interface Notification {
  id: string; kind: NotifKind; title: string; message?: string; duration: number;
}

/* ── Context ── */
interface NotifCtx { add: (n: Omit<Notification, 'id'>) => void; }
const Ctx = createContext<NotifCtx>({ add: () => {} });

/* ── Accent colours (brand only) ── */
const ACCENT: Record<NotifKind, string> = {
  success: '#5889FA',   // azure
  error:   '#072061',   // navy
  info:    '#405FAD',   // royal
};

/* ── Single toast ── */
function Toast({ n, onRemove }: { n: Notification; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Trigger enter animation
    const raf = requestAnimationFrame(() => setVisible(true));

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(n.id), 300);
    }, n.duration);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timerRef.current);
    };
  }, [n.id, n.duration, onRemove]);

  return (
    <div
      style={{
        transition: 'opacity 280ms ease, transform 280ms ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(24px)',
        willChange: 'opacity, transform',
      }}
      className="flex items-start gap-3 w-80 rounded-xl border border-cloud bg-white px-4 py-3.5 shadow-lg shadow-navy/10">

      {/* Accent dot */}
      <span
        className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: ACCENT[n.kind] }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-navy leading-snug">{n.title}</p>
        {n.message && (
          <p className="text-xs text-royal/60 mt-0.5 leading-snug">{n.message}</p>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(n.id), 300); }}
        className="flex-shrink-0 rounded p-0.5 text-royal/30 hover:text-navy transition mt-0.5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

/* ── Container portal ── */
function NotifPortal({ items, onRemove }: { items: Notification[]; onRemove: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {items.map(n => <Toast key={n.id} n={n} onRemove={onRemove} />)}
    </div>,
    document.body,
  );
}

/* ── Provider ── */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(n => n.id !== id));
  }, []);

  const add = useCallback((n: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev.slice(-4), { ...n, id }]); // max 5 visible
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CtxProv = Ctx.Provider as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NP = NotifPortal as any;
  return (
    <CtxProv value={{ add }}>
      {children}
      <NP items={items} onRemove={remove} />
    </CtxProv>
  );
}

/* ── Hook ── */
export function useNotify() {
  return useContext(Ctx);
}

/* ── Singleton ref for use outside React tree ── */
let _add: NotifCtx['add'] | null = null;

export function NotificationBridge() {
  const { add } = useContext(Ctx);
  useEffect(() => { _add = add; return () => { _add = null; }; }, [add]);
  return null;
}

export const notify = {
  success: (title: string, opts?: { description?: string }) =>
    _add?.({ kind: 'success', title, message: opts?.description, duration: 4000 }),
  error: (title: string, opts?: { description?: string }) =>
    _add?.({ kind: 'error', title, message: opts?.description, duration: 5000 }),
  info: (title: string, opts?: { description?: string }) =>
    _add?.({ kind: 'info', title, message: opts?.description, duration: 4000 }),
};
