'use client';
import { parseVideoUrl } from '@cpa/shared';

interface VideoEmbedProps {
  url: string | null | undefined;
  title?: string;
  className?: string;
}

/** Plays YouTube/Vimeo links via their embed players and direct files via <video>. */
export function VideoEmbed({ url, title = 'Intro video', className = '' }: VideoEmbedProps) {
  const parsed = parseVideoUrl(url);
  if (!parsed) {
    return url ? (
      <div className={`flex aspect-video items-center justify-center rounded-xl bg-surface text-xs text-royal/50 ${className}`}>
        This video link can’t be played. Use a YouTube or Vimeo link, or upload the file.
      </div>
    ) : null;
  }

  if (parsed.kind === 'file') {
    return (
      <video src={parsed.src} controls playsInline preload="metadata"
        className={`w-full aspect-video rounded-xl bg-black object-contain ${className}`} />
    );
  }

  return (
    <div className={`relative w-full aspect-video overflow-hidden rounded-xl bg-black ${className}`}>
      <iframe
        src={parsed.embedUrl}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
