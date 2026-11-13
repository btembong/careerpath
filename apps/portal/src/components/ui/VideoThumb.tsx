'use client';
import Link from 'next/link';
import { parseVideoUrl } from '@cpa/shared';

/**
 * A video's preview with a real picture behind the play button: YouTube's own thumbnail, a frame from an
 * uploaded file, or else the person's photo. Darkened at the bottom so the play button and label read on any image.
 */
export function VideoThumb({ url, photo, label, href, className }: { url: string; photo?: string | null; label: string; href: string; className?: string }) {
  const v = parseVideoUrl(url);
  const short = url.includes('/shorts/');
  return (
    <Link href={href} className={`group relative grid place-items-center overflow-hidden rounded-lg bg-[#072061] ${className ?? 'h-[150px]'}`}>
      {v?.kind === 'youtube' && short
        // A Short is vertical: a blurred copy fills the box, the picture itself sits in the middle
        ? <>
            <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl" />
            {/* YouTube pads a Short's picture with bars to 4:3; a 9:16 box crops them away exactly */}
            <span className="absolute inset-y-0 left-1/2 aspect-[9/16] h-full -translate-x-1/2 overflow-hidden shadow-[0_0_24px_rgba(7,32,97,0.4)]"><img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" /></span>
          </>
        : v?.kind === 'youtube'
        ? <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        : v?.kind === 'file'
          // The first second of the video as its picture; nothing plays
          ? <video src={`${v.src}#t=1`} muted playsInline preload="metadata" poster={photo ?? undefined} className="absolute inset-0 h-full w-full object-cover" />
          : photo
            ? <img src={photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : <svg aria-hidden viewBox="0 0 300 150" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-[0.35]"><path d="M0,120 C60,80 120,140 180,90 C230,50 270,90 300,60 L300,150 L0,150 Z" fill="#3F6FE8" /></svg>}
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,32,97,0.15)_0%,rgba(7,32,97,0.35)_45%,rgba(7,32,97,0.85)_100%)]" />
      <span className="relative grid h-[52px] w-[52px] place-items-center rounded-full bg-[#FFFFFF] shadow-[0_6px_18px_rgba(7,32,97,0.35)] transition-transform group-hover:scale-110">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" fill="#2F57C9" /></svg>
      </span>
      <span className="absolute bottom-2.5 left-3 right-3 truncate text-[13px] font-bold text-[#FFFFFF]">{label}</span>
    </Link>
  );
}
