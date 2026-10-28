'use client';
import { clsx } from 'clsx';
import { Icon } from './Icon';
import type { IconName } from '@/lib/icons';

interface StatCardProps {
  icon: IconName;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export function StatCard({ icon, label, value, trend, trendUp, className }: StatCardProps) {
  return (
    <div className={clsx('rounded-2xl border border-cloud bg-white p-5 shadow-card', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cloud text-azure">
          <Icon name={icon} size={20} />
        </div>
        {trend && (
          <span className={clsx(
            'inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10px] font-bold',
            trendUp !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
          )}>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d={trendUp !== false ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
            </svg>
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-navy tracking-tight">{value}</p>
      <p className="text-xs text-royal/50 mt-0.5">{label}</p>
    </div>
  );
}
