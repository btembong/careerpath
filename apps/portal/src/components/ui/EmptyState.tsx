import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: Action;
  secondaryAction?: Action;
  className?: string;
}

export function EmptyState({ icon, title, description, action, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center py-16 text-center ${className ?? ''}`}>
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-cloud/60">
        <Icon name={icon} size={36} className="text-azure/40" />
      </div>
      <p className="text-base font-bold text-navy">{title}</p>
      {description && (
        <p className="text-sm text-royal/40 mt-1.5 max-w-xs leading-relaxed">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-6 flex-wrap justify-center">
          {action && (
            action.href ? (
              <Link href={action.href}
                className="inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-xs font-bold text-white hover:bg-royal transition">
                {action.label}
              </Link>
            ) : (
              <button onClick={action.onClick}
                className="inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-xs font-bold text-white hover:bg-royal transition">
                {action.label}
              </button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link href={secondaryAction.href}
                className="inline-flex items-center gap-2 rounded-xl border border-cloud px-5 py-2.5 text-xs font-semibold text-navy hover:bg-cloud transition">
                {secondaryAction.label}
              </Link>
            ) : (
              <button onClick={secondaryAction.onClick}
                className="inline-flex items-center gap-2 rounded-xl border border-cloud px-5 py-2.5 text-xs font-semibold text-navy hover:bg-cloud transition">
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
