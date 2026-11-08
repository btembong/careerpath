'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

/** Longest voice note, in seconds */
export const VOICE_MAX_SECS = 300;
const BARS = 40;

export interface VoiceClip { blob: Blob; type: string; ext: string; duration: number; wave: string; url: string }
export type VoicePhase = 'idle' | 'starting' | 'holding' | 'handsfree' | 'review' | 'blocked';

export const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** A format this browser records that phones can play back: MP4 audio first (iPhones), then WebM/Ogg Opus */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    .find(t => MediaRecorder.isTypeSupported?.(t));
}
const extFor = (type: string) => type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';

/** 40 bar heights (0-9) from the loudness samples taken while recording, scaled so quiet voices still show */
function toWave(levels: number[]): string {
  if (!levels.length) return '';
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const from = Math.floor((i * levels.length) / BARS), to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / BARS));
    const slice = levels.slice(from, to);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const max = Math.max(...out, 0.01);
  return out.map(v => Math.max(1, Math.min(9, Math.round((v / max) * 9)))).join('');
}

/**
 * Records a voice note. Hold the microphone to talk and let go to send; a quick tap (or the keyboard)
 * records hands-free instead. Slide left while holding to cancel, slide up to keep recording without holding.
 */
export function useVoiceRecorder(onSend: (clip: VoiceClip) => void) {
  const [phase, setPhaseState] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [problem, setProblem] = useState('');
  const phaseRef = useRef<VoicePhase>('idle');
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; timer: number; chunks: Blob[]; all: number[]; t0: number; type: string } | null>(null);
  const press = useRef<{ at: number; x: number; y: number; released: boolean } | null>(null);
  const onSendRef = useRef(onSend); onSendRef.current = onSend;

  const setPhase = (p: VoicePhase) => { phaseRef.current = p; setPhaseState(p); };
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const teardown = useCallback(() => {
    const r = rec.current; if (!r) return;
    window.clearInterval(r.timer);
    r.stream.getTracks().forEach(t => t.stop());
    r.ctx.close().catch(() => {});
    rec.current = null;
  }, []);

  /** Stops recording and hands back the clip (null if it was too short) */
  const stop = useCallback((): Promise<VoiceClip | null> => new Promise(resolve => {
    const r = rec.current;
    if (!r) return resolve(null);
    const duration = Math.min(VOICE_MAX_SECS, Math.round((Date.now() - r.t0) / 1000));
    const wave = toWave(r.all);
    r.recorder.onstop = () => {
      const type = r.recorder.mimeType || r.type || 'audio/webm';
      const blob = new Blob(r.chunks, { type });
      teardown();
      if (duration < 1 || !blob.size) return resolve(null);
      resolve({ blob, type, ext: extFor(type), duration, wave, url: URL.createObjectURL(blob) });
    };
    if (r.recorder.state !== 'inactive') r.recorder.stop(); else r.recorder.onstop(new Event('stop'));
  }), [teardown]);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (r) { r.recorder.onstop = null; if (r.recorder.state !== 'inactive') r.recorder.stop(); teardown(); }
    setClip(c => { if (c) URL.revokeObjectURL(c.url); return null; });
    setElapsed(0); setLevels([]); setProblem('');
    setPhase('idle');
  }, [teardown]);

  const toReview = useCallback(async () => {
    const c = await stop();
    if (!c) { cancel(); return; }
    setClip(c); setPhase('review');
  }, [stop, cancel]);

  const sendNow = useCallback(async () => {
    const c = phaseRef.current === 'review' ? clip : await stop();
    setClip(null); setElapsed(0); setLevels([]); setPhase('idle');
    if (c) onSendRef.current(c);
  }, [clip, stop]);

  const start = useCallback(async (mode: 'holding' | 'handsfree') => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'blocked') return;
    setProblem('');
    if (!supported) { setProblem('This browser can’t record voice notes. Try Chrome, Edge, Safari or Firefox.'); setPhase('blocked'); return; }
    setPhase('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = pickMime();
      const recorder = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 32_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const all: number[] = [];
      const t0 = Date.now();
      const timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        all.push(level);
        setLevels(prev => [...prev.slice(-(BARS - 1)), level]);
        const secs = (Date.now() - t0) / 1000;
        setElapsed(secs);
        if (secs >= VOICE_MAX_SECS) toReview(); // the 5-minute limit: stop and let them listen back
      }, 100);
      rec.current = { recorder, stream, ctx, timer, chunks, all, t0, type: type ?? '' };
      recorder.start(250);
      // Let go (or tapped) while the browser was still asking for the microphone: carry on hands-free
      setPhase(mode === 'holding' && press.current?.released ? 'handsfree' : mode);
    } catch (e: any) {
      teardown();
      setProblem(e?.name === 'NotFoundError' ? 'No microphone was found on this device.'
        : e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'Your browser isn’t letting us use the microphone. Tap the lock next to the web address, allow the microphone, then try again.'
        : 'The microphone couldn’t start. Close other apps using it, then try again.');
      setPhase('blocked');
    }
  }, [supported, teardown, toReview]);

  useEffect(() => () => { teardown(); }, [teardown]);

  // The bar under the finger changes while recording, so the slide and the let-go are followed on the whole page
  const sendNowRef = useRef(sendNow); sendNowRef.current = sendNow;
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  function follow(pointerId: number) {
    const move = (e: PointerEvent) => {
      const p = press.current; if (e.pointerId !== pointerId || !p || p.released || phaseRef.current !== 'holding') return;
      if (e.clientX - p.x < -90) { press.current = null; done(); cancelRef.current(); }        // slid left: cancel
      else if (e.clientY - p.y < -70) { p.released = true; done(); setPhase('handsfree'); }      // slid up: keep recording
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      done();
      const p = press.current; if (!p || p.released) return;
      p.released = true;
      if (phaseRef.current === 'holding') { if (Date.now() - p.at < 350) setPhase('handsfree'); else sendNowRef.current(); }
    };
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Handlers for the microphone button */
  const micProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || phaseRef.current !== 'idle') return;
      e.preventDefault();
      press.current = { at: Date.now(), x: e.clientX, y: e.clientY, released: false };
      follow(e.pointerId);
      start('holding');
    },
    // Keyboard: Enter or Space starts hands-free recording (pointer presses are handled above)
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) start('handsfree'); },
  };

  return { phase, elapsed, levels, clip, problem, supported, micProps, cancel, toReview, sendNow, retry: () => start('handsfree') };
}
export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;

