import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { TUTOR_AGREEMENT as A, agreementRuns, type AgreementBlock } from '@cpa/shared';

export const metadata = { title: `${A.title} — CareerPath Africa` };


export default function TutorAgreementPage() {
  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <div className="bg-navy text-white">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo tone="onDark" href={null} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-2">Legal Document</p>
          <h1 className="text-2xl font-black leading-tight mb-2">
            Tutor Offer Letter &amp;<br />Content Ownership Agreement
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
              {A.label}
            </span>
            <span className="text-xs text-white/40">{A.effective}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Preamble */}
        <section className="rounded-2xl border border-cloud bg-white p-6 space-y-3">
          {A.preamble.map((b, i) => <Block key={i} b={b} />)}
        </section>

        {A.sections.map(s => (
          <AgreementSection key={s.num} num={s.num} title={s.title}>
            <div className="space-y-4">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
          </AgreementSection>
        ))}

        {/* Contact */}
        <div className="rounded-2xl border border-cloud bg-white p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">CareerPath Africa</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-navy/70">
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Email</p>
              <a href={`mailto:${A.contact.email}`} className="text-azure hover:underline text-xs">{A.contact.email}</a>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Phone</p>
              <p className="text-xs">{A.contact.phone}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Address</p>
              <p className="text-xs">{A.contact.address}</p>
            </div>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center pb-6">
          <Link href="/" className="text-xs text-royal/40 hover:text-azure transition">
            ← Back to CareerPath Africa
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgreementSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-cloud bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-cloud bg-surface">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-azure text-[11px] font-black text-white">
          {num}
        </span>
        <h2 className="text-sm font-bold text-navy">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/** Text with **bold** parts */
function Runs({ text }: { text: string }) {
  return <>{agreementRuns(text).map((r, i) => r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>)}</>;
}

function Block({ b }: { b: AgreementBlock }) {
  if (b.kind === 'list') return <BulletList items={b.items} />;
  if (b.kind === 'callout') return (
    <div className={b.strong ? 'rounded-xl border border-azure/20 bg-azure/5 px-4 py-3' : 'rounded-xl border border-cloud bg-cloud/30 px-4 py-3'}>
      {b.label && <p className={b.strong ? 'text-xs font-bold uppercase tracking-widest text-azure mb-1' : 'text-xs font-bold uppercase tracking-widest text-royal/50 mb-1'}>{b.label}</p>}
      <p className="text-sm text-navy leading-relaxed"><Runs text={b.text} /></p>
      {b.note && <p className="text-xs text-navy/60 mt-2 leading-relaxed">{b.note}</p>}
    </div>
  );
  return <p className={b.muted ? 'text-sm text-navy/70 leading-relaxed' : 'text-sm text-navy/80 leading-relaxed'}><Runs text={b.text} /></p>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-azure" />
          <span className="text-sm text-navy/80 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
