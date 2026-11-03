'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { notify } from '@/lib/notify';

/** What goes on the share card: two lines, a small line and a label in the corner. */
export interface ShareText { c1: string; c2: string; c3: string; label: string; link?: string }

export interface CelebrateProps {
  emoji: string;
  l1: string;
  l2: string;
  sub: string;
  next?: { label: string; href?: string; onClick?: () => void };
  share: ShareText;
}

const BLUE = '#3F6FE8';
const NAVY = '#072061';

/** Fixed confetti: same spots every time, so nothing jumps around. */
const DOTS = Array.from({ length: 14 }, (_, i) => ({
  size: 6 + (i % 3) * 4,
  round: i % 2 === 0,
  color: ['#FFFFFF', '#FFFDF8', NAVY, '#EAF0FF'][i % 4],
  left: (i * 53) % 95,
  top: (i * 37) % 90,
  rot: i * 25,
}));

/** "Amara D." — first name and initial only. */
export function shortName(user?: { firstName?: string; lastName?: string; name?: string } | null) {
  const parts = (user?.firstName ? [user.firstName, user.lastName ?? ''] : (user?.name ?? '').split(/\s+/)).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** The big blue moment: passed a mock, ready by CAT, finished a course, got a certificate. */
export function Celebrate({ emoji, l1, l2, sub, next, share }: CelebrateProps) {
  const [open, setOpen] = useState(false);
  const nextCls = 'inline-flex h-11 items-center rounded-md border border-white/60 px-4 text-[14.5px] font-semibold text-white hover:bg-white/10';
  return (
    <section className="keep-light relative flex flex-col justify-center gap-3.5 overflow-hidden rounded-[14px] bg-[#3F6FE8] px-6 py-8 sm:px-10 sm:py-10">
      {DOTS.map((d, i) => (
        <span key={i} aria-hidden className="pointer-events-none absolute opacity-55" style={{ width: d.size, height: d.size, borderRadius: d.round ? 999 : 2, background: d.color, left: `${d.left}%`, top: `${d.top}%`, transform: `rotate(${d.rot}deg)` }} />
      ))}
      <span className="relative text-[44px] leading-none sm:text-[54px]" aria-hidden>{emoji}</span>
      <h2 className="relative text-[38px] font-extrabold leading-[1.02] tracking-[-0.035em] text-navy sm:text-[54px]">
        {l1}<br /><span className="text-white">{l2}</span>
      </h2>
      <p className="relative max-w-[460px] text-[15px] leading-relaxed text-[#072061]/80 sm:text-base">{sub}</p>
      <div className="relative flex flex-wrap gap-2">
        <button onClick={() => setOpen(true)} className="inline-flex h-11 items-center rounded-md bg-white px-[18px] text-[14.5px] font-bold text-[#2F57C9] hover:bg-[#F4F7FF]">Share it</button>
        {next && (next.href ? <Link href={next.href} className={nextCls}>{next.label}</Link> : <button onClick={next.onClick} className={nextCls}>{next.label}</button>)}
      </div>
      {open && <ShareDialog share={share} onClose={() => setOpen(false)} />}
    </section>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the 1080×1350 card (WhatsApp status and Instagram size). */
function drawCard(canvas: HTMLCanvasElement, s: ShareText, who: string) {
  const W = 1080, H = 1350, P = 88;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'Arial, sans-serif';
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
  DOTS.forEach(d => {
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = d.color;
    ctx.translate((d.left / 100) * W, (d.top / 100) * H); ctx.rotate((d.rot * Math.PI) / 180);
    const z = d.size * 3;
    if (d.round) { ctx.beginPath(); ctx.arc(0, 0, z / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-z / 2, -z / 2, z, z);
    ctx.restore();
  });
  // logo
  ctx.fillStyle = '#FFFFFF'; roundRect(ctx, P, P, 84, 84, 20); ctx.fill();
  ctx.fillStyle = BLUE; ctx.font = `900 44px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', P + 42, P + 45);
  ctx.textAlign = 'left'; ctx.font = `800 52px ${font}`; ctx.fillStyle = NAVY; ctx.fillText('careerpath', P + 108, P + 44);
  ctx.fillStyle = '#FFFFFF'; ctx.fillText('.', P + 108 + ctx.measureText('careerpath').width, P + 44);
  // headline, bottom-aligned above the footer
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 112px ${font}`;
  const l1 = wrap(ctx, s.c1, W - P * 2), l2 = wrap(ctx, s.c2, W - P * 2);
  ctx.font = `500 44px ${font}`;
  const l3 = wrap(ctx, s.c3, W - P * 2);
  let y = H - 260 - l3.length * 58 - 30 - (l1.length + l2.length) * 118 + 100;
  ctx.font = `800 112px ${font}`;
  ctx.fillStyle = NAVY; l1.forEach(t => { ctx.fillText(t, P, y); y += 118; });
  ctx.fillStyle = '#FFFFFF'; l2.forEach(t => { ctx.fillText(t, P, y); y += 118; });
  y += 14; ctx.font = `500 44px ${font}`; ctx.fillStyle = 'rgba(7,32,97,0.82)';
  l3.forEach(t => { ctx.fillText(t, P, y); y += 58; });
  // footer
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.font = `500 38px ${font}`; ctx.fillStyle = 'rgba(7,32,97,0.78)';
  ctx.fillText([who, date].filter(Boolean).join(' · '), P, H - P);
  ctx.font = `700 34px ${font}`;
  const lw = ctx.measureText(s.label).width + 48;
  ctx.fillStyle = '#FFFDF8'; roundRect(ctx, W - P - lw, H - P - 52, lw, 72, 16); ctx.fill();
  ctx.fillStyle = '#2F57C9'; ctx.fillText(s.label, W - P - lw + 24, H - P - 4);
}

export function ShareDialog({ share, onClose }: { share: ShareText; onClose: () => void }) {
  // The sign-in token carries no name, so read it from the profile
  const [user, setUser] = useState<{ firstName?: string; lastName?: string; name?: string } | null>(null);
  useEffect(() => { api.get('/auth/me').then(r => setUser(r.data)).catch(() => setUser({})); }, []);
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');
  const who = shortName(user);
  const link = share.link || (typeof window !== 'undefined' ? window.location.origin : '');
  const text = `${share.c1} ${share.c2} ${share.c3}`.replace(/\s+/g, ' ').trim();

  useEffect(() => {
    const draw = () => { if (ref.current) { drawCard(ref.current, share, who); setUrl(ref.current.toDataURL('image/png')); } };
    if (!user) return;
    (document as any).fonts?.ready ? (document as any).fonts.ready.then(draw) : draw();
  }, [share.c1, share.c2, share.c3, share.label, who, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function shareImage() {
    if (!ref.current) return;
    const blob: Blob | null = await new Promise(r => ref.current!.toBlob(r, 'image/png'));
    const file = blob ? new File([blob], 'careerpath.png', { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: `${text} ${link}` }); return; }
    } catch { return; /* closed */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`, '_blank', 'noopener');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); notify.success('Link copied'); } catch { notify.error('Could not copy the link'); }
  }
  const btn = 'inline-flex h-10 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#072061]/50 p-4" onClick={onClose} role="dialog" aria-modal aria-label="Share">
      <div className="keep-light flex max-h-full w-full max-w-[380px] flex-col items-center gap-3 overflow-y-auto rounded-[12px] bg-white p-5" onClick={e => e.stopPropagation()}>
        <div className="flex w-full items-center justify-between"><strong className="text-[15px] text-navy">Share it</strong><button onClick={onClose} className="text-[13px] font-semibold text-muted hover:text-navy">Close</button></div>
        <canvas ref={ref} className="hidden" />
        {url ? <img src={url} alt={text} className="w-full max-w-[300px] rounded-[14px] shadow-[0_20px_40px_rgba(7,32,97,0.25)]" /> : <div className="aspect-[4/5] w-full max-w-[300px] animate-pulse rounded-[14px] bg-[#3F6FE8]" />}
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={shareImage} className={btn}>WhatsApp</button>
          {url && <a href={url} download="careerpath.png" className={btn}>Download image</a>}
          <button onClick={copy} className={btn}>Copy link</button>
        </div>
        <p className="max-w-[300px] text-center text-xs text-muted">Only your first name and initial are on it. Nothing is posted for you.</p>
      </div>
    </div>
  );
}
