'use client';
import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Icon } from './Icon';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  searchable = false,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  emptyMessage = 'No results found',
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, search, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  return (
    <div className={clsx('rounded-2xl border border-cloud bg-white shadow-card overflow-hidden', className)}>
      {/* Toolbar */}
      {searchable && (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-cloud">
          <div className="relative flex-1 max-w-xs">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-cloud bg-surface py-2 pl-9 pr-3 text-xs text-navy outline-none placeholder:text-royal/40 focus:border-azure transition"
            />
          </div>
          <span className="text-[11px] text-royal/40 ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cloud">
              {columns.map(col => (
                <th key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={clsx(
                    'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-royal/50',
                    col.sortable && 'cursor-pointer select-none hover:text-navy transition',
                    col.className,
                  )}>
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-royal/40">
                  {emptyMessage}
                </td>
              </tr>
            ) : paged.map(row => (
              <tr key={String(row[keyField])}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'border-b border-cloud last:border-b-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface',
                )}>
                {columns.map(col => (
                  <td key={col.key} className={clsx('px-5 py-3', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-cloud">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition disabled:opacity-40 disabled:cursor-not-allowed">
            Previous
          </button>
          <span className="text-xs text-royal/50">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition disabled:opacity-40 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
