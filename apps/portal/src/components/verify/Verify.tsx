'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { money } from '@/lib/money';
import api from '@/lib/api';
import { BrandLogo } from '@/components/brand/BrandLogo';

type Kind = 'certificate' | 'receipt';
type CertOk = { valid: true; verifyCode: string; studentName: string; courseName: string; teacher: string | null; issuedAt: string };
type ReceiptOk = { valid: true; receipt: string; paidOn: string; item: string; amount: number; currency: string; billedTo: string; refunded: boolean };
type Result = { kind: Kind; ok: CertOk | ReceiptOk | null; slow?: boolean };

const long = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Public check of a certificate or a receipt, for employers, schools and sponsors */
export function Verify({ initialKind = 'certificate', initialCode = '' }: { initialKind?: Kind; initialCode?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [code, setCode] = useState(initialCode);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function check(k = kind, c = code) {
    const v = c.trim().toUpperCase();
    if (!v) return;
    setChecking(true);
    try {
      const r = await api.get(k === 'certificate' ? `/certificates/verify/${encodeURIComponent(v)}` : `/verify/receipt/${encodeURIComponent(v)}`);
      setResult({ kind: k, ok: r.data?.valid ? r.data : null });
    } catch (e: any) {
      setResult({ kind: k, ok: null, slow: e?.response?.status === 429 });
    } finally { setChecking(false); }
  }
  useEffect(() => { if (initialCode) check(initialKind, initialCode); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = result?.ok;
  const facts: [string, string][] = !ok ? [] : result!.kind === 'certificate'
    ? (() => { const c = ok as CertOk; return [['Awarded to', c.studentName], ['Course', c.courseName], ['Issued', long(c.issuedAt)], ...(c.teacher ? [['Teacher', c.teacher] as [string, string]] : []), ['Code', c.verifyCode]]; })()
    : (() => { const r = ok as ReceiptOk; return [['Receipt', r.receipt], ['Paid on', long(r.paidOn)], ['For', r.item], ['Amount', money(r.amount, r.currency)], ['Billed to', r.billedTo]]; })();
  const refunded = !!ok && result!.kind === 'receipt' && (ok as ReceiptOk).refunded;
  const verdict = !result ? '' : ok
    ? (refunded ? '✓ Genuine receipt — since refunded' : result.kind === 'certificate' ? '✓ Genuine certificate' : '✓ Genuine receipt')
    : result.slow ? 'Too many checks — wait a minute and try again'
    : result.kind === 'certificate' ? '✗ No certificate with this code' : '✗ No receipt with this number';

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface">
      <header className="flex w-full items-center gap-3 bg-[#3F6FE8] px-7 py-4">
        <BrandLogo tone="onBlue" />
      </header>
      <main className="flex w-full max-w-[620px] flex-col gap-4 px-4 py-10">
        <div>
          <h1 className="text-[26px] font-extrabold text-navy">{kind === 'certificate' ? 'Check a certificate' : 'Check a receipt'}</h1>
          <p className="mt-1 text-[14px] text-ink2">{kind === 'certificate' ? 'Employers and schools: type the code printed on the certificate, or scan its QR code.' : 'Sponsors and school bursars: confirm a CareerPath Africa receipt is genuine.'}</p>
        </div>
        <div role="tablist" className="flex gap-1 self-start rounded-lg border border-line bg-white p-1 text-[13.5px]">
          {(['certificate', 'receipt'] as Kind[]).map(k => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setResult(null); setCode(''); if (initialCode) router.replace('/verify'); }}
              className={clsx('rounded-md px-3.5 py-1.5 capitalize text-navy', kind === k ? 'bg-accent-soft font-semibold' : 'hover:bg-subtle')}>{k}</button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); check(); }} className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value)} aria-label={kind === 'certificate' ? 'Certificate code' : 'Receipt number'} placeholder={kind === 'certificate' ? 'e.g. CPA-7F3K9Q' : 'e.g. INV-202611-00412'}
            className="h-[46px] min-w-0 flex-1 rounded-lg border border-azure bg-white px-3.5 font-mono text-[15px] uppercase text-navy outline-none focus:ring-4 focus:ring-azure/10" />
          <button type="submit" disabled={checking || !code.trim()} className="inline-flex h-[46px] items-center rounded-lg bg-azure-strong px-[18px] text-[14px] font-semibold text-on-accent disabled:opacity-50">{checking ? 'Checking…' : 'Check'}</button>
        </form>

        {result && (
          <section className={clsx('flex flex-col gap-3.5 rounded-[10px] border bg-white p-5', ok ? 'border-azure' : 'border-red-200')}>
            <p className={clsx('text-[13px] font-bold uppercase tracking-[0.06em]', ok ? 'text-green-700' : 'text-red-500')}>{verdict}</p>
            {ok && (
              <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2.5 text-[14px]">
                {facts.map(([l, v]) => <div key={l} className="contents"><dt className="text-muted">{l}</dt><dd className="font-semibold text-navy">{v}</dd></div>)}
              </dl>
            )}
            <p className="text-[12.5px] text-muted">
              {ok ? (result.kind === 'certificate' ? 'Names are shortened to protect the student. Ask them for the PDF to see their full name.' : 'We only confirm what’s on the receipt. Refunded receipts show as refunded.')
                : 'Check for typos (no letter O, only zero). If it’s still not found, it wasn’t issued by CareerPath Africa — contact verify@careerpathafrica.com.'}
            </p>
          </section>
        )}
        <p className="text-[12.5px] text-muted">This page is public and limited to a few checks a minute.</p>
      </main>
    </div>
  );
}
