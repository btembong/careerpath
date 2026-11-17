import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import PackageDetailApp from '@/components/packages/PackageDetailApp';
import { Cover, Face, PayWith, PublicFooter, PublicHeader, perMonth, price } from '@/components/public/PublicChrome';

export const revalidate = 300;

interface PkgCourse { id: string; slug: string | null; title: string; coverUrl: string | null; exam: string | null; subject: string | null; teacher: { name: string | null; avatarUrl: string | null } | null; modules: number; lessons: number; quizzes: number; price: { amount: number; currency: string } | null }
interface PackagePage {
  id: string; name: string; description: string | null; priceAmount: number; currency: string; months: number | null; bestValue: boolean; exams: string[]; worth: number | null;
  courses: PkgCourse[]; teachers: { name: string | null; avatarUrl: string | null }[];
  counts: { courses: number; ready: number; lessons: number; videos: number; quizzes: number; questions: number };
  live: { cohort: string; teacher: string | null; examDate: string | null; next: { title: string; scheduledAt: string; durationMins: number }[] } | null;
  mentorship: { text: string | null; perMonth: number | null } | null;
  addOns: { live: { price: number; cohort: string } | null; mentorship: { price: number; perMonth: number } | null };
  faq: { q: string; a: string }[];
}

async function load(id: string): Promise<PackagePage | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/package-page/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  if (!p) return { title: 'Package' };
  return {
    title: `${p.name} · ${price(p.priceAmount, p.currency)}`,
    description: p.description ?? `${p.counts.courses} courses in one package${p.months ? ` for ${p.months} months` : ''}.`,
    openGraph: { title: p.name, description: p.description ?? undefined },
  };
}

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const TILT = ['-rotate-[10deg] left-0 top-12', 'rotate-[9deg] left-[150px] top-10', '-rotate-3 left-[60px] top-[120px]'];

