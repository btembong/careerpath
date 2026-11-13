'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { TeacherStudentsHero } from '@/components/hero/TeacherHeroes';

interface Row { id: string; name: string; cohort: { id: string; name: string }; progress: number; attended: number; held: number; submitted: number; assignments: number; lastActive: string | null; flag: string | null; flagReason: string | null }
interface Data { cohorts: { id: string; name: string }[]; stats: { students: number; attention: number; avgProgress: number | null; activeThisWeek: number }; students: Row[] }
interface Rule { id: string; cohortId: string; type: string; enabled: boolean; thresholdDays: number | null }

const DAY = 86_400_000;
const ago = (d: string | null) => { if (!d) return 'Never'; const n = Math.floor((Date.now() - new Date(d).getTime()) / DAY); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`; };

export default function TeacherStudentsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<'attention' | 'all'>('attention');
  const [cohort, setCohort] = useState('all');
  const [q, setQ] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);

  async function load() {
    const [s, r] = await Promise.all([api.get('/portals/teacher/my-students'), api.get('/alerts').catch(() => ({ data: [] }))]);
    setD(s.data); setRules(r.data ?? []);
  }
  useEffect(() => { load().catch(() => notify.error('Could not load your students')); }, []);

  const shown = useMemo(() => (d?.students ?? []).filter(s => (tab === 'all' || s.flag) && (cohort === 'all' || s.cohort.id === cohort)
    && (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))), [d, tab, cohort, q]);
  const st = d?.stats;
  const ruleCohort = cohort !== 'all' ? cohort : d?.cohorts[0]?.id;
  const ruleFor = (type: string) => rules.find(r => r.cohortId === ruleCohort && r.type === type);
  const inactive = ruleFor('INACTIVE');
  const overdue = ruleFor('ASSIGNMENT_OVERDUE');

  async function saveRule(type: string, enabled: boolean, thresholdDays?: number) {
    if (!ruleCohort) return;
    try {
      await api.post('/alerts', { cohortId: ruleCohort, type, enabled, ...(thresholdDays ? { thresholdDays } : {}) });
      notify.success('Rule saved');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save the rule'); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My students" subtitle="Everyone in your cohorts, and who needs your attention" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {d && st ? <TeacherStudentsHero stats={st} students={d.students} cohorts={d.cohorts.length} /> : <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />}

        <div className="flex flex-wrap items-start gap-5">
          <section id="students" className="min-w-0 flex-[999_1_560px] rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4">
              <div role="tablist" aria-label="Students" className="flex flex-1 gap-1">
                {([['attention', 'Needs attention', d?.students.filter(s => s.flag).length], ['all', 'All', d?.students.length]] as ['attention' | 'all', string, number | undefined][]).map(([k, l, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                    {l} <span className="font-medium text-muted">{n ?? 0}</span>
                  </button>
                ))}
              </div>
              <input type="search" aria-label="Search students" value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="input-base my-2 h-[34px] w-40" />
              {d && d.cohorts.length > 1 && (
                <select aria-label="Cohort" value={cohort} onChange={e => setCohort(e.target.value)} className="h-[34px] rounded-md border border-line bg-white px-2 text-[13px] font-semibold text-navy outline-none">
                  <option value="all">All cohorts</option>{d.cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            {!d ? <div className="m-4 h-40 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
              <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'attention' ? 'Nobody needs attention right now.' : 'No students yet.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
                  <thead><tr>{['Student', 'Cohort', 'Progress', 'Classes', 'Last active', 'Why'].map(h => <th key={h} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map(s => (
                      <tr key={`${s.cohort.id}-${s.id}`} className="hover:bg-subtle">
                        <td className="border-b border-line px-4 py-[11px] font-semibold text-navy">
                          <Link href={`/teacher/cohorts/${s.cohort.id}`} className="hover:underline">{s.name}</Link>
                        </td>
                        <td className="border-b border-line px-4 py-[11px] text-ink2">{s.cohort.name}</td>
                        <td className="border-b border-line px-4 py-[11px]">
                          <span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${s.progress}%` }} /></span><span className="font-semibold text-navy">{s.progress}%</span></span>
                        </td>
                        <td className="border-b border-line px-4 py-[11px] text-navy">{s.held ? `${s.attended} of ${s.held}` : '—'}</td>
                        <td className="border-b border-line px-4 py-[11px] text-muted">{ago(s.lastActive)}</td>
                        <td className="border-b border-line px-4 py-[11px]">
                          {s.flag ? <span title={s.flagReason ?? undefined} className="inline-flex h-6 items-center whitespace-nowrap rounded bg-accent-soft px-2 text-xs font-semibold text-navy">{s.flag}</span> : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside id="rules" className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
            <h3 className="text-[15px] font-semibold text-navy">When to flag a student</h3>
            {d && d.cohorts.length > 1 && <p className="text-[12.5px] text-muted">For {d.cohorts.find(c => c.id === ruleCohort)?.name}. Pick a cohort above to change another.</p>}
            {!ruleCohort ? <p className="text-[13px] text-ink2">You don’t have a cohort yet.</p> : <>
              <div className="flex items-center justify-between gap-2.5 rounded-md border border-line px-2.5 py-2 text-[13px] text-navy">
                <span>Inactive for
                  <select aria-label="Days" value={String(inactive?.thresholdDays ?? 7)} disabled={inactive?.enabled === false}
                    onChange={e => saveRule('INACTIVE', true, Number(e.target.value))} className="mx-1.5 rounded border border-line bg-white px-1 py-0.5 font-semibold">
                    {[3, 5, 7, 10, 14].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>days</span>
                <input type="checkbox" checked={inactive?.enabled !== false} onChange={e => saveRule('INACTIVE', e.target.checked, inactive?.thresholdDays ?? 7)} className="h-4 w-4 accent-[var(--color-azure-strong)]" aria-label="Flag inactive students" />
              </div>
              <div className="flex items-center justify-between gap-2.5 rounded-md border border-line px-2.5 py-2 text-[13px] text-navy">
                <span>Missed 2 of the last 4 classes</span>
                <span className="text-xs text-muted">Always on</span>
              </div>
              <div className="flex items-center justify-between gap-2.5 rounded-md border border-line px-2.5 py-2 text-[13px] text-navy">
                <span>An assignment overdue</span>
                <input type="checkbox" checked={overdue?.enabled !== false} onChange={e => saveRule('ASSIGNMENT_OVERDUE', e.target.checked)} className="h-4 w-4 accent-[var(--color-azure-strong)]" aria-label="Flag overdue assignments" />
              </div>
              <p className="text-[12.5px] text-muted">Flags show here, on your dashboard and on the cohort page.</p>
            </>}
          </aside>
        </div>
      </div>
    </div>
  );
}
