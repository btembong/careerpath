'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

const STEPS = [
  { icon: 'heart'        as const, label: 'Share your link', desc: 'Send your unique referral link to friends, family or colleagues.' },
  { icon: 'user'         as const, label: 'Friend signs up',  desc: 'They create an account on CareerPath Africa using your link.' },
  { icon: 'packages'     as const, label: 'They enroll',      desc: 'Once they purchase a package, the referral is confirmed.' },
  { icon: 'wallet'       as const, label: 'You earn credits', desc: 'Wallet credits are added to your account automatically.' },
];

interface ReferralStats {
  totalReferrals: number;
  enrolled: number;
  creditsEarned: number;
  currency: string;
  referralCode: string | null;
}

interface Me { id?: string; walletCurrency?: string; }

export default function StudentReferralsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => {}),
      api.get('/referrals/stats').then(r => setStats(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-2xl w-full mx-auto">
        <div className="rounded-3xl h-44 animate-pulse bg-navy/20" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-20 animate-pulse" />)}
        </div>
        <SkeletonCard lines={3} />
      </div>
    </div>
  );

  // Only a code issued by the API is tracked — never show an invented one
  const code = stats?.referralCode ?? '—';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://careerpathafrica.com';
  const referralLink = stats?.referralCode ? `${origin}/register?ref=${stats.referralCode}` : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      notify.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      notify.error('Could not copy — try manually selecting the link.');
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      notify.success('Code copied!');
    } catch {
      notify.error('Could not copy.');
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Refer & Earn" subtitle="Invite friends, earn wallet credits" backHref="/student/dashboard" backLabel="Dashboard" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-2xl w-full mx-auto">

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl p-6 text-white"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border-[24px] border-white/5" />
          <div className="pointer-events-none absolute -left-4 bottom-0 h-24 w-24 rounded-full border-[12px] border-azure/15" />
          <div className="relative z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 mb-4">
              <Icon name="heart" size={22} className="text-white" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-1">Referral programme</p>
            <h2 className="text-2xl font-black text-white leading-tight mb-2">Invite friends,<br/>earn together</h2>
            <p className="text-sm text-white/60 max-w-xs leading-relaxed">
              Share your unique link. Every friend who enrolls earns you wallet credits you can spend on courses and packages.
            </p>
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Referrals', value: String(stats?.totalReferrals ?? 0), sub: 'total sent' },
            { label: 'Enrolled',  value: String(stats?.enrolled ?? 0),       sub: 'converted' },
            { label: 'Earned',    value: String(stats?.creditsEarned ?? 0),  sub: stats?.currency ?? me?.walletCurrency ?? 'XAF' },
          ].map(s => (
            <Card key={s.label} className="flex flex-col items-center py-4 px-2 text-center">
              <p className="text-2xl font-black text-navy">{s.value}</p>
              <p className="text-[10px] font-bold text-royal/50 mt-0.5">{s.label}</p>
              <p className="text-[9px] text-royal/30">{s.sub}</p>
            </Card>
          ))}
        </div>

        {/* ── Referral link ─────────────────────────────────────────── */}
        <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Your referral link</p>

          {/* Code badge */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 rounded-xl border border-cloud bg-surface px-4 py-3">
              <p className="text-[10px] text-royal/40 font-semibold mb-0.5">Referral code</p>
              <p className="text-base font-black text-navy tracking-widest">{code}</p>
            </div>
            <button onClick={copyCode}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-cloud bg-white hover:bg-cloud transition flex-shrink-0">
              <Icon name="hash" size={18} className="text-royal" />
            </button>
          </div>

          {/* Link row */}
          <div className="flex items-center gap-2 rounded-xl border border-cloud bg-surface px-3 py-2.5 mb-3">
            <p className="flex-1 text-xs text-royal/50 truncate font-mono">{referralLink}</p>
            <button onClick={copyLink}
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-azure px-3 py-1.5 text-xs font-bold text-white hover:bg-royal transition">
              <Icon name={copied ? 'check' : 'download'} size={12} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Share buttons */}
          <div className="flex gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(`Join me on CareerPath Africa! Use my referral link: ${referralLink}`)}`}
              target="_blank" rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cloud bg-white py-2.5 text-xs font-semibold text-navy hover:bg-cloud transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-green-500">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
            <a href={`mailto:?subject=Join me on CareerPath Africa&body=Hi! I'm learning on CareerPath Africa. Use my referral link to sign up: ${referralLink}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cloud bg-white py-2.5 text-xs font-semibold text-navy hover:bg-cloud transition">
              <Icon name="mail" size={14} className="text-azure" />
              Email
            </a>
          </div>
        </Card>

        {/* ── How it works ─────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-3">How it works</p>
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <Card key={step.label} className="flex items-center gap-4 p-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure text-xs font-black text-white">
                  {i + 1}
                </div>
                <IconBox><Icon name={step.icon} size={18} /></IconBox>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy">{step.label}</p>
                  <p className="text-xs text-royal/50 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {!stats && (
          <Card className="flex items-center gap-3 p-4 border-azure/20 bg-azure/5">
            <Icon name="bell" size={18} className="text-azure flex-shrink-0" />
            <p className="text-xs text-royal/70 leading-relaxed">
              <strong className="text-navy">Coming soon:</strong> Real-time referral tracking and automated credit payouts are being rolled out. Your referral code is already active.
            </p>
          </Card>
        )}

      </div>
    </div>
  );
}
