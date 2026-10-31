'use client';
import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface EditableProfile {
  id: string; email: string; role: string; name: string | null; firstName: string | null; lastName: string | null;
  phone: string | null; avatarUrl: string | null; bio: string | null; countryId: string | null; createdAt: string;
  country: { name: string; currency: string; repCommissionPercent: number | null; perStudentBonus: number | null } | null;
  subjects: string[];
}

const input = 'h-[38px] rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure disabled:bg-subtle disabled:text-ink2';
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);

/**
 * Photo, names, phone and a short text about the person, saved through PATCH /auth/me.
 * `extra` renders read-only fields (subjects, country) in the same grid.
 */
export function AboutYou({ p, onSaved, phoneLabel = 'Phone', bioLabel, bioPlaceholder, extra }: {
  p: EditableProfile; onSaved: (p: EditableProfile) => void;
  phoneLabel?: string; bioLabel: string; bioPlaceholder: string;
  extra?: { label: string; value: string; hint?: string }[];
}) {
  const [f, setF] = useState({ firstName: p.firstName ?? '', lastName: p.lastName ?? '', phone: p.phone ?? '', bio: p.bio ?? '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const display = `${f.firstName} ${f.lastName}`.trim() || p.email;
  const initials = display.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  async function save() {
    setSaving(true);
    try {
      const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim();
      await api.patch('/auth/me', { firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim(), bio: f.bio.trim(), ...(name && { name }) });
      onSaved({ ...p, ...f, name: name || p.name });
      notify.success('Profile saved');
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/files/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url ?? r.data?.fileUrl ?? r.data;
      await api.patch('/auth/me', { avatarUrl: url });
      onSaved({ ...p, avatarUrl: url }); notify.success('Photo updated');
    } catch { notify.error('Upload failed'); } finally { setUploading(false); }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">About you</h2>
        <span className="flex items-center gap-2.5">
          {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong">{initials}</span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) upload(x); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-azure-strong hover:underline">{uploading ? 'Uploading…' : p.avatarUrl ? 'Change photo' : 'Add photo'}</button>
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="First name"><input className={input} value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Last name"><input className={input} value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="Email" hint="Contact support to change it."><input className={input} value={p.email} disabled /></Field>
        <Field label={phoneLabel}><input className={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+233 24 000 0000" inputMode="tel" /></Field>
        {extra?.map(x => <Field key={x.label} label={x.label} hint={x.hint}><input className={input} value={x.value} disabled /></Field>)}
      </div>
      <Field label={bioLabel}>
        <textarea rows={3} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} maxLength={2000} placeholder={bioPlaceholder}
          className={clsx('min-h-[60px] resize-y rounded-md border border-line p-2.5 text-[13.5px] text-ink2 outline-none focus:border-azure')} />
      </Field>
      <div><Button size="sm" onClick={save} loading={saving}>Save profile</Button></div>
    </section>
  );
}
