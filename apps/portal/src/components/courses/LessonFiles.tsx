'use client';
import { useRef, useState } from 'react';
import api from '@/lib/api';
import { notify } from '@/lib/notify';

export interface LessonFile { id: string; name: string; url: string; fileType: string | null }

const ACCEPT = '.pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/gif';
const kind = (f: { name: string; fileType: string | null }) => {
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf') || f.fileType === 'application/pdf') return 'PDF';
  if (/\.docx?$/.test(n) || /word/.test(f.fileType ?? '')) return 'Word';
  if (/^image\//.test(f.fileType ?? '') || /\.(png|jpe?g|webp|gif)$/.test(n)) return 'Image';
  return 'File';
};
const COLOUR: Record<string, string> = { PDF: 'bg-[#FDE8E8] text-[#A12A2A]', Word: 'bg-[#EAF0FF] text-[#2F57C9]', Image: 'bg-[#E3F5EC] text-[#1A7F4B]', File: 'bg-cloud text-royal/70' };

/** PDFs, Word files and pictures students can open or download under the lesson */
export function LessonFiles({ courseId, moduleId, lessonId, initial }: { courseId: string; moduleId: string; lessonId: string; initial: LessonFile[] }) {
  const [files, setFiles] = useState<LessonFile[]>(initial ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function add(list: File[]) {
    for (const f of list) {
      if (f.size > 10 * 1024 * 1024) { notify.error(`${f.name} is over 10 MB`); continue; }
      setBusy(`Uploading ${f.name}…`);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const up = await api.post('/files/upload?folder=lesson-files', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
        const r = await api.post(`/platform-courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/attachments`, { name: f.name, url: up.data.url, fileType: f.type || null });
        setFiles(x => [...x, r.data]);
      } catch (e: any) { notify.error(e?.response?.data?.message ?? `Could not upload ${f.name}`); }
    }
    setBusy(null);
  }

  async function remove(f: LessonFile) {
    setBusy(`Removing ${f.name}…`);
    try { await api.delete(`/platform-courses/attachments/${f.id}`); setFiles(x => x.filter(y => y.id !== f.id)); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not remove it'); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-xl border border-dashed border-cloud bg-white p-3"
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void add([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-navy">Files for students</span>
        <span className="text-[11px] text-royal/40">PDF, Word or pictures · up to 10 MB each · students open or download them under the lesson</span>
        <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
          className="ml-auto rounded-lg border border-azure/40 bg-azure/10 px-2.5 py-1 text-[11px] font-bold text-azure hover:bg-azure hover:text-white transition disabled:opacity-50">
          Attach files
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={e => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void add(l); }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg bg-cloud/40 px-2.5 py-1.5 text-xs">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${COLOUR[kind(f)]}`}>{kind(f)}</span>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-navy hover:underline">{f.name}</a>
              <button type="button" disabled={!!busy} onClick={() => remove(f)} className="text-[11px] font-semibold text-red-500 hover:underline disabled:opacity-50">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {!files.length && !busy && <p className="mt-1.5 text-[11px] text-royal/40">Drop files here, or use Attach files.</p>}
      {busy && <p className="mt-1.5 text-[11px] font-semibold text-azure" role="status">{busy}</p>}
    </div>
  );
}
