'use client';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { MediaPlayer as _MP, MediaProvider as _MProv, Track as _Track } from '@vidstack/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MediaPlayer = _MP as any, MediaProvider = _MProv as any, Track = _Track as any; // React 19 + pnpm module-identity workaround (TS2786)
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { parseVideoUrl } from '@cpa/shared';

export interface Chapter { startSec: number; title: string; }

export interface VideoPlayerHandle {
  /** Jump to a time — only works for uploaded files, not YouTube/Vimeo embeds. */
  seekTo: (seconds: number) => void;
  canSeek: boolean;
}

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  /** Resume point in seconds (ignored near the start/end, and for embeds). */
  startAt?: number;
  chapters?: Chapter[] | null;
  /** Called every ~30 s of actual playback and on pause/end, with seconds played since the last call. */
  onProgress?: (positionSecs: number, deltaSecs: number) => void;
  /** Data saver: nothing downloads until the student presses play. */
  dataSaver?: boolean;
  /** The file failed to load (e.g. its signed link expired). */
  onError?: () => void;
}

const REPORT_EVERY_SECS = 30;

function noCtx(e: React.MouseEvent) { e.preventDefault(); }

function toVttTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000`;
}

/** Chapters → WebVTT so the player shows markers on the progress bar and the current chapter title. */
function chaptersVtt(chapters: Chapter[], durationHint?: number) {
  const cues = chapters.map((c, i) => {
    const end = chapters[i + 1]?.startSec ?? Math.max(c.startSec + 1, durationHint ?? c.startSec + 3600);
    return `${toVttTime(c.startSec)} --> ${toVttTime(end)}\n${c.title}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

// React 19: `ref` is a regular prop on function components (no forwardRef needed)
export function VideoPlayer({ src, title, poster, startAt, chapters, onProgress, dataSaver, onError, ref }: VideoPlayerProps & {
  ref?: Ref<VideoPlayerHandle>;
}) {
  const parsed = parseVideoUrl(src);
  const isEmbed = parsed?.kind === 'youtube' || parsed?.kind === 'vimeo';

  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const playedSinceReport = useRef(0);
  const lastTime = useRef<number | null>(null);
  const resumed = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useImperativeHandle(ref, () => ({
    canSeek: !isEmbed,
    seekTo: (seconds: number) => {
      const p = playerRef.current;
      if (!p || isEmbed) return;
      p.currentTime = Math.max(0, seconds);
      p.play?.().catch(() => {});
    },
  }), [isEmbed]);

  // Blob URL for the chapters track (revoked when chapters change or on unmount)
  const chaptersUrl = useMemo(() => {
    if (isEmbed || !chapters?.length || typeof window === 'undefined') return null;
    return URL.createObjectURL(new Blob([chaptersVtt(chapters)], { type: 'text/vtt' }));
  }, [chapters, isEmbed]);
  useEffect(() => () => { if (chaptersUrl) URL.revokeObjectURL(chaptersUrl); }, [chaptersUrl]);

  // Download / PiP restrictions on the native <video> Vidstack renders
  useEffect(() => {
    const video = wrapperRef.current?.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.setAttribute('controlsList', 'nodownload noremoteplayback');
      video.disablePictureInPicture = true;
    }
  }, [src]);

  function flush() {
    const played = Math.round(playedSinceReport.current);
    const pos = playerRef.current?.currentTime ?? 0;
    if (played > 0 || pos > 0) onProgressRef.current?.(Math.floor(pos), played);
    playedSinceReport.current = 0;
  }

  // Report whatever was played when the student leaves the lesson
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isEmbed) {
    return (
      // Right-click on the iframe border is caught here; inside the iframe is beyond our reach.
      <div className="relative bg-black select-none" style={{ paddingBottom: '56.25%' }} onContextMenu={noCtx}>
        <iframe
          key={src}
          src={parsed!.embedUrl}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          title={title ?? 'Video'}
        />
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative select-none" onContextMenu={noCtx}>
      <MediaPlayer
        ref={playerRef}
        title={title}
        src={src}
        poster={poster}
        load={dataSaver ? 'play' : 'visible'}
        onError={() => onError?.()}
        className="w-full aspect-video bg-black"
        onLoadedMetadata={() => {
          const p = playerRef.current;
          if (resumed.current || !p || !startAt) return;
          resumed.current = true;
          // Don't resume in the first/last 10 s — just start over / let them rewatch the ending
          if (startAt > 10 && (!p.duration || startAt < p.duration - 10)) p.currentTime = startAt;
        }}
        onTimeUpdate={({ currentTime }: { currentTime: number }) => {
          const p = playerRef.current;
          if (p && !p.paused && lastTime.current !== null) {
            const step = currentTime - lastTime.current;
            if (step > 0 && step < 2) playedSinceReport.current += step; // ignore seeks
          }
          lastTime.current = currentTime;
          if (playedSinceReport.current >= REPORT_EVERY_SECS) flush();
        }}
        onPause={flush}
        onEnded={flush}
      >
        <MediaProvider>
          {chaptersUrl && <Track kind="chapters" src={chaptersUrl} lang="en-US" label="Chapters" type="vtt" default />}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
