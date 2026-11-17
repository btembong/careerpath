import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import PackagesApp from '@/components/packages/PackagesApp';
import { Cover, PayWith, PublicFooter, PublicHeader, perMonth, price } from '@/components/public/PublicChrome';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'Packages · CareerPath Africa',
  description: 'Bundles of exam courses at one price, with practice, mock exams and optional live classes. Pay by mobile money or card.',
};

interface Pkg {
  id: string; name: string; description: string | null; priceAmount: number; currency: string; bestValue: boolean; months: number | null;
  courses: number; lessons: number; exams: string[]; covers: string[]; titles: string[]; live: boolean; liveAddOn: boolean; mentorship: boolean;
}

async function load(): Promise<Pkg[]> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/package-list`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

/** Visitors: packages side by side, like product tiers. Signed in: the portal's own packages page, as before. */
export default async function PackagesRoute() {
  if ((await cookies()).get('cpa_token')?.value) return <PackagesApp />;
  const list = await load();
  // The admin's "Best value" choice; otherwise the middle one when there are three or more
  const best = list.find(p => p.bestValue)?.id ?? (list.length >= 3 ? list[Math.floor(list.length / 2)].id : null);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      <section className="bg-[#3F6FE8]">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-3 px-4 py-12 text-center sm:px-8">
          <h1 className="text-[38px] font-extrabold leading-none tracking-[-0.04em] sm:text-[52px]">Pick your <span className="text-white">package.</span></h1>
          <p className="max-w-[560px] text-[16.5px] leading-relaxed text-[#0B1F55]">Every package: lessons, practice questions and mock exams at one price. Add live classes or a mentor at checkout when they’re offered.</p>
          <PayWith className="mt-1 justify-center" />
        </div>
      </section>
      <main className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-8">
        {!list.length ? (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 rounded-xl border border-line bg-white p-8 text-center">
            <b className="text-[20px]">New packages are on their way.</b>
            <p className="text-[14.5px] text-ink2">In the meantime, start with the free courses: no payment needed.</p>
            <Link href="/courses" className="inline-flex h-11 items-center rounded-md bg-[#2F57C9] px-5 font-bold text-white">See the courses</Link>
          </div>
        ) : (
          <div className={`grid items-start gap-5 ${list.length === 1 ? 'mx-auto max-w-[420px]' : list.length === 2 ? 'mx-auto max-w-[860px] md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
            {list.map(p => {
              const isBest = p.id === best;
              const monthly = perMonth(p.priceAmount, p.currency, p.months);
              return (
                <article key={p.id} className={`relative flex flex-col gap-4 rounded-2xl bg-white p-6 ${isBest ? 'border-2 border-[#3F6FE8] shadow-[0_18px_40px_rgba(63,111,232,0.18)] lg:-translate-y-2' : 'border border-line'}`}>
                  {isBest && <span className="absolute -top-3 left-6 rounded-md bg-[#3F6FE8] px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-white">Best value</span>}
                  <div className="relative h-[96px]" aria-hidden>
                    {(p.covers.length ? p.covers : [null, null, null]).slice(0, 3).map((c, i) => (
                      <div key={i} className="absolute h-[76px] w-[124px] overflow-hidden rounded-lg shadow-[0_10px_20px_rgba(7,32,97,0.18)]" style={{ left: i * 34, top: i === 1 ? 0 : 14, transform: `rotate(${[-6, 3, 8][i]}deg)`, zIndex: 3 - i }}>
                        <Cover src={c} label={p.exams[i] ?? p.name} seed={p.id + i} className="h-full w-full" />
                      </div>
                    ))}
                  </div>
                  <div>
                    {p.exams.length > 0 && <p className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">{p.exams.slice(0, 3).join(' · ')}</p>}
                    <h2 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.01em]">{p.name}</h2>
                    {p.description && <p className="mt-1 text-[14px] leading-relaxed text-ink2">{p.description}</p>}
                  </div>
                  <div>
                    <b className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">{price(p.priceAmount, p.currency)}</b>
                    <p className="mt-1 text-[13px] text-muted">{p.courses} course{p.courses === 1 ? '' : 's'}{p.months ? ` · ${p.months} months` : ''}{monthly ? ` · ${monthly}` : ''}</p>
                  </div>
                  <Link href={`/packages/${p.id}`} className={`flex h-11 items-center justify-center rounded-md text-[15px] font-extrabold ${isBest ? 'bg-[#2F57C9] text-white hover:bg-[#2548AE]' : 'border border-line text-navy hover:bg-subtle'}`}>See what’s inside</Link>
                  <ul className="flex flex-col gap-1.5 border-t border-line pt-4 text-[13.5px] text-ink2">
                    <li className="flex gap-2"><span className="text-[#17703A]">✓</span>{p.lessons} lessons with notes and quizzes</li>
                    <li className="flex gap-2"><span className="text-[#17703A]">✓</span>Practice questions and mock exams</li>
                    <li className="flex gap-2"><span className="text-[#17703A]">✓</span>Certificates for each course</li>
                    <li className={`flex gap-2 ${p.live || p.liveAddOn ? '' : 'text-[#9AA6C2]'}`}><span className={p.live || p.liveAddOn ? 'text-[#17703A]' : ''}>{p.live || p.liveAddOn ? '✓' : '—'}</span>{p.live ? 'Live classes included' : p.liveAddOn ? 'Live classes can be added' : 'No live classes'}</li>
                    {p.mentorship && <li className="flex gap-2"><span className="text-[#17703A]">✓</span>A mentor{p.live ? ' included' : ' can be added'}</li>}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-10 text-center text-[13.5px] text-muted">Prefer one subject? <Link href="/courses" className="font-bold text-azure-strong hover:underline">Browse single courses</Link> · Buying for a school? <a href="mailto:support@careerpathafrica.com?subject=School%20places" className="font-bold text-azure-strong hover:underline">Talk to us</a></p>
      </main>
      <PublicFooter />
    </div>
  );
}
