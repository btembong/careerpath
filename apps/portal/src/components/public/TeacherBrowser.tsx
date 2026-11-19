'use client';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Flag } from '@/components/ui/Flag';
import { PublicTeacherCard, PublicTeacherRow, type PublicTeacher } from './PublicTeachers';

const short = (s: string) => s.replace('English Language', 'English').replace('Core Mathematics', 'Maths').replace('Literature in English', 'Literature').replace('Business Management', 'Business');

/** /teachers for visitors: a blue hero with search, subject chips and the countries card, then every teacher as the portal card */
export function TeacherBrowser({ list, initial }: { list: PublicTeacher[]; initial: { q: string; subject: string; country: string; video: boolean } }) {
  const [q, setQ] = useState(initial.q);
  const [subject, setSubject] = useState(initial.subject);
  const [country, setCountry] = useState(initial.country);
  const [video, setVideo] = useState(initial.video);
  const [more, setMore] = useState(false);

  // The address keeps the filters, so a search can be shared
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (subject) p.set('subject', subject);
    if (country) p.set('country', country);
    if (video) p.set('video', '1');
    const s = p.toString();
    window.history.replaceState(null, '', s ? `/teachers?${s}` : '/teachers');
  }, [q, subject, country, video]);

  const subjects = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach(t => t.subjects.forEach(s => m.set(s, (m.get(s) ?? 0) + 1)));
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [list]);
  const countries = useMemo(() => {
    const m = new Map<string, { code: string; name: string; n: number }>();
    list.forEach(t => { if (t.country) { const e = m.get(t.country.code) ?? { ...t.country, n: 0 }; e.n++; m.set(t.country.code, e); } });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [list]);

  const shown = list.filter(t => (!subject || t.subjects.includes(subject)) && (!country || t.country?.code === country) && (!video || t.hasVideo)
    && (!q.trim() || `${t.name} ${t.subjects.join(' ')} ${t.country?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const chip = (on: boolean) => clsx('inline-flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13.5px] font-bold', on ? 'bg-[#FFFFFF] text-navy' : 'bg-[rgba(255,255,255,0.25)] text-navy hover:bg-[rgba(255,255,255,0.4)]');
  const top = more ? subjects : subjects.slice(0, 6);

  return (
    <>
      <section className="bg-[#3F6FE8]">
        <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-12">
          <div className="flex min-w-0 flex-col">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em]">Teachers · {list.length} · {countries.length} {countries.length === 1 ? 'country' : 'countries'}</p>
            <h1 className="mt-2 text-[38px] font-extrabold leading-none tracking-[-0.035em] sm:text-[46px]">Real teachers,<br /><span className="text-[#FFFFFF]">from your exam board.</span></h1>
            <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-[#0B1F55]">Every teacher is checked by our team before they teach. See their courses, watch their intro, and book them for mentoring with a package.</p>
            <form role="search" onSubmit={e => e.preventDefault()} className="mt-4 flex max-w-[600px] rounded-lg bg-[#FFFFFF] p-1.5 shadow-[0_10px_24px_rgba(7,32,97,0.18)]">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search teachers" placeholder="Search a teacher or subject… e.g. “chemistry”, “nursing”"
                className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-navy outline-none placeholder:text-[#9AA6C2]" />
              <button type="submit" className="inline-flex h-10 items-center rounded-md bg-[#2F57C9] px-4 text-sm font-extrabold text-[#FFFFFF]">Search</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setSubject('')} aria-pressed={!subject} className={chip(!subject)}>All {list.length}</button>
              {top.map(([s, n]) => <button key={s} type="button" onClick={() => setSubject(subject === s ? '' : s)} aria-pressed={subject === s} className={chip(subject === s)}>{short(s)} <span className="opacity-75">{n}</span></button>)}
              {subjects.length > 6 && <button type="button" onClick={() => setMore(v => !v)} aria-expanded={more} className={chip(false)}>{more ? 'Fewer' : 'More'} {more ? '▴' : '▾'}</button>}
            </div>
          </div>
          {countries.length > 0 && (
            <div className="hidden flex-col gap-2.5 rounded-xl bg-[#FFFFFF] p-4 shadow-[0_14px_30px_rgba(7,32,97,0.22)] lg:flex lg:-rotate-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">Teachers from</p>
              {countries.slice(0, 6).map(c => (
                <button key={c.code} type="button" onClick={() => setCountry(country === c.code ? '' : c.code)} aria-pressed={country === c.code}
                  className={clsx('flex items-center justify-between rounded-md px-1.5 py-1 text-left text-[14px] text-navy hover:bg-[#F4F6FB]', country === c.code && 'bg-[#EAF0FF]')}>
                  <span className="flex items-center gap-2"><Flag code={c.code} />{c.name}</span><b>{c.n}</b>
                </button>
              ))}
              <span className="text-[12.5px] text-[#637090]">Tap a country to see its teachers</span>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-8 sm:pb-12">
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5 text-[13.5px]">
          <b className="text-[15px]">{shown.length} teacher{shown.length === 1 ? '' : 's'}</b>
          {(subject || country || video || q.trim()) && <button type="button" onClick={() => { setQ(''); setSubject(''); setCountry(''); setVideo(false); }} className="font-bold text-[#2F57C9] hover:underline">Clear</button>}
          <span className="flex-1" />
          <select aria-label="Country" value={country} onChange={e => setCountry(e.target.value)} className="h-[34px] rounded-md border border-[#D5DDEC] bg-white px-2.5 font-bold text-navy">
            <option value="">Country: All</option>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.n})</option>)}
          </select>
          <button type="button" aria-pressed={video} onClick={() => setVideo(v => !v)}
            className={clsx('h-[34px] rounded-md border px-2.5 font-bold', video ? 'border-[#3F6FE8] bg-[#EAF0FF] text-navy' : 'border-[#D5DDEC] bg-white text-navy')}>Has a video</button>
        </div>
        {!shown.length ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white p-10 text-center">
            <b className="text-[17px]">No teachers match.</b>
            <p className="text-[14px] text-ink2">Try another subject or country.</p>
          </div>
        ) : <>
          <div className="flex flex-col gap-2 sm:hidden">{shown.map(t => <PublicTeacherRow key={t.slug} t={t} />)}</div>
          <div className="hidden gap-3.5 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{shown.map(t => <PublicTeacherCard key={t.slug} t={t} />)}</div>
        </>}
      </main>
    </>
  );
}
