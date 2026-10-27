'use client';
/**
 * Tooltip — Radix UI + Framer Motion spring entrance.
 * Shadcn/ui pattern: unstyled primitive + our brand tokens.
 *
 * Usage:
 *   <Tooltip content="Mark as paid">
 *     <button>...</button>
 *   </Tooltip>
 */
import * as _RadixTooltip from '@radix-ui/react-tooltip';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixTooltip = _RadixTooltip as any; // React 19 + pnpm module-identity workaround (TS2786)
import { motion, AnimatePresence } from 'framer-motion';
import { scaleFade } from '@/lib/motion';
import { clsx } from 'clsx';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delayDuration = 300,
  className,
}: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} sideOffset={6} asChild>
            <motion.div
              variants={scaleFade}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={clsx(
                'z-50 max-w-xs rounded-xl border border-cloud bg-navy px-3 py-1.5',
                'text-[11px] font-semibold text-white shadow-lg shadow-navy/20',
                className,
              )}
            >
              {content}
              <RadixTooltip.Arrow className="fill-navy" />
            </motion.div>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
