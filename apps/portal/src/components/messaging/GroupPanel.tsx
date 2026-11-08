'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { VoicePlayer } from './Voice';

export interface GroupMember { id: string; name: string; avatarUrl: string | null; role: string; groupRole: 'ADMIN' | 'MEMBER'; isCohortTeacher: boolean; online: boolean; lastSeen: string | null; isMe: boolean }
export interface GroupInfo {
  id: string; kind: 'cohort' | 'group'; name: string; description: string | null; photoUrl: string | null; createdBy: string | null; createdAt: string;
  settings: { onlyAdminsSend: boolean; onlyAdminsEdit: boolean; membersCanAdd: boolean };
  pinned: { id: string; text: string; by: string } | null;
  members: GroupMember[]; me: { admin: boolean; muted: boolean; member: boolean };
  can: { edit: boolean; add: boolean; manage: boolean; leave: boolean };
  media: { photos: number; voice: number; files: number };
}
interface Pick { id: string; name: string; avatarUrl: string | null; role: string; context: string }

const err = (e: any, fallback: string) => notify.error(e?.response?.data?.message ?? fallback);
const ROLE: Record<string, string> = { TEACHER: 'Teacher', STUDENT: 'Student', ADMIN: 'CareerPath', COUNTRY_REP: 'Country rep', SUBJECT_REVIEWER: 'Reviewer' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export function GroupAvatar({ name, photoUrl, size = 40 }: { name: string; photoUrl: string | null; size?: number }) {
  if (photoUrl) return <img src={photoUrl} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  return <span aria-hidden className="grid shrink-0 place-items-center rounded-xl bg-azure-strong font-extrabold text-on-accent" style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials(name)}</span>;
}

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-center gap-3 border-b border-line py-3', disabled && 'opacity-60')}>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy">{label}</span><span className="block text-[12.5px] text-muted">{hint}</span></span>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
        className={clsx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors', on ? 'bg-azure-strong' : 'bg-line')}>
        <span className={clsx('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-[2px]')} />
      </button>
    </label>
  );
}

