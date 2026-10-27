'use client';
import { clsx } from 'clsx';
import { Avatar } from './Avatar';

interface AvatarGroupProps {
  names: (string | undefined | null)[];
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function AvatarGroup({ names, max = 4, size = 'sm', className }: AvatarGroupProps) {
  const visible = names.slice(0, max);
  const overflow = names.length - max;
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';

  return (
    <div className={clsx('flex -space-x-2', className)}>
      {visible.map((name, i) => (
        <div key={i} className="ring-2 ring-white rounded-full">
          <Avatar name={name ?? undefined} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div className={clsx(
          'flex items-center justify-center rounded-full bg-cloud font-bold text-royal ring-2 ring-white',
          dim,
        )}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
