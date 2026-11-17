'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Cover, Face, price } from '@/components/public/PublicChrome';

export interface BrowseCourse {
  id: string; slug: string; title: string; summary: string | null; coverUrl: string | null;
  exam: { id: string; name: string } | null; subject: { id: string; name: string } | null;
  teacher: { id: string; name: string | null; avatarUrl: string | null } | null;
  modules: number; lessons: number; questions: number;
  selling: 'free' | 'paid' | 'package' | 'notsale'; price: { amount: number; currency: string } | null;
  website: boolean; joinedThisMonth: number; students: number; added: string;
}
export interface BrowseData {
  courses: BrowseCourse[];
  start: BrowseCourse | null;
  package: { id: string; name: string; priceAmount: number; currency: string; courses: number } | null;
  packages: number;
}
interface F { q: string; exam: string; price: string; subject: string; where: string; teacher: string; sort: string }
const BLANK: F = { q: '', exam: '', price: '', subject: '', where: '', teacher: '', sort: 'popular' };

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const priceText = (c: BrowseCourse) => c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'free' ? 'Free' : c.selling === 'package' ? 'In a package' : 'Soon';
const size = (c: BrowseCourse) => c.website ? null : [c.modules && s(c.modules, 'module'), c.lessons && s(c.lessons, 'lesson')].filter(Boolean).join(' · ') || null;
const matches = (c: BrowseCourse, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${c.title} ${c.summary ?? ''} ${c.exam?.name ?? ''} ${c.subject?.name ?? ''} ${c.teacher?.name ?? ''}`.toLowerCase();
  return words.every(w => hay.includes(w));
};

/** The public course list: search, exam chips, shelves to browse, a filter rail (a sheet on phones), one grid once you search */
export function CourseBrowser({ data, initial }: { data: BrowseData; initial: Record<string, string | undefined> }) {
  const [f, setF] = useState<F>({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).filter(k => initial[k]).map(k => [k, initial[k]!])) });
  const [q, setQ] = useState(f.q);
  const [sheet, setSheet] = useState(false);
  const all = data.courses;

  // Search as you type; the address keeps the choices so a search can be shared
  useEffect(() => { const t = setTimeout(() => setF(x => (x.q === q ? x : { ...x, q })), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && !(k === 'sort' && v === 'popular')) p.set(k, v);
    history.replaceState(null, '', p.toString() ? `/courses?${p}` : '/courses');
  }, [f]);

  const pass = (c: BrowseCourse, skip?: keyof F) =>
    (skip === 'exam' || !f.exam || c.exam?.id === f.exam)
    && (skip === 'price' || !f.price || (f.price === 'free' ? c.selling === 'free' : f.price === 'paid' ? c.selling === 'paid' : c.selling === 'package'))
    && (skip === 'subject' || !f.subject || c.subject?.id === f.subject)
    && (skip === 'where' || !f.where || (f.where === 'portal' ? !c.website : c.website))
    && (skip === 'teacher' || !f.teacher || c.teacher?.id === f.teacher)
    && (!f.q || matches(c, f.q));

  const shown = useMemo(() => {
    const list = all.filter(c => pass(c));
    if (f.sort === 'new') return [...list].sort((a, b) => +new Date(b.added) - +new Date(a.added));
    if (f.sort === 'az') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [all, f]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts for each option, given the other choices
  const count = (key: keyof F, test: (c: BrowseCourse) => boolean) => all.filter(c => pass(c, key) && test(c)).length;
  const exams = useMemo(() => [...new Map(all.filter(c => c.exam).map(c => [c.exam!.id, c.exam!])).values()]
    .map(e => ({ ...e, n: all.filter(c => c.exam?.id === e.id).length })).sort((a, b) => b.n - a.n), [all]);
  const subjects = useMemo(() => [...new Map(all.filter(c => c.subject).map(c => [c.subject!.id, c.subject!])).values()], [all]);
  const teachers = useMemo(() => {
    const m = new Map<string, { id: string; name: string | null; avatarUrl: string | null; n: number; subjects: Set<string> }>();
    for (const c of all) if (c.teacher) { const t = m.get(c.teacher.id) ?? { ...c.teacher, n: 0, subjects: new Set<string>() }; t.n++; if (c.subject) t.subjects.add(c.subject.name); m.set(c.teacher.id, t); }
    return [...m.values()].sort((a, b) => Number(!!b.avatarUrl) - Number(!!a.avatarUrl) || b.n - a.n);
  }, [all]);
  const free = all.filter(c => c.selling === 'free').length;
  const browsing = !f.q && !f.price && !f.subject && !f.where && !f.teacher && f.sort === 'popular';
  const set = (k: keyof F, v: string) => setF(x => ({ ...x, [k]: x[k] === v ? '' : v }));
  const chosen = ([['exam', exams.find(e => e.id === f.exam)?.name], ['price', { free: 'Free', paid: 'Paid', package: 'In a package' }[f.price]], ['subject', subjects.find(x => x.id === f.subject)?.name], ['where', { portal: 'On the portal', website: 'On careerpathafrica.com' }[f.where]], ['teacher', teachers.find(t => t.id === f.teacher)?.name]] as [keyof F, string | undefined][]).filter(([, v]) => v);

  const shelf = (title: string, list: BrowseCourse[], more?: { label: string; on: () => void }) => list.length > 0 && (
    <section key={title}>
      <div className="mb-3 flex items-baseline gap-3"><h2 className="flex-1 text-[20px] font-extrabold tracking-[-0.01em]">{title}</h2>{more && <button onClick={more.on} className="text-[13.5px] font-extrabold text-azure-strong hover:underline">{more.label}</button>}</div>
      <Grid list={list.slice(0, 4)} />
    </section>
  );

  const rail = (
    <div className="flex flex-col gap-5 text-[13.5px]">
      <Group title="Price" value={f.price} onPick={v => set('price', v)} options={[['', 'Any', count('price', () => true)], ['free', 'Free', count('price', c => c.selling === 'free')], ['paid', 'Paid', count('price', c => c.selling === 'paid')], ...(data.packages ? [['package', 'In a package', count('price', c => c.selling === 'package')] as [string, string, number]] : [])]} />
      {subjects.length > 0 && <Group title="Subject" value={f.subject} onPick={v => set('subject', v)} options={[['', 'Any', count('subject', () => true)], ...subjects.map(x => [x.id, x.name, count('subject', c => c.subject?.id === x.id)] as [string, string, number]).sort((a, b) => b[2] - a[2])]} />}
      <Group title="Where you study" value={f.where} onPick={v => set('where', v)} options={[['', 'Any', count('where', () => true)], ['portal', 'On the portal', count('where', c => !c.website)], ['website', 'On careerpathafrica.com', count('where', c => c.website)]]} />
      {teachers.length > 0 && <Group title="Teacher" value={f.teacher} onPick={v => set('teacher', v)} options={[['', 'Anyone', count('teacher', () => true)], ...teachers.slice(0, 10).map(t => [t.id, t.name ?? 'Teacher', count('teacher', c => c.teacher?.id === t.id)] as [string, string, number])]} />}
    </div>
  );

  return (
    <>
      {/* Hero */}
      <section className="bg-[#3F6FE8]">
        <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 pb-8 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-10">
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]">Courses · {all.length} · free to start</p>
            <h1 className="text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[46px]">{all.length} courses,<br /><span className="text-white">{free === all.length ? 'all of them free.' : `${free} of them free.`}</span></h1>
            <p className="max-w-[560px] text-[16px] leading-relaxed text-[#0B1F55]">Lessons, notes and quizzes from teachers across Africa. Pick your exam, or search a subject or topic.</p>
            <form onSubmit={e => { e.preventDefault(); setF(x => ({ ...x, q })); }} className="mt-1 flex max-w-[600px] items-center rounded-lg bg-white p-1.5 shadow-[0_10px_24px_rgba(7,32,97,0.18)]">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a subject, topic or teacher…" aria-label="Search courses" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-navy outline-none placeholder:text-[#9AA6C2]" />
              {q && <button type="button" onClick={() => { setQ(''); setF(x => ({ ...x, q: '' })); }} aria-label="Clear the search" className="px-2 text-muted">✕</button>}
              <button className="h-10 rounded-md bg-[#2F57C9] px-4 text-[14px] font-extrabold text-white">Search</button>
            </form>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Exams">
              <button onClick={() => setF(x => ({ ...x, exam: '' }))} aria-pressed={!f.exam} className={clsx('h-8 flex-shrink-0 rounded-md px-3 text-[13.5px] font-bold', !f.exam ? 'bg-white text-navy' : 'bg-white/25 text-navy hover:bg-white/40')}>All <span className="opacity-60">{all.length}</span></button>
              {exams.map(e => <button key={e.id} onClick={() => set('exam', e.id)} aria-pressed={f.exam === e.id} className={clsx('h-8 flex-shrink-0 rounded-md px-3 text-[13.5px] font-bold', f.exam === e.id ? 'bg-white text-navy' : 'bg-white/25 text-navy hover:bg-white/40')}>{e.name} <span className="opacity-60">{e.n}</span></button>)}
            </div>
          </div>
          {(data.package || data.start) && (
            <div className="hidden flex-col gap-2.5 rounded-xl bg-white p-4 shadow-[0_14px_30px_rgba(7,32,97,0.22)] lg:flex lg:-rotate-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">{data.package ? 'Best value' : 'New here? Start with'}</p>
              {data.package ? <>
                <b className="text-[17px] leading-tight">{data.package.name}</b>
                <p className="text-[13px] text-muted">{s(data.package.courses, 'course')} at one price · {price(data.package.priceAmount, data.package.currency)}</p>
                <Link href={`/packages/${data.package.id}`} className="flex h-9 items-center justify-center rounded-md bg-[#2F57C9] text-[13.5px] font-extrabold text-white">See the package</Link>
              </> : data.start && <>
                <div className="flex items-center gap-3">
                  <Cover src={data.start.coverUrl} label={data.start.exam?.name} seed={data.start.id} className="h-16 w-16 flex-shrink-0 rounded-[10px]" />
                  <span className="min-w-0"><b className="block text-[14.5px] leading-snug">{data.start.title}</b><span className="text-[12.5px] text-muted">{size(data.start) ?? 'Free'} · free</span></span>
                </div>
                <Link href={`/courses/${data.start.slug}`} className="flex h-9 items-center justify-center rounded-md bg-[#2F57C9] text-[13.5px] font-extrabold text-white">Open the course</Link>
                {data.packages > 0 && <p className="text-[12px] text-muted">Or see <Link href="/packages" className="font-bold text-azure-strong">packages</Link>: several courses at one price</p>}
              </>}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-[1240px] gap-7 px-4 py-6 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-8">
        <aside className="hidden lg:block" aria-label="Filters">{rail}</aside>
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[15px]">{s(shown.length, 'course')}{f.q ? ` for “${f.q}”` : ''}</b>
            {chosen.map(([k, v]) => <button key={k} onClick={() => setF(x => ({ ...x, [k]: '' }))} className="inline-flex h-7 items-center gap-1 rounded-md bg-[#EAF0FF] px-2.5 text-[12.5px] font-bold text-[#2F57C9]">{v} <span aria-hidden>✕</span><span className="sr-only">remove</span></button>)}
            {(chosen.length > 0 || f.q) && <button onClick={() => { setF(BLANK); setQ(''); }} className="text-[13px] font-bold text-azure-strong hover:underline">Clear all</button>}
            <span className="flex-1" />
            <button onClick={() => setSheet(true)} className="h-9 rounded-md border border-line bg-white px-3 text-[13.5px] font-bold lg:hidden">Filters{chosen.filter(([k]) => k !== 'exam').length ? ` · ${chosen.filter(([k]) => k !== 'exam').length}` : ''}</button>
            <select aria-label="Sort" value={f.sort} onChange={e => setF(x => ({ ...x, sort: e.target.value }))} className="h-9 rounded-md border border-line bg-white px-2.5 text-[13.5px] font-bold text-navy">
              <option value="popular">Most popular</option><option value="new">Newest</option><option value="az">A to Z</option>
            </select>
          </div>

          {browsing && !f.exam ? <>
            {shelf('Most joined this month', all.filter(c => !c.website))}
            {exams.slice(0, 4).map(e => shelf(e.name, all.filter(c => c.exam?.id === e.id).sort((a, b) => Number(a.website) - Number(b.website)), { label: `All ${e.n} →`, on: () => set('exam', e.id) }))}
            <section className="flex flex-wrap items-center gap-5 rounded-xl bg-[#072061] p-5 text-white sm:p-6">
              <span className="relative h-[62px] w-[90px] flex-shrink-0" aria-hidden><span className="absolute left-0 top-2.5 h-11 w-14 -rotate-6 rounded-md bg-[#17703A]" /><span className="absolute left-[18px] top-1 h-11 w-14 rounded-md bg-[#6B3FB8]" /><span className="absolute left-[34px] top-0 h-11 w-14 rotate-6 rounded-md bg-[#3F6FE8]" /></span>
              <span className="min-w-[200px] flex-1"><b className="text-[19px]">Studying several subjects?</b><span className="mt-1 block text-[14px] text-[#C9D6FF]">{data.packages ? 'A package gives you a set of courses at one price, with practice and mock exams.' : 'Packages of several courses at one price are coming soon. Every course here is free to start meanwhile.'}</span></span>
              <Link href="/packages" className="inline-flex h-10 items-center rounded-md bg-white px-4 text-[14px] font-extrabold text-[#2F57C9]">See packages</Link>
            </section>
            {teachers.filter(t => t.avatarUrl).length > 0 && (
              <section>
                <h2 className="mb-3 text-[20px] font-extrabold tracking-[-0.01em]">Learn with these teachers</h2>
                <div className="flex flex-wrap gap-2.5">
                  {teachers.filter(t => t.avatarUrl).slice(0, 8).map(t => (
                    <button key={t.id} onClick={() => set('teacher', t.id)} className="flex items-center gap-2.5 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4 text-left hover:border-[#5889FA]">
                      <Face name={t.name} src={t.avatarUrl} size={38} />
                      <span><b className="block text-[13.5px]">{t.name}</b><span className="text-[12px] text-muted">{[...t.subjects].slice(0, 2).join(' · ') || 'Teacher'} · {s(t.n, 'course')}</span></span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <div className="mb-3 flex items-baseline gap-3"><h2 className="flex-1 text-[20px] font-extrabold tracking-[-0.01em]">All courses</h2><span className="text-[13px] text-muted">{s(all.length, 'course')}</span></div>
              <Grid list={shown} />
            </section>
          </> : shown.length ? <Grid list={shown} /> : (
            <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center">
              <b className="text-[17px]">No courses{f.q ? ` for “${f.q}”` : ''} with these choices yet.</b>
              <p className="mt-1.5 text-[14px] text-ink2">Try {subjects.slice(0, 3).map((x, i) => <span key={x.id}>{i ? ', ' : ''}<button onClick={() => { setQ(x.name); setF({ ...BLANK, q: x.name }); }} className="font-bold text-azure-strong hover:underline">{x.name.toLowerCase()}</button></span>)}, or <button onClick={() => { setF(BLANK); setQ(''); }} className="font-bold text-azure-strong hover:underline">see every course</button>.</p>
            </div>
          )}
        </div>
      </main>

      {/* Phones: filters as a bottom sheet */}
      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end bg-[#072061]/45 lg:hidden" onClick={() => setSheet(false)}>
          <div role="dialog" aria-label="Filters" className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white px-4 pb-5 pt-2.5" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-line" />
            <div className="mb-4 flex items-center"><b className="flex-1 text-[18px]">Filters</b><button onClick={() => setF(x => ({ ...BLANK, q: x.q, exam: x.exam }))} className="text-[13.5px] font-bold text-azure-strong">Clear</button></div>
            {rail}
            <div className="sticky bottom-0 -mx-4 mt-5 border-t border-line bg-white px-4 pt-3">
              <button onClick={() => setSheet(false)} className="flex h-12 w-full items-center justify-center rounded-md bg-[#2F57C9] text-[15px] font-extrabold text-white">Show {s(shown.length, 'course')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ title, value, options, onPick }: { title: string; value: string; options: [string, string, number][]; onPick: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="mb-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">{title}</legend>
      {options.map(([v, l, n]) => (
        <label key={v || 'any'} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-navy hover:bg-white', n === 0 && value !== v && 'opacity-40')}>
          <input type="radio" name={title} checked={value === v} onChange={() => onPick(v)} className="h-4 w-4 accent-[#2F57C9]" />
          <span className="min-w-0 flex-1 truncate">{l}</span><span className="text-[12.5px] tabular-nums text-[#9AA6C2]">{n}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Cards on computers, compact rows on phones */
function Grid({ list }: { list: BrowseCourse[] }) {
  return <>
    <div className="hidden gap-3.5 sm:grid sm:grid-cols-2 xl:grid-cols-4">{list.map(c => <Card key={c.id} c={c} />)}</div>
    <div className="overflow-hidden rounded-xl border border-line bg-white sm:hidden">{list.map(c => <Row key={c.id} c={c} />)}</div>
  </>;
}

function Card({ c }: { c: BrowseCourse }) {
  const sz = size(c);
  return (
    <Link href={`/courses/${c.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:-translate-y-0.5 hover:border-[#5889FA] hover:shadow-[0_12px_26px_rgba(7,32,97,0.1)]">
      <Cover src={c.coverUrl} label={[c.exam?.name, c.subject?.name].filter(Boolean).join(' · ') || c.title} seed={c.id} className="h-[120px] w-full" />
      <span className="flex flex-1 flex-col gap-1.5 p-3.5">
        {(c.exam || c.subject) && <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted">{[c.exam?.name, c.subject?.name].filter(Boolean).join(' · ')}</span>}
        <b className="line-clamp-2 text-[14.5px] leading-snug group-hover:text-[#2F57C9]">{c.title}</b>
        <span className="flex items-center gap-2 text-[12.5px] text-ink2"><Face name={c.teacher?.name ?? 'CareerPath Africa'} src={c.teacher?.avatarUrl} size={22} /><span className="truncate">{c.teacher?.name ?? 'CareerPath Africa'}</span></span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-[#EEF1F7] pt-2 text-[12.5px] text-muted">
          {c.website ? <span className="rounded-[5px] bg-[#F1F4FA] px-1.5 py-0.5 text-[11px] font-extrabold">On careerpathafrica.com</span> : <span>{c.questions && !sz ? s(c.questions, 'practice question') : sz ?? ''}</span>}
          <b className={clsx('text-[14px]', c.selling === 'free' ? 'text-[#17703A]' : 'text-navy')}>{priceText(c)}</b>
        </span>
      </span>
    </Link>
  );
}

function Row({ c }: { c: BrowseCourse }) {
  return (
    <Link href={`/courses/${c.slug}`} className="flex gap-3 border-t border-[#EEF1F7] p-3 first:border-t-0">
      <Cover src={c.coverUrl} label={c.exam?.name ?? ''} seed={c.id} className="h-[76px] w-[76px] flex-shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        {(c.exam || c.subject) && <span className="block truncate text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted">{[c.exam?.name, c.subject?.name].filter(Boolean).join(' · ')}</span>}
        <b className="line-clamp-2 text-[14px] leading-snug">{c.title}</b>
        <span className="block truncate text-[12px] text-muted">{c.teacher?.name ?? 'CareerPath Africa'}{size(c) ? ` · ${size(c)}` : c.website ? ' · on careerpathafrica.com' : ''}</span>
        <b className={clsx('text-[13px]', c.selling === 'free' ? 'text-[#17703A]' : 'text-navy')}>{priceText(c)}</b>
      </span>
    </Link>
  );
}
