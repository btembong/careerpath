'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface EditableClass { id: string; title: string; scheduledAt: string; durationMins: number; status: string; recordingUrl: string | null; description?: string | null }

const label = 'text-[13px] font-semibold text-navy';
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const LENGTHS = [45, 60, 90, 120];

/**
 * Edit a scheduled class (topic, time, length, cancel) or, once it has been held, add its recording link.
 */
export function EditClassDialog({ cls, onClose, onDone }: { cls: EditableClass | null; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [at, setAt] = useState('');
  const [mins, setMins] = useState('90');
  const [rec, setRec] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!cls) return;
    setTitle(cls.title); setDesc(cls.description ?? ''); setAt(localInput(new Date(cls.scheduledAt)));
    setMins(String(cls.durationMins)); setRec(cls.recordingUrl ?? '');
  }, [cls]);

  if (!cls) return <Dialog open={false} onOpenChange={() => {}}>{null}</Dialog>;
  const scheduled = cls.status === 'SCHEDULED' && new Date(cls.scheduledAt).getTime() + cls.durationMins * 60_000 > Date.now();

  async function save() {
    setBusy('save');
    try {
      await api.patch(`/live/classes/${cls!.id}`, scheduled
        ? { title: title.trim(), description: desc.trim() || null, scheduledAt: new Date(at).toISOString(), durationMins: Number(mins) }
        : { title: title.trim(), recordingUrl: rec.trim() || null });
      notify.success(scheduled ? 'Class updated' : rec.trim() ? 'Recording added' : 'Class updated', scheduled ? { description: 'Students see the change straight away.' } : undefined);
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not update the class'); }
    finally { setBusy(null); }
  }
  async function cancel() {
    setBusy('cancel');
    try { await api.delete(`/live/classes/${cls!.id}`); notify.success('Class cancelled'); onClose(); await onDone(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not cancel the class'); }
    finally { setBusy(null); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={scheduled ? 'Edit class' : 'Class recording'}
        description={scheduled ? 'Students see the new details straight away.' : 'Paste a link to the recording so students who missed the class can watch it.'}>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5"><span className={label}>Topic</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-base" /></label>
          {scheduled ? <>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Starts</span>
                <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="input-base" /></label>
              <label className="flex w-32 flex-col gap-1.5"><span className={label}>Length</span>
                <select value={mins} onChange={e => setMins(e.target.value)} className="input-base">
                  {LENGTHS.map(m => <option key={m} value={m}>{m} min</option>)}
                  {!LENGTHS.includes(Number(mins)) && <option value={mins}>{mins} min</option>}
                </select></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className={label}>What you’ll cover (optional)</span>
              <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
          </> : (
            <label className="flex flex-col gap-1.5"><span className={label}>Recording link</span>
              <input value={rec} onChange={e => setRec(e.target.value)} placeholder="https://" className="input-base" /></label>
          )}
        </div>
        <DialogFooter>
          {scheduled && <Button size="sm" variant="ghost" loading={busy === 'cancel'} onClick={cancel} className="mr-auto">Cancel class</Button>}
          <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          <Button size="sm" loading={busy === 'save'} disabled={!title.trim()} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
