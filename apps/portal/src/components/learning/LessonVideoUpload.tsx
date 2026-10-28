'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { uploadVideo } from '@/lib/uploadVideo';

/** Upload a lesson video file straight to storage; reports the stored URL. */
export function LessonVideoUpload({ label, hint, onUploaded }: {
  label: string; hint?: string; onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(''); setPct(0);
    try {
      onUploaded(await uploadVideo(file, setPct, 'lesson'));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Upload failed. Please try again.');
    } finally {
      setPct(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1">
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden"
        onChange={e => onFile(e.target.files?.[0])} />
      <button type="button" disabled={pct !== null} onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-azure hover:text-azure transition disabled:opacity-60">
        <Icon name="upload" size={13} /> {pct !== null ? `Uploading… ${pct}%` : label}
      </button>
      {hint && !error && <p className="text-[10px] text-royal/40">{hint}</p>}
      {error && <p role="alert" className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
