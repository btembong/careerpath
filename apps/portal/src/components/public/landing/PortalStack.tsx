'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

export interface PortalCard { key: string; kicker: string; title: string; text: string; ticks: string[]; img: string; alt: string; href: string; cta: string; tone: 'blue' | 'navy' | 'soft' | 'white' }

const TONE = {
  blue: 'bg-[#3F6FE8] text-navy [&_.h]:text-navy [&_.k]:text-[#0B1F55] [&_.t]:text-[#0B1F55]',
  navy: 'bg-[#072061] text-[#FFFFFF] [&_.h]:text-[#FFFFFF] [&_.k]:text-[#7FA3FF] [&_.t]:text-[#C9D4F2]',
  soft: 'bg-[#EAF0FF] text-navy [&_.h]:text-navy [&_.k]:text-[#3F6FE8] [&_.t]:text-[#3A4A6B]',
  white: 'bg-[#FFFFFF] text-navy [&_.h]:text-navy [&_.k]:text-[#3F6FE8] [&_.t]:text-[#3A4A6B]',
};

/**
 * Every portal in one section: on a computer the cards stack sideways as you scroll, each sliding in from the right
 * and coming to rest a little to the right of the one before, which shrinks back. On phones, and for people who
 * turn animations off, they're a plain list.
 */
export function PortalStack({ cards }: { cards: PortalCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const set = () => setAnimate(mq.matches);
    set(); mq.addEventListener('change', set);
    const on = () => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      setP(Math.min(1, Math.max(0, -r.top / Math.max(1, total))));
    };
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { mq.removeEventListener('change', set); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);

  const n = cards.length;
  if (!animate) {
    return <div className="flex flex-col gap-4">{cards.map(c => <Card key={c.key} c={c} />)}</div>;
  }
  return (
    <div ref={ref} style={{ height: `${n * 85 + 25}vh` }} className="relative">
      <div className="sticky top-[88px] h-[calc(100vh-110px)] overflow-hidden">
        {cards.map((c, i) => {
          // Card i arrives between steps i-1 and i; the first is there from the start
          const t = i === 0 ? 1 : Math.min(1, Math.max(0, p * (n - 1) - (i - 1)));
          const ease = 1 - Math.pow(1 - t, 3);
          const above = cards.slice(i + 1).reduce((k, _, j) => k + Math.min(1, Math.max(0, p * (n - 1) - (i + j))), 0);
          const x = (1 - ease) * 110; // percent of the card's width, off to the right
          return (
            <div key={c.key} className="absolute inset-y-0 left-0 right-[90px] will-change-transform"
              style={{ transform: `translateX(calc(${x}% + ${i * 30}px)) scale(${1 - above * 0.05})`, transformOrigin: 'left center', zIndex: i, filter: above ? `brightness(${1 - above * 0.08})` : undefined }}>
              <Card c={c} full />
            </div>
          );
        })}
        <div aria-hidden className="absolute bottom-3 right-0 flex gap-1.5">
          {cards.map((c, i) => <span key={c.key} className={clsx('h-1.5 rounded-full transition-all', p * (n - 1) >= i - 0.5 ? 'w-6 bg-[#3F6FE8]' : 'w-1.5 bg-[#C9D3E8]')} />)}
        </div>
      </div>
    </div>
  );
}

function Card({ c, full }: { c: PortalCard; full?: boolean }) {
  return (
    <article className={clsx('grid overflow-hidden rounded-[22px] shadow-[0_24px_60px_rgba(7,32,97,0.22)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]', TONE[c.tone], full && 'h-full')}>
      <div className="flex flex-col justify-center gap-3 p-6 sm:p-9">
        <p className="k text-[12.5px] font-extrabold uppercase tracking-[0.08em]">{c.kicker}</p>
        <h3 className="h text-[30px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[38px]">{c.title}</h3>
        <p className="t text-[15.5px] leading-relaxed">{c.text}</p>
        <ul className="t flex flex-col gap-1.5 text-[14.5px]">{c.ticks.map(t => <li key={t}><span aria-hidden className="mr-2 font-extrabold">✓</span>{t}</li>)}</ul>
        <Link href={c.href} className={clsx('mt-2 inline-flex h-11 w-fit items-center rounded-[7px] px-[18px] text-[15px] font-extrabold', c.tone === 'navy' ? 'bg-[#FFFFFF] text-[#072061]' : c.tone === 'blue' ? 'bg-[#072061] text-[#FFFFFF]' : 'bg-[#2F57C9] text-[#FFFFFF]')}>{c.cta} →</Link>
      </div>
      <div className="relative min-h-[220px] overflow-hidden lg:min-h-0">
        <img src={c.img} alt={c.alt} className="absolute left-6 top-6 w-[880px] max-w-none rounded-tl-xl shadow-[0_18px_44px_rgba(7,32,97,0.25)] lg:left-0 lg:top-10" />
      </div>
    </article>
  );
}
