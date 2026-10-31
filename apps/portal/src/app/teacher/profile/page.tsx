'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { notify } from '@/lib/notify';
import { uploadVideo } from '@/lib/uploadVideo';
import api from '@/lib/api';
import { parseVideoUrl } from '@cpa/shared';
import { PayoutCard, type Payout } from '@/components/payout/PayoutCard';

interface Profile {
  id: string; email: string; name: string | null; firstName: string | null; lastName: string | null;
  avatarUrl: string | null; bio: string | null; videoIntroUrl: string | null; countryId: string | null;
  teacherApplication: { subjectAreas: string[]; yearsExperience: number | null } | null;
  teachingSubjects: { id: string; name: string }[];
  platformCourses: { id: string; status: string }[];
  avgRating: number | null; reviewCount: number; studentCount: number;
}
const input = 'h-[38px] rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure disabled:bg-subtle disabled:text-ink2';
const card = 'flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]';
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);

export default function TeacherProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [payout, setPayout] = useState<Payout | null | undefined>(undefined);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [about, setAbout] = useState({ name: '', bio: '', countryId: '' });
  const [savingAbout, setSavingAbout] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [preview, setPreview] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/teachers/me/profile').then(r => {
      const d: Profile = r.data;
      setP(d);
      setAbout({ name: d.name || [d.firstName, d.lastName].filter(Boolean).join(' '), bio: d.bio ?? '', countryId: d.countryId ?? '' });
    }).catch(() => notify.error('Could not load your profile'));
    api.get('/payout-accounts/me').then(r => setPayout(r.data || null)).catch(() => setPayout(null));
    api.get('/auth/me/preferences').then(r => setCountries(r.data.countries ?? [])).catch(() => {});
  }, []);

  const subjects = p ? (p.teachingSubjects.length ? p.teachingSubjects.map(s => s.name) : p.teacherApplication?.subjectAreas ?? []) : [];
  const steps = p ? [
    { done: !!p.avatarUrl, todo: 'add a photo' },
    { done: (p.bio ?? '').trim().length >= 100, todo: 'write a bio of at least 100 characters' },
    { done: subjects.length > 0, todo: 'choose your subjects' },
    { done: !!p.videoIntroUrl, todo: 'add an intro video' },
    { done: !!payout, todo: 'add your payout account so you can be paid' },
  ] : [];
  const doneCount = steps.filter(s => s.done).length;
  const todo = steps.filter(s => !s.done);

  async function saveAbout() {
    if (about.bio.trim() && about.bio.trim().length < 100) { notify.error('Write at least 100 characters in your bio'); return; }
    setSavingAbout(true);
    try {
      await api.patch('/auth/me', { name: about.name.trim() || undefined, bio: about.bio.trim(), countryId: about.countryId || undefined });
      setP(prev => prev ? { ...prev, name: about.name.trim() || prev.name, bio: about.bio.trim(), countryId: about.countryId || prev.countryId } : prev);
      notify.success('Profile saved');
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSavingAbout(false); }
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/files/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url ?? r.data?.fileUrl ?? r.data;
      await api.patch('/auth/me', { avatarUrl: url });
      setP(prev => prev ? { ...prev, avatarUrl: url } : prev); notify.success('Photo updated');
    } catch { notify.error('Upload failed'); } finally { setUploadingPhoto(false); }
  }

  const displayName = about.name || p?.email.split('@')[0] || '';
  const initials = displayName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My profile" subtitle="What students see, and where your earnings are paid"
        actions={<Button variant="secondary" size="sm" onClick={() => setPreview(true)} disabled={!p}>See it as a student</Button>} />
      {!p ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7 lg:my-6" /> : (
        <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <section className={clsx('flex flex-col gap-2 rounded-lg border bg-white px-[18px] py-4', todo.length ? 'border-azure' : 'border-line')}>
              <div className="flex flex-wrap justify-between gap-2"><strong className="text-[15px] text-navy">Profile {doneCount} of {steps.length} done</strong><span className="text-[13px] text-muted">Complete profiles get more mentorship bookings</span></div>
              <span className="block h-1.5 rounded-full bg-subtle"><span className="block h-1.5 rounded-full bg-azure" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
              <p className="text-[13px] text-ink2">{todo.length ? <>Still to do: <strong className="text-navy">{todo.map(t => t.todo).join(', ')}</strong>.</> : 'Everything’s done. Students see your full profile.'}</p>
            </section>

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-navy">About you</h2>
                <span className="flex items-center gap-2.5">
                  {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong">{initials}</span>}
                  <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} />
                  <button onClick={() => photoRef.current?.click()} className="text-[13px] font-semibold text-azure-strong hover:underline">{uploadingPhoto ? 'Uploading…' : p.avatarUrl ? 'Change photo' : 'Add photo'}</button>
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Name shown to students"><input className={input} value={about.name} onChange={e => setAbout({ ...about, name: e.target.value })} placeholder="Mr A. Tabi" maxLength={80} /></Field>
                <Field label="Subjects" hint="Ask an admin to change your subjects."><input className={input} value={subjects.join(', ') || 'Not set'} disabled /></Field>
                <Field label="Years teaching"><input className={input} value={p.teacherApplication?.yearsExperience ?? '—'} disabled /></Field>
                <Field label="Country">
                  <select className={input} value={about.countryId} onChange={e => setAbout({ ...about, countryId: e.target.value })}>
                    <option value="">Choose…</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Bio" hint={`${about.bio.trim().length} characters · at least 100`}>
                <textarea rows={4} value={about.bio} onChange={e => setAbout({ ...about, bio: e.target.value })} maxLength={2000}
                  placeholder="Mathematics teacher with 9 years of WASSCE and GCE exam preparation…" className="min-h-16 resize-y rounded-md border border-line p-2.5 text-[13.5px] text-ink2 outline-none focus:border-azure" />
              </Field>
              <div><Button size="sm" onClick={saveAbout} loading={savingAbout}>Save profile</Button></div>
            </section>

            <IntroVideo url={p.videoIntroUrl} onChange={url => setP(prev => prev ? { ...prev, videoIntroUrl: url } : prev)} />
          </div>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            <PayoutCard payout={payout} countries={countries} onSaved={setPayout} />
            <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">What students see</h3>
              <p className="text-[13px] text-navy">
                <strong>{p.avgRating != null ? `${p.avgRating} ★` : 'No ratings yet'}</strong>
                <span className="text-muted"> · {p.reviewCount} rating{p.reviewCount === 1 ? '' : 's'} · {p.studentCount} student{p.studentCount === 1 ? '' : 's'} · {p.platformCourses.filter(c => c.status === 'PUBLISHED').length} course{p.platformCourses.filter(c => c.status === 'PUBLISHED').length === 1 ? '' : 's'}</span>
              </p>
            </section>
          </aside>
        </div>
      )}

      {preview && p && (
        <Dialog open onOpenChange={o => { if (!o) setPreview(false); }}>
          <DialogContent title="How students see you" size="lg">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3.5">
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-16 w-16 rounded-[10px] object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-[10px] bg-accent-soft text-xl font-extrabold text-azure-strong">{initials}</span>}
                <div>
                  <p className="text-lg font-extrabold text-navy">{displayName}</p>
                  <p className="text-[13px] text-ink2">{[subjects.join(', '), p.teacherApplication?.yearsExperience ? `${p.teacherApplication.yearsExperience} years teaching` : ''].filter(Boolean).join(' · ')}</p>
                  <p className="text-[13px] text-muted">{p.avgRating != null ? `${p.avgRating} ★ · ${p.reviewCount} ratings` : 'No ratings yet'}</p>
                </div>
              </div>
              {p.videoIntroUrl && <VideoEmbed url={p.videoIntroUrl} />}
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink2">{about.bio || 'No bio yet.'}</p>
            </div>
            <DialogFooter><Button size="sm" variant="secondary" onClick={() => setPreview(false)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function IntroVideo({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const [replacing, setReplacing] = useState(false);
  const [link, setLink] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setProgress(0);
    try {
      const u = await uploadVideo(file, setProgress);
      await api.patch('/teachers/me/profile', { videoIntroUrl: u });
      onChange(u); setReplacing(false); notify.success('Intro video uploaded');
    } catch (e: any) { notify.error(e?.response?.data?.message ?? e?.message ?? 'Upload failed'); } finally { setProgress(null); }
  }, [onChange]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'], 'video/webm': ['.webm'] },
    maxSize: 100 * 1024 * 1024, multiple: false, disabled: progress !== null,
    onDropAccepted: ([f]) => handleFile(f),
    onDropRejected: ([r]) => notify.error(r?.errors[0]?.code === 'file-too-large' ? 'Video must be 100 MB or smaller' : 'Use an MP4, MOV or WebM video'),
  });

  async function saveLink(value: string) {
    const v = value.trim();
    if (v && !parseVideoUrl(v)) { notify.error('Paste a YouTube or Vimeo link'); return; }
    setSaving(true);
    try {
      const { data } = await api.patch('/teachers/me/profile', { videoIntroUrl: v || null });
      onChange(data?.videoIntroUrl ?? null); setLink(''); setReplacing(false);
      notify.success(v ? 'Intro video saved' : 'Intro video removed');
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }

  const editing = replacing || !url;
  return (
    <section className={card}>
      <div className="flex justify-between">
        <h2 className="text-base font-bold text-navy">Intro video</h2>
        {url && <span className="flex gap-3 text-[13px] font-semibold">
          <button onClick={() => setReplacing(r => !r)} className="text-azure-strong hover:underline">{replacing ? 'Cancel' : 'Replace'}</button>
          <button onClick={() => { if (confirm('Remove your intro video?')) saveLink(''); }} className="text-muted hover:text-navy">Remove</button>
        </span>}
      </div>
      {url && !replacing ? <VideoEmbed url={url} /> : (
        <div className="flex flex-col gap-2.5">
          <div {...(getRootProps() as React.HTMLAttributes<HTMLDivElement>)}
            className={clsx('grid h-40 cursor-pointer place-items-center rounded-md border border-dashed px-4 text-center text-[13px]', isDragActive ? 'border-azure bg-accent-soft' : 'border-line bg-subtle')}>
            <input {...getInputProps()} />
            {progress !== null ? <span className="text-navy">Uploading… {progress}%</span>
              : <span className="text-ink2">Your 1-minute intro · students see it before booking<br /><strong className="text-azure-strong">Upload a video</strong> (MP4, MOV or WebM, up to 100 MB)</span>}
          </div>
          {editing && (
            <div className="flex gap-2">
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="…or paste a YouTube or Vimeo link" className={clsx(input, 'min-w-0 flex-1')} />
              <Button size="sm" variant="secondary" onClick={() => saveLink(link)} loading={saving} disabled={!link.trim()}>Save link</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
