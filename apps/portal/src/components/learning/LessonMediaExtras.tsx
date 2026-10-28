'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Chapter } from '@/components/ui/VideoPlayer';

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Splits "[mm:ss] text" / "[h:mm:ss] text" lines into clickable segments; other lines are plain text. */
function parseTranscript(text: string) {
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const m = line.match(/^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/);
    if (!m) return { at: null as number | null, text: line.trim() };
    const at = m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    return { at, text: m[4] };
  });
}

interface Props {
  chapters?: Chapter[] | null;
  transcript?: string | null;
  /** Present when the video can be controlled (uploaded files); absent for YouTube/Vimeo embeds. */
  onSeek?: (seconds: number) => void;
}

/** Chapter list and collapsible, searchable transcript shown under the lesson video. */
export function LessonMediaExtras({ chapters, transcript, onSeek }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const lines = useMemo(() => (transcript ? parseTranscript(transcript) : []), [transcript]);
  const shown = query.trim() ? lines.filter(l => l.text.toLowerCase().includes(query.trim().toLowerCase())) : lines;

  if (!chapters?.length && !lines.length) return null;

  return (
    <div className="space-y-4">
      {!!chapters?.length && (
        <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] overflow-hidden">
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--pl-sub)]">Chapters</p>
          <ol className="pb-2">
            {chapters.map((c, i) => (
              <li key={c.startSec}>
                <button
                  type="button"
                  disabled={!onSeek}
                  onClick={() => onSeek?.(c.startSec)}
                  className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm hover:bg-[var(--pl-card-h)] disabled:cursor-default disabled:hover:bg-transparent transition"
                >
                  <span className="w-5 text-xs text-[var(--pl-faint)]">{i + 1}</span>
                  <span className="font-mono text-xs text-azure w-12">{fmt(c.startSec)}</span>
                  <span className="flex-1 truncate">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
          {!onSeek && (
            <p className="px-5 pb-3 text-[11px] text-[var(--pl-faint)]">Use the video’s own timeline to jump to a chapter.</p>
          )}
        </div>
      )}

      {!!lines.length && (
        <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="notebook" size={15} className="text-azure" /> Transcript
            </span>
            <Icon name="chevronDown" size={14} className={`text-[var(--pl-sub)] transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="border-t border-[var(--pl-divider)]">
              <div className="px-5 pt-3">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search the transcript…"
                  aria-label="Search the transcript"
                  className="w-full rounded-xl border border-[var(--pl-divider)] bg-[var(--pl-input)] px-3.5 py-2 text-sm outline-none focus:border-azure"
                />
              </div>
              <div className="max-h-80 overflow-y-auto px-5 py-3 space-y-2">
                {shown.length === 0 ? (
                  <p className="text-sm text-[var(--pl-sub)]">No matches.</p>
                ) : shown.map((l, i) => (
                  <p key={i} className="text-sm leading-relaxed text-[var(--pl-sub)]">
                    {l.at !== null && (
                      <button
                        type="button"
                        disabled={!onSeek}
                        onClick={() => onSeek?.(l.at!)}
                        className="mr-2 font-mono text-xs text-azure hover:underline disabled:no-underline disabled:cursor-default"
                      >
                        {fmt(l.at)}
                      </button>
                    )}
                    {l.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
