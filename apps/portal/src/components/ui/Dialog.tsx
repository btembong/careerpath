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
          className="fixed inset-0 z-50 bg-navy/30"
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
            'rounded-lg border border-line bg-white shadow-card-lg',
            sizes[size],
            className,
          )}
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-line px-6 py-4">
            <RadixDialog.Close aria-label="Close" className="-ml-1.5 mt-0.5 rounded-md p-1.5 text-ink2 hover:bg-subtle hover:text-navy transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </RadixDialog.Close>
            <div className="min-w-0">
              <RadixDialog.Title className="text-[17px] font-bold text-navy">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-[13px] text-muted mt-0.5">{description}</RadixDialog.Description>
              )}
            </div>
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
    <div className={clsx('flex items-center justify-end gap-2 border-t border-line pt-4 mt-4 -mx-6 px-6 -mb-4 pb-4', className)}>
      {children}
    </div>
  );
}

/* ─── Drawer ──────────────────────────────────────────────────────────────────
 * A right-hand panel for previews and quick edits, so the list behind stays in view.
 *
 *   <Drawer open={open} onOpenChange={setOpen}>
 *     <DrawerContent title="Submission" action={<Button size="sm" variant="secondary">Open full page</Button>}>
 *       <InfoGrid items={[{ label: 'Student', value: 'Efua Boateng' }, …]} />
 *       <DrawerSection title="Notes" count={4} action={…}>…</DrawerSection>
 *     </DrawerContent>
 *   </Drawer>
 */
export const Drawer = Dialog;

interface DrawerContentProps {
  title: string;
  description?: string;
  /** Header button on the right, e.g. "View full details" */
  action?: React.ReactNode;
  /** Pinned under the scrolling body, e.g. the main buttons */
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: 'md' | 'lg';
  className?: string;
}

export function DrawerContent({ title, description, action, footer, children, width = 'md', className }: DrawerContentProps) {
  return (
    <RadixDialog.Portal forceMount>
      <RadixDialog.Overlay asChild>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-surface/70"
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content asChild>
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
          className={clsx(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-white shadow-card-lg',
            width === 'lg' ? 'max-w-2xl' : 'max-w-[480px]',
            className,
          )}
        >
          <div className="flex items-center gap-3 border-b border-line px-6 py-4">
            <RadixDialog.Close aria-label="Close" className="-ml-1.5 rounded-md p-1.5 text-ink2 hover:bg-subtle hover:text-navy transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </RadixDialog.Close>
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="truncate text-[17px] font-bold text-navy">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description className="truncate text-[13px] text-muted">{description}</RadixDialog.Description>}
            </div>
            {action}
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Section inside a drawer or page: title, optional count badge and a right-hand action. */
export function DrawerSection({ title, count, action, children }: {
  title: string; count?: number; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-navy">{title}</h3>
        {count !== undefined && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">{count}</span>
        )}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

/** Bordered grid of small label / value cells. */
export function InfoGrid({ items, columns = 3 }: { items: { label: string; value: React.ReactNode }[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];
  return (
    <dl className={clsx('grid grid-cols-2 overflow-hidden rounded-md border border-line', cols)}>
      {items.map(it => (
        <div key={it.label} className="border-b border-r border-line px-3 py-2.5 -mb-px -mr-px">
          <dt className="text-[11.5px] text-muted">{it.label}</dt>
          <dd className="mt-0.5 truncate text-[13.5px] font-semibold text-navy">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal progress steps (e.g. Submitted → Reviewed → Graded). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span aria-hidden className={clsx('absolute right-1/2 top-[9px] h-px w-full', i <= current ? 'bg-azure' : 'bg-line')} />
            )}
            <span className={clsx(
              'relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border',
              done ? 'border-azure bg-azure text-white' : active ? 'border-azure bg-white' : 'border-line bg-white',
            )}>
              {done && <Icon name="check" size={10} />}
              {active && <span className="h-2 w-2 rounded-full bg-azure" />}
            </span>
            <span className={clsx('text-[11.5px]', active || done ? 'font-semibold text-navy' : 'text-muted')}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
