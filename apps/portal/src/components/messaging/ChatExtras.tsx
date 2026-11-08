'use client';
import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { EmojiPicker } from './EmojiPicker';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'];
/** Edit your own message for this long; delete it for everyone for this long */
export const EDIT_MINS = 15;
export const DELETE_MINS = 60;

export interface ReplyRef { id: string; senderName: string; body: string; deleted: boolean; attachmentType: string | null; attachmentName: string | null; attachmentDuration: number | null }
export interface Reaction { emoji: string; count: number; mine: boolean }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What a quoted message shows */
export function quoteText(r: Pick<ReplyRef, 'body' | 'deleted' | 'attachmentType' | 'attachmentName' | 'attachmentDuration'>) {
  if (r.deleted) return 'This message was deleted';
  if (r.body) return r.body;
  if (r.attachmentType?.startsWith('audio/')) return `Voice note (${clock(r.attachmentDuration ?? 0)})`;
  if (r.attachmentType?.startsWith('image/')) return 'Photo';
  return r.attachmentName ?? 'File';
}

/** Message text with @tags picked out */
export function MentionText({ text, names, own }: { text: string; names: string[]; own: boolean }) {
  const tags = ['everyone', ...names].filter(Boolean).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!text.includes('@')) return <>{text}</>;
  const parts = text.split(new RegExp(`(@(?:${tags.join('|')}))`, 'g'));
  return <>{parts.map((p, i) => p.startsWith('@') && tags.some(t => new RegExp(`^@${t}$`).test(p))
    ? <span key={i} className={clsx('rounded px-0.5 font-bold', own ? 'bg-white/20' : 'bg-accent-soft text-azure-strong')}>{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

export function ReplyQuote({ r, own, onJump }: { r: ReplyRef; own: boolean; onJump: () => void }) {
  return (
    <button type="button" onClick={onJump} className={clsx('mb-1 block w-full rounded-md border-l-[3px] px-2.5 py-1.5 text-left text-[12.5px]', own ? 'border-white bg-white/15' : 'border-azure-strong bg-subtle')}>
      <span className={clsx('block font-bold', own ? 'text-white' : 'text-azure-strong')}>{r.senderName}</span>
      <span className={clsx('line-clamp-2', r.deleted && 'italic', own ? 'text-white/85' : 'text-ink2')}>{quoteText(r)}</span>
    </button>
  );
}

export function ReactionChips({ list, own, onToggle }: { list: Reaction[]; own: boolean; onToggle: (emoji: string) => void }) {
  if (!list?.length) return null;
  return (
    <div className={clsx('-mt-1 mb-1 flex flex-wrap gap-1 px-1', own ? 'justify-end' : 'justify-start')}>
      {list.map(r => (
        <button key={r.emoji} type="button" onClick={() => onToggle(r.emoji)} aria-pressed={r.mine} aria-label={`${r.emoji} ${r.count}${r.mine ? ', yours' : ''}`}
          className={clsx('rounded-full border px-2 py-0.5 text-[12.5px] shadow-sm', r.mine ? 'border-azure bg-accent-soft' : 'border-line bg-white')}>{r.emoji} <span className="text-[11.5px] font-semibold text-ink2">{r.count}</span></button>
      ))}
    </div>
  );
}

export interface MenuActions { reply?: () => void; react?: (e: string) => void; star?: () => void; starred?: boolean; copy?: () => void; edit?: () => void; pin?: () => void; info?: () => void; remove?: () => void; record?: () => void }

/** The menu for one message: reactions on top, then what you can do with it */
export function MessageMenu({ own, a, onClose }: { own: boolean; a: MenuActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[aria-label="Emoji"]')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  const item = (label: string, fn: (() => void) | undefined, danger = false) => fn && (
    <button role="menuitem" onClick={() => { onClose(); fn(); }} className={clsx('rounded-md px-3 py-2 text-left text-[13.5px] hover:bg-subtle', danger ? 'text-red-600' : 'text-navy')}>{label}</button>
  );
  return (
    <div ref={ref} role="menu" aria-label="Message menu" className={clsx('absolute top-full z-30 mt-1 flex w-60 max-w-[86vw] flex-col rounded-xl border border-line bg-white p-1.5 text-left shadow-xl', own ? 'right-0' : 'left-0')}>
      {a.react && <div className="flex justify-between gap-0.5 border-b border-line px-1 pb-1.5 pt-0.5">
        {REACTIONS.slice(0, 6).map(e => <button key={e} role="menuitem" aria-label={`React ${e}`} onClick={() => { onClose(); a.react!(e); }} className="grid h-8 w-8 place-items-center rounded-full text-[17px] hover:bg-subtle">{e}</button>)}
        <button role="menuitem" aria-label="More reactions" onClick={() => setMore(m => !m)} className={clsx('grid h-8 w-8 place-items-center rounded-full text-[18px] font-bold text-muted hover:bg-subtle', more && 'bg-accent-soft text-azure-strong')}>+</button>
      </div>}
      {more && a.react && <EmojiPicker className="absolute left-0 top-full mt-1" onPick={e => { onClose(); a.react!(e); }} onClose={() => setMore(false)} />}
      {item('Reply', a.reply)}
      {item(a.starred ? 'Unstar' : 'Star', a.star)}
      {item('Copy', a.copy)}
      {item(`Edit (for ${EDIT_MINS} minutes)`, a.edit)}
      {item('Pin in this group', a.pin)}
      {item('Message info', a.info)}
      {item('Show original (admin record)', a.record)}
      {item('Delete for everyone', a.remove, true)}
    </div>
  );
}

/** Who read a message: for its sender */
export function MessageInfoDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [info, setInfo] = useState<{ sentAt: string; editedAt: string | null; readBy: { id: string; name: string; at: string }[]; notYet: { id: string; name: string }[] } | null>(null);
  useEffect(() => { api.get(`/messages/items/${id}/info`).then(r => setInfo(r.data)).catch(e => { notify.error(e?.response?.data?.message ?? 'Could not load'); onClose(); }); }, [id, onClose]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Message info" description={info ? `Sent ${fmt(info.sentAt)}${info.editedAt ? `, edited ${fmt(info.editedAt)}` : ''}` : 'Loading…'}>
        {!info ? <div className="h-32 animate-pulse rounded bg-subtle" /> : (
          <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Read by {info.readBy.length}</p>
            {info.readBy.map(p => <p key={p.id} className="flex justify-between py-1 text-[14px] text-navy"><span>{p.name}</span><span className="text-muted">{fmt(p.at)}</span></p>)}
            {!!info.notYet.length && <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Not read yet {info.notYet.length}</p>}
            {info.notYet.map(p => <p key={p.id} className="py-1 text-[14px] text-ink2">{p.name}</p>)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Admins: the full record of a message, including deleted content and every earlier version */
export function RecordDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [rec, setRec] = useState<any>(null);
  useEffect(() => { api.get(`/messages/items/${id}/record`).then(r => setRec(r.data)).catch(e => { notify.error(e?.response?.data?.message ?? 'Could not load the record'); onClose(); }); }, [id, onClose]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Message record" description="Kept for traceability. Only administrators can see this.">
        {!rec ? <div className="h-32 animate-pulse rounded bg-subtle" /> : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-[13.5px]">
            <p className="text-ink2"><strong className="text-navy">{rec.sender.name}</strong> ({rec.sender.email}) · sent {fmt(rec.sentAt)}</p>
            {rec.deletedAt && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">Deleted for everyone by {rec.deletedBy ?? 'someone'} on {fmt(rec.deletedAt)}</p>}
            <div className="flex flex-col gap-2">
              {rec.versions.map((v: any, i: number) => (
                <div key={i} className="rounded-md border border-line px-3 py-2">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">{rec.versions.length === 1 ? 'Text' : i === rec.versions.length - 1 ? 'Latest version' : `Version ${i + 1} · until ${fmt(v.until)}`}</p>
                  <p className="whitespace-pre-wrap text-navy">{v.body || <em className="text-muted">(no text)</em>}</p>
                </div>
              ))}
            </div>
            {rec.attachmentName && <p className="text-ink2">Attachment: {rec.attachmentUrl ? <a href={rec.attachmentUrl} target="_blank" rel="noreferrer" className="font-semibold text-azure-strong underline">{rec.attachmentName}</a> : rec.attachmentName}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Search inside the open chat; ‹ › step through the matches, newest first */
export function ChatSearch({ threadId, onJump, onClose }: { threadId: string; onJump: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string }[] | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => api.get(`/messages/threads/${threadId}/search`, { params: { q } }).then(r => { setHits(r.data); setAt(0); if (r.data[0]) onJump(r.data[0].id); }).catch(() => setHits([])), 350);
    return () => clearTimeout(t);
  }, [q, threadId]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: number) => { if (!hits?.length) return; const n = (i + hits.length) % hits.length; setAt(n); onJump(hits[n].id); };
  return (
    <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2 lg:px-5">
      <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search in this chat" aria-label="Search in this chat"
        onKeyDown={e => { if (e.key === 'Enter') go(at + 1); if (e.key === 'Escape') onClose(); }}
        className="h-9 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[13.5px] text-navy outline-none focus:border-azure" />
      <span className="shrink-0 text-[12.5px] tabular-nums text-muted">{hits ? (hits.length ? `${at + 1} of ${hits.length}` : 'No matches') : ''}</span>
      <button onClick={() => go(at + 1)} disabled={!hits?.length} aria-label="Older match" className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-navy disabled:opacity-40">‹</button>
      <button onClick={() => go(at - 1)} disabled={!hits?.length} aria-label="Newer match" className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-navy disabled:opacity-40">›</button>
      <button onClick={onClose} aria-label="Close search" className="px-1 text-[18px] text-muted hover:text-navy">×</button>
    </div>
  );
}

export interface StarredItem { id: string; threadId: string; body: string; attachmentName: string | null; attachmentType: string | null; attachmentDuration: number | null; createdAt: string; sender: string; where: string | null }

/** Starred messages, in place of the chat list */
export function StarredList({ onOpen }: { onOpen: (s: StarredItem) => void }) {
  const [rows, setRows] = useState<StarredItem[] | null>(null);
  useEffect(() => { api.get('/messages/starred').then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  if (!rows) return <div className="m-3 h-40 animate-pulse rounded-md bg-subtle" />;
  if (!rows.length) return <p className="px-4 py-10 text-center text-[13px] text-ink2">Nothing starred yet. Open a message’s menu and choose Star to keep it here.</p>;
  return <>{rows.map(s => (
    <button key={s.id} onClick={() => onOpen(s)} className="flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left hover:bg-subtle">
      <span className="text-[12px] text-muted">{s.sender}{s.where ? ` · ${s.where}` : ''} · {fmt(s.createdAt)}</span>
      <span className="line-clamp-2 text-[13.5px] text-navy">{quoteText({ body: s.body, deleted: false, attachmentType: s.attachmentType, attachmentName: s.attachmentName, attachmentDuration: s.attachmentDuration })}</span>
    </button>
  ))}</>;
}

/** People to tag: shows when the word before the cursor starts with @ */
export function MentionSuggest({ items, onPick }: { items: { id: string; name: string; sub: string }[]; onPick: (i: { id: string; name: string }) => void }) {
  if (!items.length) return null;
  return (
    <div role="listbox" aria-label="Tag someone" className="absolute bottom-full left-14 z-30 mb-2 flex w-72 max-w-[calc(100%-4rem)] flex-col rounded-xl border border-line bg-white p-1.5 shadow-xl">
      {items.slice(0, 6).map(i => (
        <button key={i.id} role="option" aria-selected={false} type="button" onMouseDown={e => { e.preventDefault(); onPick(i); }} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-extrabold text-azure-strong">{i.id === 'everyone' ? '@' : i.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-navy">{i.name}</span><span className="block truncate text-[11.5px] text-muted">{i.sub}</span></span>
        </button>
      ))}
    </div>
  );
}
