'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Period = 'week' | 'month' | 'all';
interface Entry { rank: number; id: string; name: string; initials: string; avatarUrl: string | null; points: number; streak: number; move: number; isMe: boolean }
interface Board {
  period: Period; scope: 'cohort' | 'everyone'; cohorts: { id: string; name: string }[]; cohortId: string | null; scopeName: string;
  leaderboardVisible: boolean;
  me: { rank: number; points: number; streak: number; of: number; gap: number; aheadName: string | null } | null;
  entries: Entry[];
  earn: { label: string; points: number }[];
  badges: { badge: string; label: string; hint: string; earned: boolean; earnedAt: string | null }[];
}

const PERIODS: [Period, string][] = [['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
const PERIOD_WORDS: Record<Period, string> = { week: 'this week', month: 'this month', all: 'overall' };
const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function Face({ e, size = 32 }: { e: Pick<Entry, 'initials' | 'avatarUrl'>; size?: number }) {
  return e.avatarUrl
    ? <img src={e.avatarUrl} alt="" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong" style={{ width: size, height: size }}>{e.initials}</span>;
}

export default function LeaderboardPage() {
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<string>(params.get('cohortId') ?? 'cohort');
  const [d, setD] = useState<Board | null>(null);

  useEffect(() => {
    const isCohort = scope !== 'everyone';
    api.get('/gamification/board', { params: { period, scope: isCohort ? 'cohort' : 'everyone', cohortId: isCohort && scope !== 'cohort' ? scope : undefined } })
      .then(r => setD(r.data)).catch(() => notify.error('Could not load the leaderboard'));
  }, [period, scope]);

  async function toggleVisible(v: boolean) {
    if (!d) return;
    setD({ ...d, leaderboardVisible: v });
    try { await api.patch('/gamification/visibility', { visible: v }); notify.success(v ? 'Classmates can see your name' : 'You show as “A classmate” to others'); }
    catch { setD({ ...d, leaderboardVisible: !v }); notify.error('Could not save'); }
  }

  const top = d?.entries.slice(0, 3) ?? [];
  const rest = d?.entries.slice(3) ?? [];
  const podium = top.length === 3 ? [top[1], top[0], top[2]] : top;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Leaderboard" subtitle="Points from lessons, quizzes, assignments and streaks" />

      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <div className="flex justify-end">
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Period" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
                {PERIODS.map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
                    className={clsx('rounded-md px-3 py-1.5 text-navy', period === k ? 'bg-accent-soft font-semibold' : 'font-medium hover:bg-subtle')}>{l}</button>
                ))}
              </div>
              <label className="flex h-9 items-center gap-1 rounded-md border border-line bg-white px-3 text-[13.5px] text-navy">
                Compare:
                <select value={scope === 'cohort' ? (d?.cohortId ?? 'cohort') : scope} onChange={e => setScope(e.target.value)} className="bg-transparent font-semibold outline-none">
                  {d?.cohorts.map(c => <option key={c.id} value={c.id}>{d.cohorts.length > 1 ? c.name : 'My cohort'}</option>)}
                  <option value="everyone">Everyone</option>
                </select>
              </label>
            </div>
          </div>
          {!d ? <div className="h-96 rounded-lg bg-subtle animate-pulse" /> : (
            <>
              {d.me && (
                <section className="flex flex-wrap items-center gap-4 rounded-lg border border-azure bg-white px-5 py-[18px]">
                  <span className="grid h-14 w-14 place-items-center rounded-[10px] bg-azure-strong text-[22px] font-extrabold text-on-accent">#{d.me.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold text-navy">
                      {d.me.points === 0 ? `No points yet ${PERIOD_WORDS[d.period]}` : `You’re ${ordinal(d.me.rank)} in ${d.scopeName} ${PERIOD_WORDS[d.period]}`}
                    </p>
                    <p className="mt-0.5 text-[13.5px] text-ink2">
                      {d.me.points} points
                      {d.me.rank > 1 && d.me.aheadName ? ` · ${d.me.gap === 0 ? 'level with' : `${d.me.gap} behind`} ${d.me.aheadName.split(' ')[0]} for ${ordinal(d.me.rank - 1)}` : d.me.rank === 1 && d.me.points > 0 ? ' · top of the board' : ''}
                      {d.me.streak > 0 ? ` · ${d.me.streak}-day streak` : ''}
                    </p>
                  </div>
                  <Link href="/student/courses" className="inline-flex h-[38px] items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent hover:opacity-90">Earn points now</Link>
                </section>
              )}

              {top.length > 0 && (
                <section className="grid grid-cols-3 items-end gap-3">
                  {podium.map(e => {
                    const h = e.rank === 1 ? 180 : e.rank === 2 ? 150 : 130;
                    return (
                      <div key={e.id} className={clsx('flex flex-col items-center justify-end rounded-lg border bg-white p-4 text-center', e.isMe ? 'border-azure' : 'border-line')} style={{ minHeight: h }}>
                        <Face e={e} size={48} />
                        <p className="mt-2 w-full truncate text-sm font-bold text-navy">{e.isMe ? 'You' : e.name}</p>
                        <p className="mt-0.5 text-[12.5px] text-muted">{e.points} points</p>
                        <p className="mt-1.5 text-[22px] font-extrabold text-azure-strong">{ordinal(e.rank)}</p>
                      </div>
                    );
                  })}
                </section>
              )}

              <section className="rounded-lg border border-line bg-white">
                {!d.entries.length ? (
                  <p className="px-4 py-10 text-center text-[13px] text-ink2">No one has earned points {PERIOD_WORDS[d.period]} yet. Finish a lesson to be first.</p>
                ) : rest.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted">Everyone on this board is on the podium.</p>
                ) : rest.map(e => (
                  <div key={e.id} className={clsx('flex items-center gap-3 border-t border-line px-4 py-[11px] text-[13.5px] first:border-t-0', e.isMe && 'bg-accent-soft')}>
                    <span className="w-7 font-extrabold text-muted">{e.rank}</span>
                    <Face e={e} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-navy">{e.isMe ? `You · ${e.name}` : e.name}</span>
                    <span className="hidden text-[12.5px] text-muted sm:inline">{e.streak > 0 ? `${e.streak}-day streak` : '—'}</span>
                    <strong className="w-20 text-right text-navy">{e.points}</strong>
                    <span className="w-10 text-right text-xs text-azure-strong" title={d.period === 'all' ? undefined : 'Change since the period before'}>
                      {e.move > 0 ? `▲${e.move}` : e.move < 0 ? `▼${-e.move}` : ''}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">How to earn points</h3>
            {(d?.earn ?? []).map(e => (
              <p key={e.label} className="flex justify-between text-[13px]"><span className="text-ink2">{e.label}</span><strong className="text-navy">+{e.points}</strong></p>
            ))}
          </section>
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Your badges</h3>
            <div className="flex flex-wrap gap-1.5">
              {(d?.badges ?? []).map(b => (
                <span key={b.badge} title={b.earned ? `Earned ${new Date(b.earnedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : b.hint}
                  className={clsx('rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold', b.earned ? 'bg-accent-soft text-navy' : 'border border-dashed border-line text-muted')}>
                  {b.label}
                </span>
              ))}
            </div>
          </section>
          {d && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-navy">
              <span title="When off, classmates see you as “A classmate”">Show my name to classmates</span>
              <input type="checkbox" checked={d.leaderboardVisible} onChange={e => toggleVisible(e.target.checked)} className="h-4 w-4 accent-[var(--color-azure-strong,#3F6FE8)]" />
            </label>
          )}
        </aside>
      </div>
    </div>
  );
}
