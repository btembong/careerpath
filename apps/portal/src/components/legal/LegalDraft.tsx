import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';

/** A legal page whose final text isn't published yet: same look as the teacher agreement, with what it will cover. */
export function LegalDraft({ title, version, intro, covers }: { title: string; version: string; intro: string; covers: string[] }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-navy text-white">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="mb-6 flex items-center gap-3"><BrandLogo tone="onDark" href={null} /></div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-azure">Legal document</p>
          <h1 className="text-2xl font-black leading-tight">{title}</h1>
          <span className="mt-4 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">{version}</span>
        </div>
      </div>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <section className="flex flex-col gap-3 rounded-2xl border border-cloud bg-white p-6">
          <p className="text-sm leading-relaxed text-navy">{intro}</p>
          <p className="text-sm leading-relaxed text-ink2">
            The full text is being finalised and will be published on this page. When it changes, we’ll tell you and ask you to agree to the new version.
          </p>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-cloud bg-white p-6">
          <h2 className="text-base font-bold text-navy">What it covers</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink2">{covers.map(c => <li key={c}>{c}</li>)}</ul>
        </section>
        <p className="text-sm text-ink2">
          Questions? Contact us from <strong className="text-navy">Help &amp; support</strong> once you’re signed in.{' '}
          <Link href="/register" className="font-semibold text-azure hover:underline">Back to sign up</Link>
        </p>
      </div>
    </div>
  );
}