/** Visitors: the package as a product. Signed in: the portal's own package page, as before. */
export default async function PackagePageRoute({ params }: { params: Promise<{ id: string }> }) {
  if ((await cookies()).get('cpa_token')?.value) return <PackageDetailApp />;
  const p = await load((await params).id);
  if (!p) notFound();
  const checkout = `/register?next=${encodeURIComponent(`/packages/${p.id}/checkout`)}`;
  const monthly = perMonth(p.priceAmount, p.currency, p.months);
  const soon = p.counts.courses - p.counts.ready;
  const box = p.courses.slice(0, 3);
  const faq = p.faq.length ? p.faq : [
    { q: 'How long do I keep it?', a: p.months ? `${p.months} months from the day you pay, for every course inside.` : 'For as long as the package is on CareerPath.' },
    ...(soon ? [{ q: 'What does “Lessons coming soon” mean?', a: 'Those courses are still being written by their teachers. They appear in your package as soon as they’re ready, at no extra cost.' }] : []),
    { q: 'Can I pay with mobile money?', a: 'Yes: MTN Mobile Money, Orange Money or a card. You get a receipt by email straight away.' },
    { q: 'Can I add live classes or a mentor later?', a: 'Yes, from your package page at any time, if the package offers them.' },
  ];

  const buyCard = (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-[#3F6FE8] bg-white p-5 shadow-[0_22px_44px_rgba(7,32,97,0.18)]">
      <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">One price{p.months ? ` · ${p.months} months` : ''}</span>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-[36px] font-extrabold leading-none tracking-[-0.02em] text-navy">{price(p.priceAmount, p.currency)}</b>
        {p.worth && <span className="text-[15px] text-muted line-through">{price(p.worth, p.currency)}</span>}
      </div>
      {p.worth ? <span className="text-[13.5px] font-bold text-[#17703A]">Save {price(p.worth - p.priceAmount, p.currency)} on buying each course</span> : monthly && <span className="text-[13.5px] text-muted">That’s {monthly}</span>}
      <Link href={checkout} className="flex h-12 items-center justify-center rounded-md bg-[#2F57C9] text-[15.5px] font-extrabold text-white hover:bg-[#2548AE]">Get the package</Link>
      {(p.addOns.live || p.addOns.mentorship) && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-[13.5px]">
          <b className="text-[13px]">You can add at checkout</b>
          {p.addOns.live && <span className="flex gap-2"><span className="text-[#2F57C9]">+</span><span><b>Live classes</b> with {p.addOns.live.cohort} · {price(p.addOns.live.price, p.currency)}</span></span>}
          {p.addOns.mentorship && <span className="flex gap-2"><span className="text-[#2F57C9]">+</span><span><b>A mentor</b> · {s(p.addOns.mentorship.perMonth, 'session')} a month · {price(p.addOns.mentorship.price, p.currency)}</span></span>}
        </div>
      )}
      <PayWith className="border-t border-line pt-3" />
      <span className="text-[12.5px] text-muted">For a school or a class? <a href="mailto:support@careerpathafrica.com?subject=School%20places" className="font-bold text-azure-strong hover:underline">Buy places for students</a></span>
    </div>
  );

  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      {/* Hero: the package as a product */}
      <section className="overflow-hidden" style={{ background: 'radial-gradient(1200px 500px at 80% 20%,#5889FA 0%,#3F6FE8 45%,#2F57C9 100%)' }}>
        <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-14">
          <div className="flex min-w-0 flex-col gap-4">
            <span className="inline-flex h-7 w-fit items-center rounded-md bg-white px-2.5 text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#2F57C9]">Package{p.exams.length ? ` · ${p.exams.slice(0, 2).join(' · ')}` : ''}{p.months ? ` · ${p.months} months` : ''}</span>
            <h1 className="text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-navy sm:text-[56px]">{p.name}<span className="text-white">.</span></h1>
            {p.description && <p className="max-w-[540px] text-[17px] leading-relaxed text-[#0B1F55]">{p.description}</p>}
            <div className="mt-1 flex flex-wrap gap-7">
              {[[p.counts.courses, p.counts.courses === 1 ? 'course' : 'courses'], [p.counts.lessons, 'lessons'], ...(p.months ? [[p.months, 'months']] : []), ...(p.teachers.length ? [[p.teachers.length, p.teachers.length === 1 ? 'teacher' : 'teachers']] : [])].map(([n, l]) => (
                <span key={String(l)}><b className="block text-[30px] font-extrabold leading-none text-white">{n}</b><span className="text-[13px] text-[#0B1F55]">{l}</span></span>
              ))}
            </div>
          </div>
          <div className="relative mx-auto hidden h-[300px] w-[380px] sm:block" aria-hidden>
            {box.map((c, i) => (
              <div key={c.id} className={`absolute h-[130px] w-[210px] overflow-hidden rounded-xl shadow-[0_18px_34px_rgba(7,32,97,0.3)] ${TILT[i]}`}>
                <Cover src={c.coverUrl} label={c.exam ?? c.title} seed={c.id} className="h-full w-full" />
              </div>
            ))}
            <div className="absolute left-[95px] top-0 flex h-[120px] w-[190px] rotate-2 items-center justify-center rounded-xl bg-white p-3 text-center text-[21px] font-extrabold leading-tight text-navy shadow-[0_18px_34px_rgba(7,32,97,0.3)]">{p.name}</div>
            <span className="absolute bottom-5 right-2 flex h-[88px] w-[88px] rotate-12 flex-col items-center justify-center rounded-full bg-[#F5A524] font-extrabold text-navy shadow-[0_10px_22px_rgba(0,0,0,0.2)]"><span className="text-[24px] leading-none">{p.counts.courses}</span><span className="text-[12px]">{p.counts.courses === 1 ? 'course' : 'courses'}</span></span>
          </div>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-[1240px] gap-8 px-4 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-14">
        <div className="order-first -mt-6 lg:order-last lg:-mt-16"><div className="lg:sticky lg:top-20">{buyCard}</div></div>

        <div className="flex min-w-0 flex-col gap-8 lg:pt-8">
          <section className="grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-4">
            {[
              [String(p.counts.courses), `course${p.counts.courses === 1 ? '' : 's'} with lessons, notes and quizzes`],
              [p.counts.questions ? String(p.counts.questions) : 'Practice', p.counts.questions ? 'practice questions with explanations' : 'quizzes in every course'],
              ['Mocks', 'timed exams in the Test Centre'],
              [p.live ? 'Live' : p.addOns.live || p.addOns.mentorship ? '+ Extras' : 'Certificates', p.live ? `classes with ${p.live.cohort}` : p.addOns.live || p.addOns.mentorship ? 'add live classes or a mentor' : 'for every course you finish'],
            ].map(([b, t], i) => (
              <div key={t} className={`flex flex-col items-center gap-1 p-4 text-center ${i ? 'border-t border-line sm:border-l sm:border-t-0' : ''}`}><b className="text-[22px] font-extrabold">{b}</b><span className="text-[13px] text-ink2">{t}</span></div>
            ))}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-baseline gap-2"><h2 className="flex-1 text-[22px] font-extrabold tracking-[-0.01em]">Everything inside</h2><span className="text-[13.5px] text-muted">{s(p.counts.courses, 'course')}{soon ? ` · ${soon} coming soon` : ''}</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {p.courses.map(c => {
                const inner = (
                  <>
                    <Cover src={c.coverUrl} label={[c.exam, c.subject].filter(Boolean).join(' · ') || c.title} seed={c.id} className="h-[88px] w-full" />
                    <span className="flex flex-1 flex-col gap-1.5 p-3">
                      <b className="line-clamp-2 text-[14px] leading-snug">{c.title}</b>
                      {c.lessons ? <span className="text-[12.5px] text-muted">{c.teacher?.name ? `${c.teacher.name} · ` : ''}{s(c.modules, 'module')} · {s(c.lessons, 'lesson')}</span>
                        : <span className="w-fit rounded-md bg-[#F1F4FA] px-2 py-0.5 text-[11.5px] font-extrabold text-muted">Lessons coming soon</span>}
                    </span>
                  </>
                );
                return c.slug && c.lessons
                  ? <Link key={c.id} href={`/courses/${c.slug}`} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white hover:border-[#5889FA]">{inner}</Link>
                  : <div key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">{inner}</div>;
              })}
            </div>
          </section>

          {p.teachers.length > 0 && (
            <section>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Who teaches it</h2>
              <div className="flex flex-wrap gap-3">
                {p.teachers.map(t => <span key={t.name} className="flex items-center gap-2.5 rounded-xl border border-line bg-white py-2 pl-2 pr-4"><Face name={t.name} src={t.avatarUrl} size={40} /><b className="text-[14px]">{t.name}</b></span>)}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">How a week looks</h2>
            <div className="grid gap-2 rounded-xl border border-line bg-white p-4 text-center text-[13px] sm:grid-cols-5">
              {[['Mon–Thu', '2 short lessons a day'], ['Fri', 'a topic quiz'], ['Sat', 'practice questions'], ['Sun', p.live || p.addOns.live ? 'a live class' : 'revise your notes'], ['Every 2 weeks', 'a timed mock']].map(([d, t]) => (
                <div key={d} className="rounded-lg bg-[#F8F9FC] p-3"><b className="block text-navy">{d}</b><span className="text-muted">{t}</span></div>
              ))}
            </div>
          </section>

          {p.live && p.live.next.length > 0 && (
            <section>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Live classes included</h2>
              <div className="rounded-xl border border-line bg-white p-5 text-[14px] text-ink2">
                <p><b className="text-navy">{p.live.cohort}</b>{p.live.teacher ? ` with ${p.live.teacher}` : ''}. Next classes:</p>
                <ul className="mt-2 flex flex-col gap-1">{p.live.next.map(l => <li key={l.scheduledAt}>{new Date(l.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })} · {l.title}</li>)}</ul>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">One course or the package?</h2>
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full min-w-[460px] border-collapse text-[14px]">
                <thead><tr className="bg-[#FAFBFE] text-[12px] uppercase tracking-[0.06em] text-muted"><th className="px-4 py-3 text-left font-bold" /><th className="px-4 py-3 font-bold">One course</th><th className="px-4 py-3 font-bold text-[#2F57C9]">{p.name}</th></tr></thead>
                <tbody className="text-center">
                  <tr className="border-t border-line"><td className="px-4 py-3 text-left">Courses</td><td>1</td><td className="font-bold">{p.counts.courses}</td></tr>
                  <tr className="border-t border-line"><td className="px-4 py-3 text-left">Practice and mock exams</td><td>that course</td><td className="font-bold">all {p.counts.courses}</td></tr>
                  <tr className="border-t border-line"><td className="px-4 py-3 text-left">Access</td><td>per course</td><td className="font-bold">{p.months ? `${p.months} months` : 'one plan'}</td></tr>
                  <tr className="border-t border-line"><td className="px-4 py-3 text-left">Live classes and a mentor</td><td>—</td><td className="font-bold">{p.live ? 'included' : p.addOns.live || p.addOns.mentorship ? 'can be added' : '—'}</td></tr>
                  <tr className="border-t border-line"><td className="px-4 py-3 text-left">Price</td><td>{p.worth ? `${price(p.worth, p.currency)} for all` : 'each on its own'}</td><td className="font-bold">{price(p.priceAmount, p.currency)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Questions</h2>
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              {faq.map(f => (
                <details key={f.q} className="group border-t border-line first:border-t-0">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[15px] font-bold hover:bg-[#FAFBFE]"><span className="flex-1">{f.q}</span><span className="text-lg text-muted group-open:rotate-45">+</span></summary>
                  <p className="whitespace-pre-line px-5 pb-4 text-[14px] leading-relaxed text-ink2">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="min-w-0"><b className="block text-[18px] leading-tight">{price(p.priceAmount, p.currency)}</b><span className="text-[11.5px] text-muted">{s(p.counts.courses, 'course')}{p.months ? ` · ${p.months} months` : ''}</span></span>
        <Link href={checkout} className="flex h-11 flex-1 items-center justify-center rounded-md bg-[#2F57C9] text-[15px] font-extrabold text-white">Get the package</Link>
      </div>
      <PublicFooter />
    </div>
  );
}
