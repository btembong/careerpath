'use client';
/**
 * ConfirmDialog — Radix AlertDialog + Framer Motion.
 * For destructive actions that need "Are you sure?" confirmation.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={showDelete}
 *     onOpenChange={setShowDelete}
 *     title="Delete course?"
 *     description="This action cannot be undone."
 *     confirmLabel="Delete"
 *     variant="danger"
 *     onConfirm={() => handleDelete()}
 *   />
 */
import * as _RadixAlert from '@radix-ui/react-alert-dialog';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixAlert = _RadixAlert as any;
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { clsx } from 'clsx';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <RadixAlert.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixAlert.Portal forceMount>
            <RadixAlert.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm"
              />
            </RadixAlert.Overlay>
            <RadixAlert.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={spring.smooth}
                className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cloud bg-white p-6 shadow-xl"
              >
                <RadixAlert.Title className="text-base font-bold text-navy">{title}</RadixAlert.Title>
                {description && (
                  <RadixAlert.Description className="text-sm text-royal/60 mt-2 leading-relaxed">
                    {description}
                  </RadixAlert.Description>
                )}
                <div className="flex items-center justify-end gap-3 mt-6">
                  <RadixAlert.Cancel
                    className="rounded-xl border border-cloud bg-white px-5 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition">
                    {cancelLabel}
                  </RadixAlert.Cancel>
                  <RadixAlert.Action
                    onClick={onConfirm}
                    disabled={loading}
                    className={clsx(
                      'rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50',
                      variant === 'danger'
                        ? 'bg-red-500 hover:bg-red-600 shadow-sm shadow-red-500/20'
                        : 'bg-azure hover:bg-royal shadow-sm shadow-azure/20',
                    )}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Processing…
                      </span>
                    ) : confirmLabel}
                  </RadixAlert.Action>
                </div>
              </motion.div>
            </RadixAlert.Content>
          </RadixAlert.Portal>
        )}
      </AnimatePresence>
    </RadixAlert.Root>
  );
}
