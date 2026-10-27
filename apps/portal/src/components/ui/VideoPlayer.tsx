'use client';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { useEffect, useRef } from 'react';
import { MediaPlayer as _MP, MediaProvider as _MProv } from '@vidstack/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MediaPlayer = _MP as any, MediaProvider = _MProv as any; // React 19 + pnpm module-identity workaround (TS2786)
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  onTimeUpdate?: (currentTime: number) => void;
}

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/;
const VIMEO_REGEX = /vimeo\.com\/(\d+)/;

function getEmbedUrl(src: string): string | null {
  const yt = src.match(YT_REGEX);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vim = src.match(VIMEO_REGEX);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}?dnt=1`;
  return null;
}

function noCtx(e: React.MouseEvent) { e.preventDefault(); }

export function VideoPlayer({ src, title, poster, onTimeUpdate }: VideoPlayerProps) {
  const embedUrl = getEmbedUrl(src);

  if (embedUrl) {
    return (
      // Wrap embed — right-click on the iframe border/chrome is caught here;
      // inside the iframe itself is sandboxed and beyond our reach (expected).
      <div
        className="relative bg-black select-none"
        style={{ paddingBottom: '56.25%' }}
        onContextMenu={noCtx}
      >
        <iframe
          key={src}
          src={embedUrl}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          title={title ?? 'Video'}
        />
      </div>
    );
  }

  // Direct video file — Vidstack with full controls
  const wrapperRef = useRef<HTMLDivElement>(null);

  // After mount (and whenever src changes), find the native <video> element
  // that Vidstack renders and apply download/PiP restrictions directly.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // Vidstack renders the <video> inside the shadow DOM or directly in the wrapper
    const video = el.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.setAttribute('controlsList', 'nodownload noremoteplayback');
      video.disablePictureInPicture = true;
    }
  }, [src]);

  return (
    <div ref={wrapperRef} className="relative select-none" onContextMenu={noCtx}>
      <MediaPlayer
        title={title}
        src={src}
        poster={poster}
        className="w-full aspect-video bg-black"
        onTimeUpdate={({ currentTime }: { currentTime: number }) => onTimeUpdate?.(currentTime)}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
