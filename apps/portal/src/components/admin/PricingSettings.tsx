'use client';
import { useEffect, useState } from 'react';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Programme { id: string; name: string; shortName: string | null }
interface DefaultRow { programmeId: string | null; currency: string; amount: number }
const CURRENCIES = ['GHS', 'XAF', 'NGN', 'USD', 'XOF', 'LRD'];

/** Default single-course prices per programme, and the default teacher commission */
export function PricingSettings({ open, programmes, packageOnly, onClose, onApplied }: {
  open: boolean; programmes: Programme[]; packageOnly: number; onClose: () => void; onApplied: () => Promise<void>;
}) {
  const [rows, setRows] = useState<{ programmeId: string; currency: string; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyCurrency, setApplyCurrency] = useState('GHS');
  const [pct, setPct] = useState('');

  useEffect(() => {
    if (!open) return;
    api.get('/platform-courses/pricing-settings').then(r => setPct(r.data?.defaultTeacherCommissionPct != null ? String(r.data.defaultTeacherCommissionPct) : '')).catch(() => {});
    api.get('/platform-courses/price-defaults').then(r => setRows((r.data as DefaultRow[]).map(d => ({
      programmeId: d.programmeId ?? '', currency: d.currency, amount: String(minorToMajor(d.amount, d.currency)),
    })))).catch(() => setRows([]));
  }, [open]);

  const update = (i: number, patch: Partial<{ programmeId: string; currency: string; amount: string }>) =>
    setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  async function save() {
    setBusy(true);
    try {
      await api.patch('/platform-courses/price-defaults', {
        rows: rows.filter(r => Number(r.amount) > 0).map(r => ({ programmeId: r.programmeId || null, currency: r.currency, amount: majorToMinor(Number(r.amount), r.currency) })),
      });
      notify.success('Default prices saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save default prices'); }
    finally { setBusy(false); }
  }
  async function saveCommission(applyToo: boolean) {
    setBusy(true);
    try {
      await api.patch('/platform-courses/pricing-settings', { defaultTeacherCommissionPct: pct.trim() === '' ? null : Number(pct) });
      if (applyToo) {
        const r = await api.post('/platform-courses/pricing-settings/apply-commission');
        notify.success(`${r.data.updated} courses now pay ${pct}%`, { description: r.data.skipped ? `${r.data.skipped} already had their own commission` : undefined });
      } else notify.success('Default commission saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save the commission'); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true);
    try {
      await save();
      const r = await api.post('/platform-courses/price-defaults/apply', { currency: applyCurrency });
      notify.success(`${r.data.updated} courses put on sale`, { description: r.data.skipped ? `${r.data.skipped} had no default price for their programme` : undefined });
      await onApplied();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not apply default prices'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent size="lg" title="Pricing settings"
          description="Default prices per programme, and the teacher commission new courses start with.">
          <h3 className="text-[14px] font-semibold text-navy">Default single-course prices</h3>
          <p className="mb-2 text-[12.5px] text-muted">Used when you put package-only courses on sale. A programme’s own price wins over “Every programme”.</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label="Programme" value={r.programmeId} onChange={e => update(i, { programmeId: e.target.value })} className="input-base flex-1">
                  <option value="">Every programme</option>
                  {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select aria-label="Currency" value={r.currency} onChange={e => update(i, { currency: e.target.value })} className="input-base w-24">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input aria-label="Price" inputMode="decimal" value={r.amount} onChange={e => update(i, { amount: e.target.value })} placeholder="60" className="input-base w-28" />
                <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="text-[13px] font-semibold text-muted hover:text-error">Remove</button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setRows(rs => [...rs, { programmeId: '', currency: 'GHS', amount: '' }])}>Add a price</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2.5 text-[13px] text-ink2">
            <span className="flex-1">{packageOnly} published courses are package only. Put them on sale at these prices in</span>
            <select aria-label="Currency to apply" value={applyCurrency} onChange={e => setApplyCurrency(e.target.value)} className="input-base h-8 w-24">
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <Button size="sm" variant="secondary" loading={busy} onClick={apply}>Apply</Button>
          </div>
          <h3 className="mt-6 text-[14px] font-semibold text-navy">Teacher commission</h3>
          <p className="mb-2 text-[12.5px] text-muted">The share of each sale credited to the course’s teacher. Each course can have its own in the course drawer.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5">
              <input aria-label="Default commission" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 40" className="input-base w-24" />
              <span className="text-sm text-ink2">%</span>
            </span>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => saveCommission(false)}>Save</Button>
            <Button size="sm" variant="ghost" loading={busy} disabled={pct.trim() === ''} onClick={() => saveCommission(true)}>Save and give it to courses without one</Button>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
            <Button size="sm" loading={busy} onClick={save}>Save defaults</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