const I = {
  mic: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  micOff: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18" /></svg>,
  bin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  stop: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 5h14v14H5z" /></svg>,
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4l13 8-13 8z" /></svg>,
  pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>,
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.2L4.3 12l-2.3 7.2a1 1 0 0 0 1.4 1.2z" /></svg>,
};

/** The microphone that replaces Send while the message box is empty */
export function MicButton({ voice }: { voice: VoiceRecorder }) {
  return (
    <button type="button" {...voice.micProps} aria-label="Record a voice note: hold to talk, or tap to record hands-free"
      title="Hold to talk, or tap to record hands-free"
      className="grid h-11 w-11 shrink-0 touch-none select-none place-items-center rounded-full bg-azure-strong text-on-accent">{I.mic}</button>
  );
}

function LiveBars({ levels }: { levels: number[] }) {
  const pad = Array.from({ length: Math.max(0, BARS - levels.length) }, () => 0);
  return (
    <span aria-hidden className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
      {[...pad, ...levels].map((l, i) => <span key={i} className="w-[3px] shrink-0 rounded-sm bg-azure-strong" style={{ height: `${Math.max(3, Math.round(l * 28))}px`, opacity: l ? 1 : 0.25 }} />)}
    </span>
  );
}

/** Takes the message bar's place while recording, listening back, or when the microphone is blocked */
export function VoiceBar({ voice }: { voice: VoiceRecorder }) {
  const { phase } = voice;
  if (phase === 'blocked') return (
    <div className="flex items-start gap-3 border-t border-line bg-amber-50 px-4 py-3" role="alert">
      <span className="mt-0.5 text-amber-700">{I.micOff}</span>
      <p className="min-w-0 flex-1 text-[13.5px] text-ink2"><strong className="block text-navy">Can’t record a voice note</strong>{voice.problem} You can still type or send a file.</p>
      <button type="button" onClick={voice.retry} className="h-9 shrink-0 rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy">Try again</button>
      <button type="button" onClick={voice.cancel} className="h-9 shrink-0 rounded-md px-2 text-[13px] font-semibold text-ink2 hover:text-navy">Close</button>
    </div>
  );
  const dot = <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />;
  const timer = <strong className="w-11 shrink-0 text-[15px] tabular-nums text-navy" aria-live="off">{clock(voice.elapsed)}</strong>;
  const binBtn = <button type="button" onClick={voice.cancel} aria-label="Delete voice note" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-red-500 hover:bg-red-50">{I.bin}</button>;
  const sendBtn = <button type="button" onClick={voice.sendNow} aria-label="Send voice note" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure-strong text-on-accent">{I.send}</button>;
  return (
    <div className="border-t border-line bg-subtle px-3 py-2.5 lg:px-4">
      {phase === 'starting' ? (
        <div className="flex h-11 items-center gap-3 px-2 text-[13.5px] text-ink2">{dot}Starting the microphone…</div>
      ) : phase === 'holding' ? (
        <div className="flex items-center gap-3">
          {dot}{timer}<LiveBars levels={voice.levels} />
          <span className="shrink-0 text-[13px] text-muted">‹ Slide to cancel</span>
          <span aria-label="Recording: let go to send" className="grid h-[52px] w-[52px] shrink-0 touch-none place-items-center rounded-full bg-azure-strong text-on-accent ring-[6px] ring-accent-soft">{I.mic}</span>
        </div>
      ) : phase === 'handsfree' ? (
        <div className="flex items-center gap-2 sm:gap-3">
          {binBtn}{dot}{timer}<LiveBars levels={voice.levels} />
          <button type="button" onClick={voice.toReview} aria-label="Stop and listen back" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-white px-4 text-[13.5px] font-semibold text-navy">{I.stop}<span className="max-sm:hidden">Stop</span></button>
          {sendBtn}
        </div>
      ) : phase === 'review' && voice.clip ? (
        <div className="flex items-center gap-2 sm:gap-3">
          {binBtn}
          <div className="min-w-0 flex-1 rounded-full bg-white px-2 py-1"><VoicePlayer src={voice.clip.url} duration={voice.clip.duration} wave={voice.clip.wave} compact /></div>
          {sendBtn}
        </div>
      ) : null}
      {(phase === 'holding' || phase === 'handsfree') && (
        <p className="mt-1.5 px-1 text-[12px] text-muted">{phase === 'holding' ? 'Let go to send. Slide left to cancel, or up to keep recording without holding.' : `Recording. Stop to listen back first, or send now. Up to ${VOICE_MAX_SECS / 60} minutes.`}</p>
      )}
    </div>
  );
}

