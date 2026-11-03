'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface HeroCard { icon: string; title: string; body: string; when?: string; pill?: string; href?: string }
interface Hero { greeting: string; headline: string; sub: string; cta: { label: string; href: string }; cta2?: { label: string; href: string }; cards: HeroCard[] }

const TILT = ['-rotate-[2.5deg]', 'ml-8 -mt-1.5 rotate-[1.5deg]', 'ml-3 -mt-1.5 -rotate-1'];

/** The top of every dashboard: one line about today, and the person's real next things. */
export function DashboardHero() {
  const [h, setH] = useState<Hero | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get('/portals/hero').then(r => setH(r.data)).catch(() => setFailed(true)); }, []);

  if (failed) return null;
  if (!h) return <div className="h-[230px] animate-pulse rounded-xl bg-[#3F6FE8]/70" aria-label="Loading" />;
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="grid items-center gap-6 overflow-hidden rounded-xl bg-[#3F6FE8] px-6 py-7 lg:grid-cols-[1.15fr_1fr] lg:px-[34px] lg:py-[30px]">
      <div className="flex flex-col gap-3.5">
        <span className="text-[13px] font-semibold text-navy/70">{date}</span>
        <h1 className="text-[clamp(30px,3.4vw,46px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-navy">
          {h.greeting}<br /><span className="text-white">{h.headline}</span>
        </h1>
        <p className="max-w-[460px] text-[15px] leading-relaxed text-navy/80">{h.sub}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={h.cta.href} className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-bold text-[#2F57C9] hover:bg-[#EAF0FF]">{h.cta.label}</Link>
          {h.cta2 && <Link href={h.cta2.href} className="inline-flex h-10 items-center rounded-md border border-white/60 px-3.5 text-sm font-semibold text-white hover:bg-white/10">{h.cta2.label}</Link>}
        </div>
      </div>
      {h.cards.length > 0 && (
        <div className="flex flex-col pb-3">
          {h.cards.map((c, i) => {
            const inner = (
              <>
                <span className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${i === 1 ? 'bg-[#E9F1FF] text-[#2F57C9]' : 'bg-[#EAF0FF] text-[#3F6FE8]'}`}>{c.icon}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] text-navy"><strong>{c.title}</strong> {c.when && <span className="text-[11px] text-[#97A2BD]">{c.when}</span>}</span>
                  <span className="text-[13px] text-ink2">{c.body}</span>
                </span>
                {c.pill && <span className="absolute -bottom-3 -right-2 rounded-md border border-line bg-white px-2 py-0.5 text-xs font-bold text-[#3F6FE8]">{c.pill}</span>}
              </>
            );
            const cls = `relative flex w-[92%] gap-3 rounded-[10px] bg-[#FFFDF8] px-[15px] py-[13px] shadow-[0_10px_22px_rgba(7,32,97,0.18)] transition hover:rotate-0 ${TILT[i] ?? ''}`;
            return c.href ? <Link key={c.title + i} href={c.href} className={cls}>{inner}</Link> : <div key={c.title + i} className={cls}>{inner}</div>;
          })}
        </div>
      )}
    </section>
  );
}
