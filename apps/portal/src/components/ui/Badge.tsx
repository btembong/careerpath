import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'active' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  // One accent: blue for active/positive states, neutral grey for everything else; red text only for errors.
  const variants = {
    default: 'bg-subtle text-ink2 border border-line',
    active:  'bg-accent-soft text-navy',
    muted:   'bg-subtle text-muted border border-line',
    success: 'bg-accent-soft text-navy',
    warning: 'bg-subtle text-navy border border-line',
    danger:  'bg-subtle text-error border border-line',
    info:    'bg-accent-soft text-navy',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1 h-6 rounded px-2 text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  );
}
