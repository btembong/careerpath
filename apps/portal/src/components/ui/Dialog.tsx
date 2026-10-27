'use client';
/**
 * Dialog — Radix UI Dialog + Framer Motion + brand tokens.
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent title="Edit profile">
 *       <p>Content here</p>
 *       <DialogFooter>
 *         <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
 *         <Button>Save</Button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
import * as _RadixDialog from '@radix-ui/react-dialog';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixDialog = _RadixDialog as any;
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@/lib/motion';
import { clsx } from 'clsx';
import { Icon } from './Icon';

/* Root */
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && children}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

/* Content */
interface DialogContentProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function DialogContent({ title, description, children, className, size = 'md' }: DialogContentProps) {
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
  return (
    <RadixDialog.Portal forceMount>
      <RadixDialog.Overlay asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm"
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={spring.smooth}
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-cloud bg-white shadow-xl',
            sizes[size],
            className,
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-cloud px-6 py-4">
            <div>
              <RadixDialog.Title className="text-base font-bold text-navy">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-xs text-royal/50 mt-0.5">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="rounded-lg p-1.5 text-royal/40 hover:bg-cloud hover:text-navy transition">
              <Icon name="close" size={16} />
            </RadixDialog.Close>
          </div>
          {/* Body */}
          <div className="px-6 py-4">
            {children}
          </div>
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/* Footer helper */
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-end gap-3 border-t border-cloud pt-4 mt-4 -mx-6 px-6 -mb-4 pb-4', className)}>
      {children}
    </div>
  );
}
