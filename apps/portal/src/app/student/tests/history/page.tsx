'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface Row { id: string; title: string; mode: string; status: string; startedAt: string; percent: number | null; questionCount: number }

export default function TestHistoryPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api.get('/test-centre/sessions').then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Previous tests</h1>
        <section className="overflow-hidden rounded-lg border border-line bg-white">
          {rows === null && <p className="p-5 text-sm text-muted">Loading…</p>}
          {rows?.length === 0 && <p className="p-5 text-sm text-muted">No tests yet. <Link href="/student/tests/new" className="font-semibold text-[#3F6FE8]">Create your first</Link></p>}
          {rows?.map(r => {
            const open = r.status === 'IN_PROGRESS';
            return (
              <Link key={r.id} href={open ? `/student/tests/${r.id}` : `/student/tests/${r.id}/result`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-subtle">
                <span className="min-w-0"><strong className="block truncate text-navy">{r.title}</strong>
                  <span className="text-xs text-muted">{r.mode === 'EXAM' ? 'Exam' : 'Practice'} · {r.questionCount} questions · {new Date(r.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                <strong className={open ? 'text-[#3F6FE8]' : 'text-navy'}>{open ? 'Continue' : r.percent != null ? `${r.percent}%` : '—'}</strong>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
