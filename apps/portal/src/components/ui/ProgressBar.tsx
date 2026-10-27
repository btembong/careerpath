'use client';
import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'azure' | 'green' | 'amber' | 'red';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  color = 'azure',
  size = 'sm',
  showLabel = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colors = {
    azure: 'bg-azure',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red:   'bg-red-500',
  };
  const heights = { sm: 'h-1.5', md: 'h-2.5' };

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className={clsx('flex-1 rounded-full bg-cloud overflow-hidden', heights[size])}>
        <div
          className={clsx('h-full rounded-full transition-all duration-700 ease-out', colors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-semibold text-royal/60 tabular-nums flex-shrink-0">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
