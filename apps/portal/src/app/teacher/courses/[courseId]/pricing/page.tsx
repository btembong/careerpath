'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Course {
  id: string; title: string; status: string;
  isSoldIndividually: boolean; priceAmount: number | null; priceCurrency: string | null;
  proposedPriceAmount: number | null; proposedPriceCurrency: string | null; priceProposedAt: string | null;
}
interface Guide {
  defaults: { currency: string; amount: number }[];
  similar: { currency: string; min: number; max: number; count: number }[];
  teacherCommissionPct: number | null;
  packages: { id: string; name: string; priceAmount: number; currency: string; courses: number; isPublished: boolean; sold: number }[];
}

const CURRENCIES = ['GHS', 'XAF', 'NGN', 'USD', 'XOF', 'LRD'];
const STATUS: Record<string, string> = { PUBLISHED: 'Published', PENDING_REVIEW: 'In review', DRAFT: 'Draft', ARCHIVED: 'Archived' };
const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;

export default function CoursePricingPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [c, g] = await Promise.all([
      api.get(`/platform-courses/${courseId}`).then(r => r.data as Course),
      api.get(`/platform-courses/${courseId}/price-guide`).then(r => r.data as Guide).catch(() => null),
    ]);
    setCourse(c); setGuide(g);
    const cur = c.proposedPriceCurrency ?? c.priceCurrency ?? g?.defaults[0]?.currency ?? 'GHS';
    setCurrency(cur);
    const minor = c.proposedPriceAmount ?? c.priceAmount;
    setAmount(minor != null ? String(minorToMajor(minor, cur)) : '');
  }
  useEffect(() => { load().catch(() => notify.error('Could not load this course')); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function propose() {
    const n = Number(amount);
    if (!(n > 0)) { notify.error('Enter a price above zero'); return; }
    setSaving(true);
    try {
      await api.post(`/platform-courses/${courseId}/price-proposal`, { amount: majorToMinor(n, currency), currency });
      notify.success('Price sent for approval', { description: 'You’ll get a notification when an admin decides.' });
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not send the price');
    } finally { setSaving(false); }
  }

  const def = guide?.defaults.find(d => d.currency === currency);
  const sim = guide?.similar.find(s => s.currency === currency);
  const n = Number(amount);
  const share = guide?.teacherCommissionPct != null && n > 0 ? (n * guide.teacherCommissionPct) / 100 : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/teacher/courses" backLabel="My courses" title={course?.title ?? 'Pricing'} subtitle={course ? `Status: ${STATUS[course.status] ?? course.status}` : undefined} />

      <div role="tablist" aria-label="Course" className="flex gap-1 border-b border-line bg-white px-4 lg:px-7">
        {[['Content', `/teacher/courses/${courseId}/builder`], ['Pricing', null], ['Discussion', `/teacher/courses/${courseId}/discussion`]].map(([l, href]) => href ? (
          <Link key={l} href={href} role="tab" aria-selected={false} className="-mb-px inline-flex h-12 items-center border-b-2 border-transparent px-3 text-[13.5px] font-medium text-muted hover:text-navy">{l}</Link>
        ) : (
          <span key={l} role="tab" aria-selected className="-mb-px inline-flex h-12 items-center border-b-2 border-azure px-3 text-[13.5px] font-semibold text-navy">{l}</span>
        ))}
      </div>

      {!course ? <div className="m-7 h-64 rounded-lg border border-line bg-white animate-pulse" /> : (
        <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] rounded-lg border border-line bg-white p-5">
            <div>
              <h2 className="text-lg font-bold text-navy">Selling this course on its own</h2>
              <p className="mt-1 text-[13.5px] text-ink2">
                Propose a price for students who want just this course. An admin approves it before it goes live, and the course stays in any packages it belongs to.
              </p>
            </div>

            {course.isSoldIndividually && course.priceAmount != null && course.priceCurrency && (
              <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-ink2">
                <strong className="text-navy">On sale now at {money(course.priceAmount, course.priceCurrency)}.</strong> Propose a new price below to change it.
              </p>
            )}

            <div className="flex max-w-[420px] items-end gap-2">
              <label className="flex w-28 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Currency</span>
                <select value={currency} onChange={e => setCurrency(e.target.value)} className="input-base">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="flex flex-1 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Proposed price</span>
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="60" className="input-base" />
              </label>
            </div>

            <dl className="grid overflow-hidden rounded-md border border-line sm:grid-cols-3">
              <div className="border-b border-line px-3 py-2.5 sm:border-b-0 sm:border-r">
                <dt className="text-[11.5px] text-muted">Platform default</dt>
                <dd className="mt-0.5 text-sm font-bold text-navy">{def ? money(def.amount, currency) : 'Not set'}</dd>
                <dd className="text-xs text-muted">for this programme</dd>
              </div>
              <div className="border-b border-line px-3 py-2.5 sm:border-b-0 sm:border-r">
                <dt className="text-[11.5px] text-muted">Similar courses</dt>
                <dd className="mt-0.5 text-sm font-bold text-navy">
                  {sim ? (sim.min === sim.max ? money(sim.min, currency) : `${currency} ${minorToMajor(sim.min, currency).toLocaleString()}–${minorToMajor(sim.max, currency).toLocaleString()}`) : '—'}
                </dd>
                <dd className="text-xs text-muted">{sim ? `${sim.count} course${sim.count === 1 ? '' : 's'} on sale` : 'None on sale yet'}</dd>
              </div>
              <div className="px-3 py-2.5">
                <dt className="text-[11.5px] text-muted">You receive per sale</dt>
                <dd className="mt-0.5 text-sm font-bold text-navy">
                  {share != null ? `${currency} ${share.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : guide?.teacherCommissionPct == null ? 'Not set yet' : '—'}
                </dd>
                <dd className="text-xs text-muted">{guide?.teacherCommissionPct != null ? `${guide.teacherCommissionPct}% of the price` : 'An admin sets your commission'}</dd>
              </div>
            </dl>

            {course.proposedPriceAmount != null && course.proposedPriceCurrency && (
              <div className="flex items-center gap-2.5 rounded-md border border-line bg-subtle px-3.5 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="flex-shrink-0 text-azure-strong">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
                </svg>
                <p className="text-[13px] text-ink2">
                  <strong className="text-navy">{money(course.proposedPriceAmount, course.proposedPriceCurrency)} sent for approval</strong>
                  {course.priceProposedAt && ` on ${new Date(course.priceProposedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`}.
                  {' '}You’ll get a notification when an admin decides.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" loading={saving} disabled={!(n > 0)} onClick={propose}>
                {course.proposedPriceAmount != null ? 'Update proposal' : 'Send for approval'}
              </Button>
            </div>
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
            <h3 className="text-[15px] font-semibold text-navy">Packages with this course</h3>
            {guide?.packages.length ? guide.packages.map(p => (
              <div key={p.id} className="rounded-md border border-line px-3 py-2.5">
                <p className="text-[13.5px] font-semibold text-navy">{p.name}</p>
                <p className={clsx('text-[12.5px]', 'text-muted')}>
                  {money(p.priceAmount, p.currency)} · {p.courses} course{p.courses === 1 ? '' : 's'} · {p.sold} sold{p.isPublished ? '' : ' · draft'}
                </p>
              </div>
            )) : <p className="text-[13px] text-ink2">Not in a package yet.</p>}
            <h3 className="mt-2 text-[15px] font-semibold text-navy">How pricing works</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink2">
              <li>You propose; an admin approves or sets a different price.</li>
              <li>Prices only change through approval, even after publishing.</li>
              <li>A price change doesn’t affect students who already bought the course; they keep access until their access period ends.</li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