/** Group info: name, photo, description, members, shared media and settings. Opens beside the chat. */
export function GroupInfoPanel({ threadId, onClose, onChanged, onMessage, onLeft }: { threadId: string; onClose: () => void; onChanged: () => void; onMessage: (personId: string) => void; onLeft: () => void }) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [tab, setTab] = useState<'members' | 'media' | 'settings'>('members');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [memberQ, setMemberQ] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(() => api.get(`/messages/threads/${threadId}/info`).then(r => setInfo(r.data)).catch(e => err(e, 'Could not load the group')), [threadId]);
  useEffect(() => { setInfo(null); setTab('members'); load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    try { const r = await api.patch(`/messages/threads/${threadId}/info`, body); setInfo(r.data); onChanged(); }
    catch (e) { err(e, 'Could not save'); }
  }
  async function act(fn: () => Promise<unknown>, done: string) {
    try { await fn(); notify.success(done); setMenuFor(null); await load(); onChanged(); } catch (e) { err(e, 'That didn’t work'); }
  }
  async function photo(f: File | undefined) {
    if (!f) return;
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await api.post('/files/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await patch({ photoUrl: up.data.url });
    } catch (e) { err(e, 'Could not upload the photo'); }
  }

  if (!info) return <aside className="flex w-full flex-col gap-3 border-l border-line bg-white p-5 lg:w-[380px]"><div className="h-24 animate-pulse rounded-lg bg-subtle" /><div className="h-64 animate-pulse rounded-lg bg-subtle" /></aside>;
  const shown = info.members.filter(m => !memberQ.trim() || m.name.toLowerCase().includes(memberQ.trim().toLowerCase()));

  return (
    <aside aria-label="Group info" className="flex w-full min-w-0 flex-col overflow-y-auto border-l border-line bg-white lg:w-[380px] lg:shrink-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button onClick={onClose} className="rounded-md p-1 text-navy hover:bg-subtle" aria-label="Close group info"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <strong className="text-[15px] text-navy">Group info</strong>
      </div>

      <div className="flex flex-col items-center gap-1.5 border-b border-line px-5 pb-4 pt-5 text-center">
        <label className={clsx('relative', info.can.edit && 'cursor-pointer')} title={info.can.edit ? 'Change the group photo' : undefined}>
          <GroupAvatar name={info.name} photoUrl={info.photoUrl} size={84} />
          {info.can.edit && <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Change the group photo" onChange={e => { photo(e.target.files?.[0]); e.target.value = ''; }} />}
        </label>
        {editing ? (
          <EditInfo info={info} onCancel={() => setEditing(false)} onSave={async b => { await patch(b); setEditing(false); }} />
        ) : <>
          <strong className="text-[18px] text-navy">{info.name}</strong>
          <span className="text-[12.5px] text-muted">{info.kind === 'cohort' ? 'Cohort group' : 'Group'} · {info.members.length} members{info.createdBy ? ` · made by ${info.createdBy}` : ''}</span>
          {info.description && <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-ink2">{info.description}</p>}
          {info.can.edit && <button onClick={() => setEditing(true)} className="mt-1 text-[13px] font-semibold text-azure-strong hover:underline">Edit name and description</button>}
        </>}
      </div>

      <div role="tablist" className="flex gap-1 border-b border-line px-3 py-2">
        {([['members', `Members ${info.members.length}`], ['media', 'Media and files'], ['settings', 'Settings']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('h-9 flex-1 rounded-md text-[13px] font-bold', tab === k ? 'bg-accent-soft text-navy' : 'text-muted hover:text-navy')}>{l}</button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="flex flex-col px-3 py-2">
          {info.can.add && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-3 rounded-md px-1.5 py-2.5 text-[14px] font-bold text-azure-strong hover:bg-subtle">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></svg></span>Add members
            </button>
          )}
          {info.kind === 'cohort' && <p className="px-1.5 py-2 text-[12.5px] text-muted">Members come from the cohort: join the cohort, join the group.</p>}
          {info.members.length > 8 && <input value={memberQ} onChange={e => setMemberQ(e.target.value)} placeholder={`Search ${info.members.length} members`} aria-label="Search members" className="my-1.5 h-9 rounded-full border border-line bg-white px-4 text-[13px] text-navy outline-none focus:border-azure" />}
          {shown.map(m => (
            <div key={m.id} className="relative">
              <button disabled={m.isMe} onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left hover:bg-subtle disabled:hover:bg-transparent">
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-extrabold text-azure-strong">{initials(m.name)}</span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-navy">{m.isMe ? 'You' : m.name}</span><span className="block truncate text-[12px] text-muted">{ROLE[m.role] ?? m.role}{m.online ? ' · online' : ''}</span></span>
                {m.groupRole === 'ADMIN' && <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] font-bold text-azure-strong">Group admin</span>}
              </button>
              {menuFor === m.id && (
                <div role="menu" className="absolute right-1 top-11 z-10 flex w-52 flex-col rounded-lg border border-line bg-white p-1.5 shadow-lg">
                  <button role="menuitem" onClick={() => { setMenuFor(null); onMessage(m.id); }} className="rounded-md px-3 py-2 text-left text-[13.5px] text-navy hover:bg-subtle">Message {m.name.split(' ')[0]}</button>
                  {info.can.manage && !m.isCohortTeacher && (m.groupRole === 'ADMIN'
                    ? <button role="menuitem" onClick={() => act(() => api.patch(`/messages/threads/${threadId}/members/${m.id}`, { role: 'MEMBER' }), `${m.name.split(' ')[0]} is no longer a group admin`)} className="rounded-md px-3 py-2 text-left text-[13.5px] text-navy hover:bg-subtle">Remove as group admin</button>
                    : <button role="menuitem" onClick={() => act(() => api.patch(`/messages/threads/${threadId}/members/${m.id}`, { role: 'ADMIN' }), `${m.name.split(' ')[0]} is now a group admin`)} className="rounded-md px-3 py-2 text-left text-[13.5px] text-navy hover:bg-subtle">Make group admin</button>)}
                  {info.can.manage && info.kind === 'group' && <button role="menuitem" onClick={() => act(() => api.delete(`/messages/threads/${threadId}/members/${m.id}`), `${m.name.split(' ')[0]} was removed`)} className="rounded-md px-3 py-2 text-left text-[13.5px] text-red-600 hover:bg-red-50">Remove from group</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'media' && <GroupMedia threadId={threadId} counts={info.media} />}

      {tab === 'settings' && (
        <div className="flex flex-col px-4 pb-4">
          {info.me.member && <Toggle on={info.me.muted} label="Mute notifications" hint="No alerts from this group. You’ll still see new messages here."
            onChange={async v => { try { await api.post(`/messages/threads/${threadId}/mute`, { muted: v }); setInfo({ ...info, me: { ...info.me, muted: v } }); onChanged(); } catch (e) { err(e, 'Could not change that'); } }} />}
          <Toggle on={info.settings.onlyAdminsSend} disabled={!info.can.manage} label="Only admins can send" hint="Members can still read" onChange={v => patch({ onlyAdminsSend: v })} />
          <Toggle on={info.settings.onlyAdminsEdit} disabled={!info.can.manage} label="Only admins can edit group info" hint="Name, photo and description" onChange={v => patch({ onlyAdminsEdit: v })} />
          {info.kind === 'group' && <Toggle on={info.settings.membersCanAdd} disabled={!info.can.manage} label="Members can add others" hint="People they can already message" onChange={v => patch({ membersCanAdd: v })} />}
          {info.pinned && (
            <div className="flex items-center gap-3 border-b border-line py-3">
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy">Pinned message</span><span className="block truncate text-[12.5px] text-muted">{info.pinned.text}</span></span>
              {info.can.manage && <button onClick={() => patch({ pinnedMessageId: null })} className="h-8 shrink-0 rounded-md border border-line px-3 text-[12.5px] font-semibold text-navy">Unpin</button>}
            </div>
          )}
          {!info.can.manage && <p className="pt-3 text-[12.5px] text-muted">Only group admins can change these.</p>}
          {info.can.leave && (confirmLeave ? (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[13.5px] text-navy">Leave “{info.name}”? You’ll stop getting its messages. An admin can add you back.</p>
              <div className="flex gap-2">
                <button onClick={async () => { try { await api.post(`/messages/threads/${threadId}/leave`); notify.success('You left the group'); onLeft(); } catch (e) { err(e, 'Could not leave'); } }} className="h-9 rounded-md bg-red-600 px-3 text-[13px] font-bold text-white">Leave group</button>
                <button onClick={() => setConfirmLeave(false)} className="h-9 rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy">Stay</button>
              </div>
            </div>
          ) : <button onClick={() => setConfirmLeave(true)} className="mt-4 h-10 rounded-md border border-red-300 bg-white text-[13.5px] font-bold text-red-600 hover:bg-red-50">Leave group</button>)}
          {info.kind === 'cohort' && <p className="pt-3 text-[12.5px] text-muted">You stay in this group while you’re in the cohort. Mute it if you’d rather not be notified.</p>}
        </div>
      )}

      {adding && <AddMembersDialog threadId={threadId} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); onChanged(); }} />}
    </aside>
  );
}

function EditInfo({ info, onCancel, onSave }: { info: GroupInfo; onCancel: () => void; onSave: (b: { name: string; description: string }) => void }) {
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description ?? '');
  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ name, description }); }} className="mt-2 flex w-full flex-col gap-2 text-left">
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy">Group name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required minLength={2} className="input-base" /></label>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy">Description<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} className="input-base resize-none py-2" /></label>
      <div className="flex gap-2"><button type="submit" className="h-9 rounded-md bg-azure-strong px-3 text-[13px] font-bold text-on-accent">Save</button><button type="button" onClick={onCancel} className="h-9 rounded-md border border-line px-3 text-[13px] font-semibold text-navy">Cancel</button></div>
    </form>
  );
}

