'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { price } from '@/components/public/PublicChrome';
import { LessonPreview, type Preview } from './LessonPreview';

interface CardPreview {
  id: string; slug: string; title: string; selling: 'free' | 'paid' | 'package' | 'notsale'; lessons: number; hasFreeLesson: boolean;
  price: { amount: number; currency: string } | null; preview: Preview | null;
}
// Fetched on the first click only, then kept for the visit
const cache = new Map<string, Promise<CardPreview | null>>();
const fetchPreview = (slug: string) => {
  if (!cache.has(slug)) cache.set(slug, fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/course-preview/${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(slug)!;
};

/** The play button on a course card: opens the first lesson, drawn like the player, without leaving the list */
export function PlayPreview({ slug, title, openHref }: { slug: string; title: string; openHref?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CardPreview | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchPreview(slug).then(d => { if (live) setData(d); });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { live = false; document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [open, slug]);

  // Signed in (openHref): one button to the student's own course page instead of signing up
  const page = openHref ?? `/courses/${slug}`;
  const start = data ? `/register?next=${encodeURIComponent(`/student/courses/${data.id}${data.selling === 'free' ? '?start=1' : ''}`)}` : page;
  const main = !data ? null
    : openHref ? null
    : data.selling === 'free' ? { href: start, label: 'Start free' }
    : data.selling === 'paid' && data.price ? { href: page, label: `Get it · ${price(data.price.amount, data.price.currency)}` }
    : { href: page, label: 'See how to get it' };

  return (
    <>
      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} aria-label={`Preview the first lesson of ${title}`}
        className="pointer-events-auto relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-azure-strong transition hover:scale-110 group-hover:bg-[#FFFFFF]">
        <Icon name="play" size={16} />
      </button>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={`Preview: ${title}`} onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(7,32,97,0.55)] backdrop-blur-[2px] sm:items-center sm:p-6">
          <div onClick={e => e.stopPropagation()} className="keep-light flex max-h-[92dvh] w-full max-w-[620px] flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-[#FFFFFF] p-5 text-navy shadow-[0_30px_80px_rgba(7,32,97,0.35)] sm:rounded-[22px] sm:p-6"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#3F6FE8]">Preview · first lesson</span>
                <b className="mt-0.5 line-clamp-2 block text-[19px] leading-tight tracking-[-0.015em]">{title}</b>
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close the preview" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F4FA] text-[#637090] hover:bg-[#EAF0FF] hover:text-navy">✕</button>
            </div>
            {data === undefined ? (
              <div className="h-[230px] animate-pulse rounded-[14px] bg-[#0B1640]/90" />
            ) : data?.preview ? (
              <LessonPreview p={data.preview} href={openHref ?? (data.selling === 'free' ? start : page)} />
            ) : (
              <p className="rounded-[14px] bg-[#F4F6FB] p-5 text-[14.5px] leading-relaxed text-[#3A4A6B]">This course’s lessons are still on careerpathafrica.com while they move into the portal. The course page has everything it covers.</p>
            )}
            {data && data.preview && data.selling !== 'free' && !openHref && <p className="-mt-1 text-[13px] text-[#637090]">The full lesson opens once you have the course{data.hasFreeLesson ? '; some lessons are free to try' : ''}.</p>}
            <div className={openHref ? 'grid' : 'grid gap-2.5 sm:grid-cols-2'}>
              {main && <Link href={main.href} className="flex h-12 items-center justify-center rounded-lg bg-[#2F57C9] text-[15px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">{main.label}</Link>}
              <Link href={page} className="flex h-12 items-center justify-center gap-1.5 rounded-lg border border-[#D5DDEC] text-[15px] font-extrabold text-navy hover:bg-[#F4F6FB]">{openHref ? 'Open the course' : 'See the course'}<Icon name="arrowRight" size={15} /></Link>
            </div>
            {data?.selling === 'free' && !openHref && <p className="-mt-1 text-center text-[12.5px] text-[#637090]">Free account, no card. You land on this lesson.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
