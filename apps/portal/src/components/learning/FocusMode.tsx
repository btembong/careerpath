'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';

type Sound = 'off' | 'rain' | 'waves' | 'brown' | 'hum';
const SOUNDS: [Sound, string][] = [['off', 'Off'], ['rain', 'Rain'], ['waves', 'Waves'], ['brown', 'Brown noise'], ['hum', 'Soft hum']];
const PRESETS = [25, 45, 60];
const BREAK = 5;
const LOFI = 'https://www.youtube.com/embed/jfKfPfyJRdk';
const KEY = 'cpa:focus';

/** Today's focus sessions and minutes, kept on this device */
export function focusToday(): { sessions: number; minutes: number } {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v?.day === new Date().toDateString()) return { sessions: v.sessions ?? 0, minutes: v.minutes ?? 0 }; } catch { /* storage blocked */ }
  return { sessions: 0, minutes: 0 };
}
function addSession(minutes: number) {
  const t = focusToday();
  try { localStorage.setItem(KEY, JSON.stringify({ day: new Date().toDateString(), sessions: t.sessions + 1, minutes: t.minutes + minutes })); } catch { /* storage blocked */ }
}
/** A YouTube video or playlist link as an embed address; null when it isn't one */
function youtubeEmbed(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
    const list = u.searchParams.get('list');
    if (list) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}`;
    const id = u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.split('/').pop();
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  } catch { return null; }
}

/**
 * Background sound made in the browser (nothing to download): noise shaped into rain, waves or brown noise, or a soft hum.
 * Returns a stop function; the gain node lets the volume change while it plays.
 */
function startSound(ctx: AudioContext, kind: Exclude<Sound, 'off'>, out: GainNode): () => void {
  const nodes: AudioNode[] = [];
  const stops: (() => void)[] = [];
  if (kind === 'hum') {
    for (const [f, g] of [[110, 0.05], [164.8, 0.03], [220, 0.015]] as [number, number][]) {
      const o = ctx.createOscillator(); o.frequency.value = f; o.type = 'sine';
      const gn = ctx.createGain(); gn.gain.value = g; o.connect(gn).connect(out); o.start(); stops.push(() => o.stop()); nodes.push(o, gn);
    }
  } else {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'rain') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'rain' ? 2600 : kind === 'waves' ? 900 : 500;
    const shape = ctx.createGain(); shape.gain.value = 1;
    src.connect(filter).connect(shape).connect(out);
    if (kind === 'waves') {
      // A slow swell, like waves coming in
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const depth = ctx.createGain(); depth.gain.value = 0.45;
      lfo.connect(depth).connect(shape.gain); shape.gain.value = 0.55; lfo.start(); stops.push(() => lfo.stop()); nodes.push(lfo, depth);
    }
    src.start(); stops.push(() => src.stop()); nodes.push(src, filter, shape);
  }
  return () => { stops.forEach(s => { try { s(); } catch { /* already stopped */ } }); nodes.forEach(n => n.disconnect()); };
}

function chime(ctx: AudioContext) {
  for (const [f, t] of [[660, 0], [880, 0.18], [1320, 0.36]] as [number, number][]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0, ctx.currentTime + t); g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 1.2);
    o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 1.3);
  }
}

/**
 * Focus mode: a full-screen study room with a countdown ring (25, 45 or 60 minutes, then a 5-minute break), background
 * sound made in the browser, and a study playlist from YouTube. Sessions count on this device.
 */
export function FocusMode({ open, onClose, task, onSession }: { open: boolean; onClose: () => void; task?: { title: string; sub?: string; href?: string } | null; onSession?: () => void }) {
  const [length, setLength] = useState(25);
  const [phase, setPhase] = useState<'work' | 'break'>('work');
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState<Sound>('off');
  const [volume, setVolume] = useState(0.55);
  const [music, setMusic] = useState(false);
  const [own, setOwn] = useState('');
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  const [today, setToday] = useState({ sessions: 0, minutes: 0 });
  const ctx = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const total = (phase === 'work' ? length : BREAK) * 60;
  /** The audio context, made on the first tap (browsers only allow sound after one) */
  const audio = () => {
    try {
      if (!ctx.current) { ctx.current = new AudioContext(); gain.current = ctx.current.createGain(); gain.current.gain.value = volume; gain.current.connect(ctx.current.destination); }
      void ctx.current.resume();
      return ctx.current;
    } catch { return null; }
  };

  useEffect(() => { if (open) { setToday(focusToday()); try { setOwn(localStorage.getItem(`${KEY}:playlist`) ?? ''); } catch { /* storage blocked */ } } }, [open]);

  // The countdown; at zero: a chime, the session counted, then the break (or back to work)
  useEffect(() => {
    if (!open || !running) return;
    const id = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [open, running]);
  useEffect(() => {
    if (!open || !running || left > 0) return;
    if (ctx.current) chime(ctx.current);
    if (phase === 'work') { addSession(length); setToday(focusToday()); onSession?.(); setDone(true); setPhase('break'); setLeft(BREAK * 60); }
    else { setPhase('work'); setDone(false); setLeft(length * 60); }
  }, [open, running, left, phase, length, onSession]);

  // The tab's title shows the time left, so it's visible from other tabs
  useEffect(() => {
    if (!open) return;
    const before = document.title;
    document.title = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')} · ${phase === 'work' ? 'Focus' : 'Break'}`;
    return () => { document.title = before; };
  }, [open, left, phase]);

  // Sound: started from a tap (browsers need one), quieter during the break
  useEffect(() => {
    stop.current?.(); stop.current = null;
    if (!open || sound === 'off') return;
    const a = audio();
    if (!a) return;
    stop.current = startSound(a, sound, gain.current!);
    return () => { stop.current?.(); stop.current = null; };
  }, [open, sound]);
  useEffect(() => { if (gain.current && ctx.current) gain.current.gain.setTargetAtTime(phase === 'break' ? volume * 0.35 : volume, ctx.current.currentTime, 0.6); }, [volume, phase]);

  // Esc closes; the page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [open, onClose]);
  useEffect(() => () => { stop.current?.(); void ctx.current?.close(); }, []);

  if (!open) return null;
  const pick = (m: number) => { setLength(m); setPhase('work'); setLeft(m * 60); setRunning(false); setDone(false); };
  const ownEmbed = own ? youtubeEmbed(own) : null;
  const playlist = ownEmbed ?? LOFI;
  const r = 98, c = 2 * Math.PI * r, frac = left / total;

  return <>{createPortal(
    <div role="dialog" aria-modal="true" aria-label="Focus" className="keep-light fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-[linear-gradient(160deg,#06103A,#0B1B5C_55%,#13235A)] p-4 text-[#FFFFFF] sm:p-7">
      {/* Slow-moving light */}
      <span aria-hidden className="pointer-events-none absolute -left-24 top-32 h-[420px] w-[420px] animate-[focus-drift_18s_ease-in-out_infinite] rounded-full bg-[#3F6FE8] opacity-40 blur-[80px]" />
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-10 h-[340px] w-[340px] animate-[focus-drift_22s_ease-in-out_infinite_reverse] rounded-full bg-[#6B8BFF] opacity-40 blur-[80px]" />
      <span aria-hidden className="pointer-events-none absolute bottom-[-80px] right-1/4 h-[300px] w-[300px] animate-[focus-drift_26s_ease-in-out_infinite] rounded-full bg-[#2F57C9] opacity-40 blur-[80px]" />
      <style>{'@keyframes focus-drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.12)}}'}</style>

      <div className="relative flex flex-wrap items-center gap-3 text-[13px] text-[#C9D4F2]">
        <b className="text-[17px] text-[#FFFFFF]">Focus</b>
        {task && <span className="hidden min-w-0 truncate sm:inline">{task.title}{task.sub ? ` · ${task.sub}` : ''}</span>}
        <button type="button" onClick={onClose} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.3)] px-3 font-bold text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.08)]">✕ End</button>
      </div>

      <div className="relative my-6 flex flex-col items-center gap-4">
        <div className="relative h-[230px] w-[230px] sm:h-[270px] sm:w-[270px]">
          <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
            <circle cx="110" cy="110" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
            <circle cx="110" cy="110" r={r} fill="none" stroke={phase === 'work' ? '#8EA8FF' : '#4BD07F'} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
            <b className="text-[52px] font-extrabold tabular-nums tracking-[-0.03em] sm:text-[60px]">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</b>
            <span className="text-[13px] text-[#C9D4F2]">{phase === 'work' ? `of ${length} minutes · session ${today.sessions + 1}` : done ? 'Session done: take 5' : 'Break'}</span>
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => { audio(); setRunning(v => !v); }} className="inline-flex h-11 min-w-[110px] items-center justify-center gap-1.5 rounded-lg bg-[#FFFFFF] px-4 text-[15px] font-extrabold text-[#2F57C9]"><Icon name={running ? 'pause' : 'play'} size={16} />{running ? 'Pause' : left === total ? 'Start' : 'Resume'}</button>
          <button type="button" onClick={() => setLeft(s => s + 5 * 60)} className="inline-flex h-11 items-center rounded-lg border border-[rgba(255,255,255,0.4)] px-4 text-[14px] font-extrabold">+5 min</button>
          <button type="button" onClick={() => { setPhase(p => (p === 'work' ? 'break' : 'work')); setLeft((phase === 'work' ? BREAK : length) * 60); }} className="inline-flex h-11 items-center rounded-lg border border-[rgba(255,255,255,0.4)] px-4 text-[14px] font-extrabold">{phase === 'work' ? 'Skip to break' : 'Back to work'}</button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {PRESETS.map(m => <button key={m} type="button" onClick={() => pick(m)} className={clsx('h-8 rounded-full border px-3.5 text-[13px] font-bold', length === m && phase === 'work' ? 'border-[#FFFFFF] bg-[#FFFFFF] text-[#072061]' : 'border-[rgba(255,255,255,0.25)] text-[#C9D4F2] hover:text-[#FFFFFF]')}>{m} min</button>)}
        </div>
      </div>

      <div className="relative mt-auto grid gap-3 lg:grid-cols-3">
        <section className="flex flex-col gap-2.5 rounded-[14px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] p-3.5">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#C9D4F2]">Sound</p>
          <div className="flex flex-wrap gap-1.5">
            {SOUNDS.map(([k, l]) => <button key={k} type="button" aria-pressed={sound === k} onClick={() => setSound(k)} className={clsx('h-8 rounded-lg border px-2.5 text-[12.5px] font-bold', sound === k ? 'border-[#FFFFFF] bg-[#FFFFFF] text-[#2F57C9]' : 'border-[rgba(255,255,255,0.2)] text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.08)]')}>{l}</button>)}
          </div>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" className="w-full accent-[#8EA8FF]" disabled={sound === 'off'} />
          <p className="text-[11.5px] text-[#C9D4F2]">Made on your device: no data used. Quieter during the break.</p>
        </section>

        <section className="flex flex-col gap-2.5 rounded-[14px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] p-3.5">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#C9D4F2]">Study playlist</p>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#6B8BFF,#2F57C9)]"><Icon name="play" size={16} /></span>
            <span className="min-w-0 flex-1"><b className="block truncate">{ownEmbed ? 'Your YouTube playlist' : 'Lofi Girl · beats to study to'}</b><span className="text-[11.5px] text-[#C9D4F2]">{music ? 'Playing below' : 'From YouTube · uses data'}</span></span>
            <button type="button" role="switch" aria-checked={music} onClick={() => setMusic(v => !v)} className={clsx('relative h-6 w-11 flex-shrink-0 rounded-full transition', music ? 'bg-[#4BD07F]' : 'bg-[rgba(255,255,255,0.25)]')}>
              <span className={clsx('absolute top-1 h-4 w-4 rounded-full bg-[#FFFFFF] transition-all', music ? 'left-6' : 'left-1')} />
            </button>
          </div>
          {editing ? (
            <div className="flex gap-1.5">
              <input autoFocus value={own} onChange={e => setOwn(e.target.value)} placeholder="Paste a YouTube video or playlist link" className="h-9 min-w-0 flex-1 rounded-lg border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] px-2.5 text-[12.5px] text-[#FFFFFF] outline-none placeholder:text-[#9AA8D2]" />
              <button type="button" onClick={() => { try { localStorage.setItem(`${KEY}:playlist`, youtubeEmbed(own) ? own : ''); } catch { /* storage blocked */ } if (!youtubeEmbed(own)) setOwn(''); setEditing(false); }} className="h-9 rounded-lg bg-[#FFFFFF] px-3 text-[12.5px] font-extrabold text-[#2F57C9]">Save</button>
            </div>
          ) : <button type="button" onClick={() => setEditing(true)} className="w-fit text-[12.5px] font-bold text-[#8EA8FF] hover:underline">{ownEmbed ? 'Change your playlist' : 'Use your own YouTube playlist →'}</button>}
          {music && <iframe src={`${playlist}${playlist.includes('?') ? '&' : '?'}autoplay=1`} title="Study playlist" allow="autoplay; encrypted-media" className="aspect-video w-full rounded-lg border-0" />}
        </section>

        <section className="flex flex-col gap-2 rounded-[14px] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] p-3.5">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#C9D4F2]">This session</p>
          {task ? <>
            <b className="text-[15px] leading-snug">{task.title}</b>
            {task.sub && <span className="text-[12.5px] text-[#C9D4F2]">{task.sub}</span>}
            {task.href && <a href={task.href} target="_blank" rel="noreferrer" className="w-fit text-[12.5px] font-bold text-[#8EA8FF] hover:underline">Open the lesson in a new tab →</a>}
          </> : <span className="text-[13px] text-[#C9D4F2]">Pick a lesson or open your notes; the timer keeps going.</span>}
          <span className="mt-auto text-[12px] text-[#C9D4F2]">Today: {today.sessions} session{today.sessions === 1 ? '' : 's'} · {today.minutes} minutes</span>
        </section>
      </div>
    </div>,
    document.body,
  )}</>;
}
