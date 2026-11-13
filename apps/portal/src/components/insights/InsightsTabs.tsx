'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const TABS = [
  { href: '/admin/insights', label: 'Overview' },
  { href: '/admin/insights/countries', label: 'Countries' },
  { href: '/admin/reports', label: 'Sales' },
];

/** Insights is three views of how CareerPath is doing: the whole platform, country by country, and a month's sales */
export function InsightsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Insights" className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4 lg:px-7">
      {TABS.map(t => {
        const on = path === t.href || (t.href !== '/admin/insights' && path.startsWith(t.href));
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className={clsx('inline-flex h-11 flex-shrink-0 items-center border-b-[3px] px-3.5 text-sm', on ? 'border-[#3F6FE8] font-bold text-navy' : 'border-transparent font-medium text-ink2 hover:text-navy')}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