function GroupMedia({ threadId, counts }: { threadId: string; counts: GroupInfo['media'] }) {
  const [kind, setKind] = useState<'photos' | 'files' | 'voice'>('photos');
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); api.get(`/messages/threads/${threadId}/media`, { params: { kind } }).then(r => setRows(r.data)).catch(() => setRows([])); }, [threadId, kind]);
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-1.5">
        {([['photos', `Photos ${counts.photos}`], ['files', `Files ${counts.files}`], ['voice', `Voice notes ${counts.voice}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={clsx('rounded-full px-3 py-1 text-[12.5px] font-semibold', kind === k ? 'bg-accent-soft text-navy' : 'bg-subtle text-muted')}>{l}</button>
        ))}
      </div>
      {!rows ? <div className="h-32 animate-pulse rounded-lg bg-subtle" /> : !rows.length ? <p className="py-6 text-center text-[13px] text-muted">Nothing shared yet.</p>
        : kind === 'photos' ? (
          <div className="grid grid-cols-3 gap-1.5">{rows.map(m => m.attachmentUrl ? <a key={m.id} href={m.attachmentUrl} target="_blank" rel="noreferrer"><img src={m.attachmentUrl} alt={m.attachmentName ?? 'Photo'} className="aspect-square w-full rounded-md object-cover" loading="lazy" /></a> : <span key={m.id} className="aspect-square rounded-md bg-subtle" />)}</div>
        ) : rows.map(m => (
          <div key={m.id} className="flex flex-col gap-1 rounded-md bg-subtle p-2.5">
            {kind === 'voice' ? <VoicePlayer src={m.attachmentUrl} duration={m.attachmentDuration ?? 0} wave={m.attachmentWave} /> :
              <a href={m.attachmentUrl ?? undefined} target="_blank" rel="noreferrer" className="truncate text-[13.5px] font-semibold text-azure-strong hover:underline">{m.attachmentName}</a>}
            <span className="text-[11.5px] text-muted">{m.senderName} · {new Date(m.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </div>
        ))}
    </div>
  );
}

/** Choose people to add: those you can message who aren't in the group yet */
function AddMembersDialog({ threadId, onClose, onAdded }: { threadId: string; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Pick[] | null>(null);
  const [chosen, setChosen] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => api.get(`/messages/threads/${threadId}/candidates`, { params: { q: q || undefined } }).then(r => setPeople(r.data)).catch(e => { setPeople([]); err(e, 'Could not load people'); }), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, threadId]);
  const toggle = (p: Pick) => setChosen(c => c.some(x => x.id === p.id) ? c.filter(x => x.id !== p.id) : [...c, p]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Add members" description="People you can message who aren’t in the group yet.">
        <PeoplePicker q={q} setQ={setQ} people={people} chosen={chosen} toggle={toggle} />
        <button disabled={!chosen.length || busy} onClick={async () => { setBusy(true); try { const r = await api.post(`/messages/threads/${threadId}/members`, { userIds: chosen.map(c => c.id) }); notify.success(`Added ${r.data.added}`); onAdded(); } catch (e) { err(e, 'Could not add them'); } finally { setBusy(false); } }}
          className="mt-3 h-11 w-full rounded-md bg-azure-strong text-[14px] font-bold text-on-accent disabled:opacity-50">{busy ? 'Adding…' : chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}` : 'Choose people to add'}</button>
      </DialogContent>
    </Dialog>
  );
}

function PeoplePicker({ q, setQ, people, chosen, toggle }: { q: string; setQ: (v: string) => void; people: Pick[] | null; chosen: Pick[]; toggle: (p: Pick) => void }) {
  return <>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name" autoFocus aria-label="Search people" className="input-base mb-2 w-full" />
    {chosen.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{chosen.map(c => <button key={c.id} onClick={() => toggle(c)} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-azure-strong" aria-label={`Remove ${c.name}`}>{c.name} ×</button>)}</div>}
    <div className="flex max-h-[42vh] flex-col overflow-y-auto">
      {!people ? <div className="h-32 animate-pulse rounded bg-subtle" /> : !people.length ? <p className="py-6 text-center text-[13px] text-ink2">No one found.</p> : people.map(p => (
        <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle">
          <input type="checkbox" checked={chosen.some(c => c.id === p.id)} onChange={() => toggle(p)} className="h-[18px] w-[18px] accent-[#3F6FE8]" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-navy">{p.name}</span><span className="block truncate text-xs text-muted">{p.context}</span></span>
        </label>
      ))}
    </div>
  </>;
}

/** Teachers and admins: name the group, then choose people (or start from one of your cohorts) */
export function NewGroupDialog({ role, onClose, onCreated }: { role: string; onClose: () => void; onCreated: (threadId: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Pick[] | null>(null);
  const [chosen, setChosen] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (role === 'teacher') api.get('/portals/teacher/cohorts').then(r => setCohorts(r.data ?? [])).catch(() => {}); }, [role]);
  useEffect(() => {
    if (step !== 2) return;
    const t = setTimeout(() => api.get('/messages/contacts', { params: { q: q || undefined } }).then(r => setPeople((r.data as Pick[]).filter(p => p.role !== 'ADMIN'))).catch(() => setPeople([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, step]);
  const toggle = (p: Pick) => setChosen(c => c.some(x => x.id === p.id) ? c.filter(x => x.id !== p.id) : [...c, p]);
  async function create() {
    setBusy(true);
    try {
      const r = await api.post('/messages/groups', { name, description, memberIds: chosen.map(c => c.id), cohortId: cohortId || undefined });
      notify.success(`Group made with ${r.data.added} ${r.data.added === 1 ? 'person' : 'people'}`);
      onCreated(r.data.threadId);
    } catch (e) { err(e, 'Could not make the group'); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="New group" description={step === 1 ? 'Name it, then choose who’s in it.' : 'Choose people, or start from a whole cohort.'}>
        {step === 1 ? (
          <form onSubmit={e => { e.preventDefault(); setStep(2); }} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Group name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoFocus placeholder="e.g. WASSCE Maths revision · Paper 2" className="input-base" /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Description (optional)<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={2} className="input-base resize-none py-2" /></label>
            <button type="submit" disabled={name.trim().length < 2} className="h-11 rounded-md bg-azure-strong text-[14px] font-bold text-on-accent disabled:opacity-50">Choose members</button>
          </form>
        ) : (
          <div className="flex flex-col">
            {cohorts.length > 0 && (
              <label className="mb-2 flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Start from a cohort (optional)
                <select value={cohortId} onChange={e => setCohortId(e.target.value)} className="input-base"><option value="">No, I’ll choose people</option>{cohorts.map(c => <option key={c.id} value={c.id}>{c.name}: all its students</option>)}</select>
              </label>
            )}
            <PeoplePicker q={q} setQ={setQ} people={people} chosen={chosen} toggle={toggle} />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setStep(1)} className="h-11 rounded-md border border-line px-4 text-[14px] font-semibold text-navy">Back</button>
              <button onClick={create} disabled={busy || (!chosen.length && !cohortId)} className="h-11 flex-1 rounded-md bg-azure-strong text-[14px] font-bold text-on-accent disabled:opacity-50">{busy ? 'Making the group…' : 'Make the group'}</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
