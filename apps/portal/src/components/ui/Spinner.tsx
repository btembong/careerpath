import { clsx } from 'clsx';
import { Icon } from './Icon';

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 16, md: 24, lg: 32 };
  return <Icon name="spinner" size={sizes[size]} className={clsx('animate-spin text-azure', className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-royal/60">Loading…</p>
      </div>
    </div>
  );
}
