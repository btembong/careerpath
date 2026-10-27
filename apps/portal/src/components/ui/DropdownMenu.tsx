'use client';
/**
 * DropdownMenu — Radix UI + Framer Motion + brand tokens.
 * Shadcn/ui pattern: composable, accessible, spring-animated.
 *
 * Usage:
 *   <DropdownMenu trigger={<button>Options</button>}>
 *     <DropdownItem icon="edit" onSelect={() => ...}>Edit</DropdownItem>
 *     <DropdownSeparator />
 *     <DropdownItem icon="trash" variant="danger" onSelect={() => ...}>Delete</DropdownItem>
 *   </DropdownMenu>
 */
import * as _Radix from '@radix-ui/react-dropdown-menu';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Radix = _Radix as any; // React 19 + pnpm module-identity workaround (TS2786)
import { motion, AnimatePresence } from 'framer-motion';
import { slideUp } from '@/lib/motion';
import { clsx } from 'clsx';
import { Icon, type IconName } from './Icon';

// ─── Root ─────────────────────────────────────────────────────────────────────
interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function DropdownMenu({ trigger, children, align = 'end' }: DropdownMenuProps) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content align={align} sideOffset={6} asChild>
          <motion.div
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              'z-50 min-w-[160px] overflow-hidden rounded-2xl border border-cloud bg-white',
              'p-1.5 shadow-xl shadow-navy/10',
            )}
          >
            {children}
          </motion.div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

// ─── Item ─────────────────────────────────────────────────────────────────────
interface DropdownItemProps {
  children: React.ReactNode;
  onSelect?: () => void;
  icon?: IconName;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function DropdownItem({ children, onSelect, icon, variant = 'default', disabled }: DropdownItemProps) {
  return (
    <Radix.Item
      onSelect={onSelect}
      disabled={disabled}
      className={clsx(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2',
        'text-xs font-semibold outline-none transition-colors',
        variant === 'danger'
          ? 'text-red-600 data-[highlighted]:bg-red-50'
          : 'text-navy data-[highlighted]:bg-cloud',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {icon && <Icon name={icon} size={13} className="flex-shrink-0" />}
      {children}
    </Radix.Item>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────
export function DropdownSeparator() {
  return <Radix.Separator className="my-1 h-px bg-cloud" />;
}

// ─── Label ───────────────────────────────────────────────────────────────────
export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <Radix.Label className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-royal/40">
      {children}
    </Radix.Label>
  );
}
