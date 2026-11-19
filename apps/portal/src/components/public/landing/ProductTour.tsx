'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { BrowserShot } from './Pieces';

export interface TourItem { key: string; icon: string; label: string; title: string; text: string; ticks: string[]; img: string; alt: string }

/** Tabs that switch the real screen beside a short explanation; on phones the tabs scroll sideways */
export function ProductTour({ items }: { items: TourItem[] }) {
  const [on, setOn] = useState(items[0].key);
  const cur = items.find(i => i.key === on) ?? items[0];
  return (
    <>
      <div role="tablist" aria-label="Product tour" className="no-scrollbar -mx-4 mb-5 mt-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {items.map(i => (
          <button key={i.key} type="button" role="tab" aria-selected={on === i.key} onClick={() => setOn(i.key)}
            className={clsx('flex h-10 flex-shrink-0 items-center gap-2 rounded-[7px] border px-4 text-[14px] font-bold', on === i.key ? 'border-[#072061] bg-[#072061] text-[#FFFFFF]' : 'border-[#D5DDEC] bg-[#FFFFFF] text-[#3A4A6B] hover:text-navy')}>
            <span aria-hidden>{i.icon}</span>{i.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="grid items-center gap-8 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div key={cur.key} className="animate-[cpa-fade-up_.45s_ease-out_both]">
          <h3 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.025em] text-navy sm:text-[28px]">{cur.title}</h3>
          <p className="mt-2.5 text-[15px] leading-relaxed text-[#3A4A6B]">{cur.text}</p>
          <ul className="mt-3.5 flex flex-col gap-2 text-[14.5px] text-navy">{cur.ticks.map(t => <li key={t}><span aria-hidden className="mr-2 font-extrabold text-[#17703A]">✓</span>{t}</li>)}</ul>
        </div>
        <BrowserShot key={cur.img} src={cur.img} alt={cur.alt} className="animate-[cpa-fade-up_.45s_ease-out_both]" />
      </div>
    </>
  );
}
