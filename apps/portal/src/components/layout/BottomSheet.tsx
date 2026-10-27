'use client';
import { useEffect } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  height?: 'auto' | 'half' | 'full';
}

export function BottomSheet({ open, onClose, title, children, height = 'auto' }: BottomSheetProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const maxH = height === 'full' ? 'max-h-[92dvh]' : height === 'half' ? 'max-h-[55dvh]' : 'max-h-[85dvh]';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-navy/40 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[70] flex flex-col ${maxH} rounded-t-3xl bg-white shadow-2xl shadow-navy/20 lg:hidden
          animate-[slideUp_0.25s_ease-out]`}
        style={{ animation: open ? 'slideUp 0.25s ease-out' : undefined }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-cloud" />
        </div>

        {/* Title row */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-cloud flex-shrink-0">
            <p className="text-base font-bold text-navy">{title}</p>
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-royal/50 hover:text-navy transition">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
