'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface Props {
  src: string;
  captionsUrl?: string | null;
  /** Furthest point already credited by the server — playback resumes here. */
  initialMaxSec: number;
  /** Called with the current position; return the server's credited max + completion. */
  onReport: (positionSec: number, durationSec: number) => Promise<{ maxWatchedSec: number; completed: boolean }>;
  onCompleted: () => void;
}

const REPORT_EVERY_SEC = 10;

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Orientation video: pause and rewind are allowed, skipping ahead and speed changes are not.
 * Pausing stays available on purpose (WCAG 2.2.2, flaky mobile data). The server decides completion.
 */
export function NoSkipVideoPlayer({ src, captionsUrl, initialMaxSec, onReport, onCompleted }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(initialMaxSec);
  const lastReportRef = useRef(0);
  const doneRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxWatched, setMaxWatched] = useState(initialMaxSec);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const report = useCallback(async (force = false) => {
    const v = videoRef.current;
    if (!v || doneRef.current || !v.duration) return;
    if (!force && v.currentTime - lastReportRef.current < REPORT_EVERY_SEC) return;
    lastReportRef.current = v.currentTime;
    try {
      const r = await onReport(v.currentTime, v.duration);
      maxRef.current = Math.max(maxRef.current, r.maxWatchedSec);
      setMaxWatched(maxRef.current);
      if (r.completed && !doneRef.current) {
        doneRef.current = true;
        onCompleted();
      }
    } catch {
      /* transient network error — the next report catches up */
    }
  }, [onReport, onCompleted]);

  // Resume where the teacher left off
  function onLoaded() {
    const v = videoRef.current!;
    setDuration(v.duration);
    if (initialMaxSec > 1 && initialMaxSec < v.duration - 1) v.currentTime = initialMaxSec;
    if (v.textTracks[0]) v.textTracks[0].mode = captionsOn ? 'showing' : 'hidden';
  }

  function onTimeUpdate() {
    const v = videoRef.current!;
    setCurrent(v.currentTime);
    // Track the furthest point reached by normal playback (small jumps only)
    if (v.currentTime > maxRef.current && v.currentTime - maxRef.current < 2) {
      maxRef.current = v.currentTime;
      setMaxWatched(v.currentTime);
    }
    void report();
  }

  // Block seeking past the furthest point watched (rewinding is fine)
  function onSeeking() {
    const v = videoRef.current!;
    if (v.currentTime > maxRef.current + 1) {
      v.currentTime = maxRef.current;
      flash('You can rewind, but not skip ahead.');
    }
  }

  function onRateChange() {
    const v = videoRef.current!;
    if (v.playbackRate !== 1) v.playbackRate = 1;
  }

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  }

  // Pause when the tab is hidden so it can't run unwatched in the background
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) videoRef.current?.pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function togglePlay() {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => setError('Playback was blocked by the browser. Press play again.'));
    else v.pause();
  }

  function seekFromBar(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current; if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = ((e.clientX - rect.left) / rect.width) * duration;
    if (target > maxRef.current + 1) { flash('You can rewind, but not skip ahead.'); return; }
    v.currentTime = target;
  }

  function toggleCaptions() {
    const v = videoRef.current; if (!v?.textTracks[0]) return;
    const next = !captionsOn;
    v.textTracks[0].mode = next ? 'showing' : 'hidden';
    setCaptionsOn(next);
  }

  function fullscreen() {
    const el = videoRef.current?.parentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el?.requestFullscreen?.();
  }

  const pctPlayed = duration ? (current / duration) * 100 : 0;
  const pctReached = duration ? (maxWatched / duration) * 100 : 0;
  const remaining = Math.max(0, duration - maxWatched);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black" onContextMenu={e => e.preventDefault()}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          className="w-full aspect-video object-contain"
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTimeUpdate}
          onSeeking={onSeeking}
          onRateChange={onRateChange}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); void report(true); }}
          onEnded={() => { setPlaying(false); void report(true); }}
          onError={() => setError('The video could not be loaded. Check your connection and refresh the page.')}
          onClick={togglePlay}
        >
          {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="English" default />}
        </video>

        {!playing && !error && (
          <button type="button" onClick={togglePlay} aria-label={current > 0 ? 'Resume video' : 'Play video'}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition hover:bg-black/20">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-navy shadow-xl">
              <Icon name="play" size={28} />
            </span>
          </button>
        )}

        {notice && (
          <div role="status" className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-xs font-medium text-white">
            {notice}
          </div>
        )}
      </div>

      {/* Custom controls — no forward scrubbing, no speed menu */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure text-white hover:bg-royal transition">
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>

        <div className="flex-1">
          <div role="slider" aria-label="Video progress" aria-valuemin={0} aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)} aria-valuetext={`${fmt(current)} of ${fmt(duration)}`}
            onClick={seekFromBar}
            className="relative h-2 cursor-pointer rounded-full bg-cloud">
            <div className="absolute inset-y-0 left-0 rounded-full bg-azure/25" style={{ width: `${pctReached}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-azure" style={{ width: `${pctPlayed}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-royal/50">
            <span>{fmt(current)} / {fmt(duration)}</span>
            <span>{remaining > 1 ? `${fmt(remaining)} left to unlock` : 'Unlocking…'}</span>
          </div>
        </div>

        <button type="button" onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-royal/60 hover:bg-cloud transition">
          <Icon name={muted ? 'volumeOff' : 'volume'} size={16} />
        </button>
        {captionsUrl && (
          <button type="button" onClick={toggleCaptions} aria-pressed={captionsOn} aria-label="Captions"
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${captionsOn ? 'bg-navy text-white' : 'text-royal/60 hover:bg-cloud'}`}>
            CC
          </button>
        )}
        <button type="button" onClick={fullscreen} aria-label="Fullscreen"
          className="flex h-9 w-9 items-center justify-center rounded-full text-royal/60 hover:bg-cloud transition">
          <Icon name="fullscreen" size={16} />
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
