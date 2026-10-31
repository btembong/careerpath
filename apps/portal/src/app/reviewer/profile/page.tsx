'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { AboutYou, type EditableProfile } from '@/components/profile/AboutYou';
import { PayoutCard, type Payout } from '@/components/payout/PayoutCard';
import { notify } from '@/lib/notify';
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';

interface Stats { reviewed: number; avgReviewDays: number | null; approved: number; sentBack: number; commissionPct: number | null; earned: { currency: string; amount: number }[] }

export default function ReviewerProfilePage() {
  const [p, setP] = useState<EditableProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [payout, setPayout] = useState<Payout | null | undefined>(undefined);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get('/auth/me/profile').then(r => setP(r.data)).catch(() => notify.error('Could not load your profile'));
    api.get('/reviewer/overview').then(r => setStats(r.data.stats)).catch(() => {});
    api.get('/payout-accounts/me').then(r => setPayout(r.data || null)).catch(() => setPayout(null));
    api.get('/auth/me/preferences').then(r => setCountries(r.data.countries ?? [])).catch(() => {});
  }, []);

  const earned = stats?.earned.filter(e => e.amount > 0) ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My profile" subtitle="Your details, review record and payout" />
      {!p ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7 lg:my-6" /> : (
        <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <AboutYou p={p} onSaved={setP} bioLabel="What you look for in a course"
              bioPlaceholder="Accurate content that matches the syllabus, clear explanations, quizzes that test the lesson, and good audio."
              extra={[
                { label: 'Subjects you review', value: p.subjects.join(', ') || 'Not set', hint: 'Set by an admin.' },
                { label: 'Country', value: p.country?.name ?? 'Not set' },
              ]} />
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">Your review record</h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  [stats ? String(stats.reviewed) : '—', `course${stats?.reviewed === 1 ? '' : 's'} reviewed`],
                  [stats?.avgReviewDays != null ? `${stats.avgReviewDays} day${stats.avgReviewDays === 1 ? '' : 's'}` : '—', 'average review time'],
                  [stats ? String(stats.approved) : '—', 'approved'],
                  [stats ? String(stats.sentBack) : '—', 'sent back with notes'],
                ].map(([v, l]) => <div key={l}><p className="text-xl font-extrabold text-navy">{v}</p><p className="mt-0.5 text-[12.5px] text-muted">{l}</p></div>)}
              </div>
            </section>
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">How you’re paid</h3>
              <p className="text-[13px] text-ink2">
                {stats?.commissionPct != null
                  ? <>You earn <strong className="text-navy">{stats.commissionPct}%</strong> of every sale of a course you approved, paid to your wallet.</>
                  : 'You earn a share of every sale of a course you approved, paid to your wallet. Your admin sets the share for each course.'}
              </p>
              <p className="text-[13px]">
                {earned.length ? earned.map((e, i) => <span key={e.currency}>{i > 0 && ' · '}<strong className="text-navy">{e.currency} {minorToMajor(e.amount, e.currency).toLocaleString('en-GB')}</strong></span>) : <strong className="text-navy">Nothing yet</strong>}
                <span className="text-muted"> earned so far</span>
              </p>
            </section>
            <PayoutCard payout={payout} countries={countries} onSaved={setPayout} highlight={payout === null} />
          </aside>
        </div>
      )}
    </div>
  );
}
