'use client';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';

/* ─── Card ────────────────────────────────────────────────────────────────── */

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export function Card({ children, className, hover, padding = 'md', onClick }: CardProps) {
  const pads = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };
  const base = clsx(
    'rounded-lg border border-line bg-white',
    pads[padding],
    className,
  );

  if (hover) {
    return (
      <motion.div
        onClick={onClick}
        className={clsx(base, 'cursor-pointer')}
        whileHover={{ borderColor: 'rgba(88,137,250,0.45)', transition: spring.crisp }}
        whileTap={onClick ? { scale: 0.98, transition: spring.snappy } : {}}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div onClick={onClick} className={clsx(base, onClick && 'cursor-pointer')}>
      {children}
    </div>
  );
}

/* ─── Card sub-components ─────────────────────────────────────────────────── */

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between border-b border-line px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3 border-t border-line px-5 py-3', className)}>
      {children}
    </div>
  );
}

/* ─── IconBox ─────────────────────────────────────────────────────────────── */

export function IconBox({ children, active, className }: { children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <span className={clsx(
      'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md',
      active ? 'bg-accent-soft text-azure-strong' : 'bg-subtle text-ink2',
      className,
    )}>
      {children}
    </span>
  );
}