const FLAT = '3456545434565454345654543456545434565454';

/** A voice note in the chat: play, waveform that fills as it plays (tap to jump), length, speed. Loads nothing until played. */
export function VoicePlayer({ src, duration, wave, own = false, compact = false }: { src: string | null; duration: number; wave?: string | null; own?: boolean; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const [broken, setBroken] = useState(false);
  const id = useRef(Math.random().toString(36).slice(2));
  const bars = (wave && /^[0-9]{10,64}$/.test(wave) ? wave : FLAT).split('').map(Number);
  const total = duration || 0;
  const progress = total ? Math.min(1, t / total) : 0;

  // Only one voice note plays at a time
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== id.current) audio.current?.pause(); };
    window.addEventListener('cpa-voice-play', other);
    return () => window.removeEventListener('cpa-voice-play', other);
  }, []);

  async function toggle() {
    const a = audio.current; if (!a || !src) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent('cpa-voice-play', { detail: id.current }));
      a.playbackRate = rate;
      try { await a.play(); } catch { setBroken(true); }
    } else a.pause();
  }
  function seek(e: React.MouseEvent<HTMLButtonElement>) {
    const a = audio.current; if (!a || !src || !total) return;
    const box = e.currentTarget.getBoundingClientRect();
    const to = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * total;
    const go = () => { a.currentTime = to; setT(to); };
    if (a.readyState >= 1) go(); else { a.addEventListener('loadedmetadata', go, { once: true }); toggle(); }
  }
  function speed() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next); if (audio.current) audio.current.playbackRate = next;
  }

  const on = own ? 'bg-white' : 'bg-azure-strong';
  const off = own ? 'bg-white/40' : 'bg-azure-strong/30';
  return (
    <div className={clsx('flex items-center gap-2.5', compact ? 'w-full' : 'w-[260px] max-w-full sm:w-[300px]')}>
      {src && <audio ref={audio} src={src} preload="none"
        onTimeUpdate={e => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setT(0); }} onError={() => setBroken(true)} />}
      <button type="button" onClick={toggle} disabled={!src} aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={clsx('grid shrink-0 place-items-center rounded-full disabled:opacity-50', compact ? 'h-8 w-8' : 'h-9 w-9', own ? 'bg-white text-azure-strong' : 'bg-azure-strong text-on-accent')}>
        {playing ? I.pause : I.play}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={seek} disabled={!src} aria-label={`Voice note, ${clock(total)}. Tap to jump.`} className="flex h-7 w-full items-center gap-[2px] overflow-hidden">
          {bars.map((h, i) => <span key={i} aria-hidden className={clsx('w-[3px] shrink-0 rounded-sm', i / bars.length < progress ? on : off)} style={{ height: `${Math.max(3, Math.round((h / 9) * 26))}px` }} />)}
        </button>
        {!compact && <span className={clsx('text-[11px] tabular-nums', own ? 'text-white/80' : 'text-muted')}>
          {broken ? <>Can’t play here. {src && <a href={src} target="_blank" rel="noreferrer" className="underline">Download</a>}</> : playing || t > 0 ? `${clock(t)} / ${clock(total)}` : clock(total)}
        </span>}
      </div>
      {compact ? <span className="shrink-0 pr-1 text-[13px] font-semibold tabular-nums text-navy">{clock(playing || t > 0 ? t : total)}</span> : (
        <button type="button" onClick={speed} aria-label={`Playback speed ${rate}×`}
          className={clsx('h-6 shrink-0 rounded-full px-2 text-[12px] font-bold', own ? 'bg-white/20 text-white' : 'bg-subtle text-ink2')}>{rate}×</button>
      )}
    </div>
  );
}
