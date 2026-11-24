'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { H2, Kicker, btnBlue, btnLine } from '@/components/public/landing/Pieces';

interface Welcome { title: string; durationSec: number | null; speakerName: string | null; speakerTitle: string | null; videoUrl: string; captionsUrl: string | null }

// One request for both the hero button and the section. The video link is signed for a while,
// so it's fetched in the browser rather than baked into the cached page.
let pending: Promise<Welcome | null> | null = null;
function useWelcome() {
  const [w, setW] = useState<Welcome | null>(null);
  useEffect(() => {
    pending ??= fetch(`${process.env.NEXT_PUBLIC_API_URL}/onboarding-video/public`).then(r => (r.ok ? r.json() : null)).then(d => (d?.videoUrl ? d : null)).catch(() => null);
    pending.then(setW);
  }, []);
  return w;
}
/** Set once the welcome has started by itself, so it doesn’t again on later visits */
const SEEN = 'cpa:ceo-welcome-seen';
const length = (s: number | null) => (s ? (s < 90 ? `${s} sec` : `${Math.round(s / 60)} min`) : null);

/** In the hero, beside Apply to teach: only when the welcome video is on the public page */
export function CeoWelcomeButton() {
  const w = useWelcome();
  if (!w) return null;
  return (
    <a href="#welcome" className={`${btnLine} gap-2`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFFFFF] text-[#2F57C9]"><Icon name="play" size={12} /></span>
      Watch our CEO’s welcome{length(w.durationSec) ? ` · ${length(w.durationSec)}` : ''}
    </a>
  );
}

/** “A word from our CEO”: the welcome video teachers watch after onboarding, for everyone thinking of applying */
export function CeoWelcome() {
  const w = useWelcome();
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);

  // Browsers only let a video start by itself without sound: start it muted once half of it is on screen.
  // Only on a visitor’s first visit (remembered on their device), not for visitors saving data, and only once per page.
  useEffect(() => {
    const el = box.current;
    if (!w || !el || started) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    let seen = false;
    try { seen = !!localStorage.getItem(SEEN); } catch { /* storage blocked: treat as a first visit */ }
    if (seen || saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || !video.current) return;
      io.disconnect();
      video.current.muted = true;
      video.current.play().then(() => { setStarted(true); try { localStorage.setItem(SEEN, '1'); } catch { /* storage blocked */ } }).catch(() => { /* the browser said no: the play button stays */ });
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [w, started]);

  if (!w) return null;
  const sound = () => { const v = video.current; if (!v) return; v.muted = false; setMuted(false); if (v.paused) void v.play(); };
  return (
    <section id="welcome" className="mx-auto grid w-full max-w-[1240px] scroll-mt-24 items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:px-14">
      <div>
        <Kicker>A word from our CEO</Kicker>
        <H2>Why we built CareerPath, <span className="text-[#3F6FE8]">and why we need you.</span></H2>
        <p className="mt-4 max-w-[480px] text-[16px] leading-relaxed text-[#3A4A6B]">Our founder on what CareerPath Africa is for, what it means to teach here, and the difference good teachers make to students preparing for their exams.</p>
        {w.speakerName && (
          <p className="mt-5 flex items-center gap-3">
            <span aria-hidden className="flex h-12 w-12 flex-shrink-0 -rotate-[4deg] items-center justify-center rounded-[14px] bg-[#EAF0FF] text-[16px] font-extrabold text-[#2F57C9]">
              {w.speakerName.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
            </span>
            <span><b className="block text-[16px]">{w.speakerName}</b>{w.speakerTitle && <span className="text-[13.5px] text-[#6B7799]">{w.speakerTitle}</span>}</span>
          </p>
        )}
        <a href="/register?role=teacher" className={`${btnBlue} mt-6`}>Apply to teach</a>
      </div>
      <div ref={box} className="relative min-w-0">
        {/* Just the video, like a plain embed: the first frame shows (a little is loaded for it), the rest downloads on play */}
        <video ref={video} src={`${w.videoUrl}#t=0.1`} controls preload="metadata" playsInline muted={muted} onVolumeChange={e => setMuted(e.currentTarget.muted)} onPlay={() => setStarted(true)}
          crossOrigin="anonymous" className="block aspect-video w-full rounded-xl bg-[#000000] object-cover" aria-label={w.title}>
          {w.captionsUrl && <track kind="captions" src={w.captionsUrl} srcLang="en" label="English" default />}
        </video>
        {/* While it plays muted, the one thing on the video: a clear way to hear it */}
        {started && muted && (
          <button type="button" onClick={sound} className="absolute left-1/2 top-4 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#FFFFFF] px-4 py-2 text-[13.5px] font-extrabold text-[#2F57C9] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
            <Icon name="volume" size={16} />Turn on sound
          </button>
        )}
      </div>
    </section>
  );
}
