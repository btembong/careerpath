'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Stats { referralCode: string; totalReferrals: number; friends: { name: string; joinedAt: string; learning: boolean }[] }

const initials = (n: string) => n.split(/\s+/).map(w => w[0]?.toUpperCase()).join('').slice(0, 2);

export default function ReferralsPage() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api.get('/referrals/stats').then(r => setS(r.data)).catch(() => notify.error('Could not load your link')); }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.careerpathafrica.com';
  const link = s ? `${origin}/register?ref=${s.referralCode}` : '';
  const learning = s?.friends.filter(f => f.learning).length ?? 0;
  const message = `I’m preparing for my exams on CareerPath Africa — join me: ${link}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); notify.success('Link copied'); }
    catch { notify.error('Could not copy — select the link and copy it'); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Refer a friend" subtitle="Bring classmates to study with you" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg border border-azure bg-white p-5">
            <p className="text-[20px] font-extrabold text-navy">Study with your friends</p>
            <p className="text-[13.5px] text-ink2">Send your link to classmates preparing for the same exam. When they join, they’re linked to you — you can message each other and compete on the leaderboard.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={link || 'Loading your link…'} aria-label="Your link" onFocus={e => e.currentTarget.select()}
                className="h-10 min-w-[240px] flex-1 rounded-md border border-line bg-subtle px-3 text-[13.5px] text-navy outline-none" />
              <button onClick={copy} disabled={!s} className="inline-flex h-10 items-center rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent disabled:opacity-50">Copy link</button>
              <a href={s ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!s}
                className="inline-flex h-10 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Share on WhatsApp</a>
            </div>
            <p className="text-[12.5px] text-muted">Or tell them your code: <strong className="text-navy">{s?.referralCode ?? '…'}</strong></p>
          </section>

          <section className="rounded-lg border border-line bg-white">
            <h2 className="border-b border-line px-[18px] py-3.5 text-[16px] font-bold text-navy">Friends who joined</h2>
            {!s ? <div className="m-4 h-24 animate-pulse rounded bg-subtle" /> : s.friends.length ? s.friends.map((f, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-[18px] py-3 text-[13.5px] last:border-b-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-navy">{initials(f.name)}</span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{f.name}</p><p className="mt-px text-[12.5px] text-muted">joined {new Date(f.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
                <span className={f.learning ? 'text-[12.5px] font-semibold text-azure-strong' : 'text-[12.5px] text-muted'}>{f.learning ? 'Learning' : 'Not started'}</span>
              </div>
            )) : <p className="px-[18px] py-8 text-center text-[13px] text-ink2">Nobody yet. Friends who join with your link show up here.</p>}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <dl className="grid grid-cols-2 gap-3">
            {[['Joined', s?.totalReferrals], ['Now learning', s ? learning : undefined]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l}</dt>
                <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">How it works</h3>
            <p className="text-[13px] text-ink2">1. Share your link or code.</p>
            <p className="text-[13px] text-ink2">2. Your friend creates an account with it.</p>
            <p className="text-[13px] text-ink2">3. They show up here, and on your leaderboard.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
