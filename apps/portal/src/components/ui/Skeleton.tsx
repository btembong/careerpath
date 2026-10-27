import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('animate-pulse rounded-xl bg-cloud', className)} />
  );
}

/** Matches the h-14 Topbar header — keeps layout stable during skeleton */
export function SkeletonTopbar({ back = false }: { back?: boolean }) {
  return (
    <div className="flex h-14 items-center border-b border-cloud bg-white px-4 gap-3 animate-pulse">
      {back ? (
        <div className="h-8 w-28 rounded-xl bg-cloud flex-shrink-0" />
      ) : (
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-32 rounded-lg bg-cloud" />
          <div className="h-2.5 w-20 rounded bg-cloud" />
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <div className="hidden md:block h-8 w-44 rounded-xl bg-cloud" />
        <div className="h-7 w-7 rounded-full bg-cloud" />
        <div className="h-7 w-7 rounded-full bg-cloud" />
      </div>
    </div>
  );
}

/** Matches a row inside a `Card padding="none" divide-y divide-cloud` list */
export function SkeletonListRow({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
      <div className="h-9 w-9 rounded-xl bg-cloud flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className={`h-3 rounded bg-cloud ${wide ? 'w-full' : 'w-3/4'}`} />
        <div className="h-2.5 w-1/2 rounded bg-cloud" />
      </div>
      <div className="h-5 w-16 rounded-full bg-cloud flex-shrink-0" />
    </div>
  );
}

/** Matches the gradient balance card on the wallet page */
export function SkeletonBalance() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}>
      <div className="px-6 py-6">
        <div className="h-2.5 w-28 rounded bg-white/20 mb-3" />
        <div className="h-10 w-40 rounded-lg bg-white/20" />
        <div className="h-2.5 w-32 rounded bg-white/10 mt-3" />
      </div>
      <div className="border-t border-white/10 grid grid-cols-2 divide-x divide-white/10 bg-white/5">
        <div className="px-5 py-3 space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-white/20" />
          <div className="h-2.5 w-16 rounded bg-white/10" />
        </div>
        <div className="px-5 py-3 space-y-1.5">
          <div className="h-3.5 w-8 rounded bg-white/20" />
          <div className="h-2.5 w-16 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: SkeletonProps) {
  return (
    <div className="rounded-2xl border border-cloud bg-white p-5 shadow-card space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-cloud flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 rounded-lg bg-cloud" />
          <div className="h-2.5 w-1/3 rounded-lg bg-cloud" />
        </div>
      </div>
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} className={`h-2.5 rounded-lg bg-cloud ${i === lines - 2 ? 'w-1/2' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-cloud bg-white shadow-card overflow-hidden animate-pulse">
      <div className="h-10 bg-surface border-b border-cloud" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-cloud last:border-0">
          <div className="h-8 w-8 rounded-full bg-cloud flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-48 rounded bg-cloud" />
            <div className="h-2.5 w-24 rounded bg-cloud" />
          </div>
          <div className="h-6 w-20 rounded-lg bg-cloud" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-2xl border border-cloud bg-white p-5 shadow-card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-2.5 w-20 rounded bg-cloud" />
          <div className="h-7 w-16 rounded-lg bg-cloud" />
          <div className="h-2.5 w-12 rounded bg-cloud" />
        </div>
        <div className="h-9 w-9 rounded-xl bg-cloud" />
      </div>
    </div>
  );
}
