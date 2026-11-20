'use client';
import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Cover, perMonth, price } from '@/components/public/PublicChrome';

export interface ListPkg {
  id: string; name: string; description: string | null; priceAmount: number; currency: string; bestValue: boolean; months: number | null;
  courses: number; lessons: number; exams: string[]; covers: string[]; live: boolean; liveAddOn: boolean; mentorship: boolean; published?: boolean;
  subjects?: string[]; teachers?: { name: string | null; avatarUrl: string | null }[]; teacherCount?: number; questions?: number; soon?: number;
  mentorPerMonth?: number | null; mentorIncluded?: boolean; mentorAddOn?: { perMonth: number; price: number } | null; liveAddOnPrice?: number | null; worth?: number | null;
}

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const initials = (n: string | null) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const short = (n: string) => n.replace(/\s+Package$/i, '');
// Drafts only show in an admin's preview, and open their own preview
const pageOf = (p: ListPkg) => `/packages/${p.id}${p.published === false ? '?preview=1' : ''}`;
const TILT = ['-rotate-[5deg]', 'rotate-[4deg]', '-rotate-2'];
const mentorText = (p: ListPkg) => p.mentorIncluded
  ? (p.mentorPerMonth == null ? 'Mentoring included' : p.mentorPerMonth === 1 ? 'Mentor once a month' : `Mentor ${p.mentorPerMonth === 2 ? 'twice' : `${p.mentorPerMonth} times`} a month`)
  : p.mentorAddOn ? 'Mentor as an add-on' : null;
const liveText = (p: ListPkg) => p.live ? 'Live classes' : p.liveAddOn ? 'Live classes as an add-on' : null;

const WHY: [IconName, string, string][] = [
  ['courses', 'Many courses, one price', 'for the whole exam'],
  ['grade', 'Practice and mocks', 'marked straight away'],
  ['mentorship', 'A mentor or a class', 'when the package has one'],
];

/** /packages for visitors: the hero with exam chips, the package cards (one alone gets the whole row), a comparison once there are two */
export function PackagesView({ list, courseCount }: { list: ListPkg[]; courseCount: number }) {
  const [exam, setExam] = useState('');
  const exams = [...new Set(list.flatMap(p => p.exams))].map(e => ({ e, n: list.filter(p => p.exams.includes(e)).length }));
  // Best value first: the admin's choice
  const shown = list.filter(p => !exam || p.exams.includes(exam)).sort((a, b) => Number(b.bestValue) - Number(a.bestValue));
  return (
    <>
      <section className="bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_50%,#6B8BFF_100%)] text-[#FFFFFF]">
        <div className="mx-auto grid max-w-[1240px] items-center gap-7 px-4 pb-9 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <h1 className="text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] text-[#FFFFFF] sm:text-[48px]">Pick your <span className="text-[#072061]">package.</span></h1>
            <p className="max-w-[560px] text-[16px] leading-relaxed text-[#EEF3FF]">Several courses at one price, with practice questions and timed mocks. Some come with a mentor or a live class.</p>
            {exams.length > 1 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Exams">
                {[{ e: '', n: list.length }, ...exams].map(({ e, n }) => (
                  <button key={e || 'all'} onClick={() => setExam(e)} aria-pressed={exam === e}
                    className={clsx('h-8 flex-shrink-0 rounded-md px-3 text-[13.5px] font-bold', exam === e ? 'bg-[#FFFFFF] text-navy' : 'bg-[rgba(255,255,255,0.22)] text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.32)]')}>
                    {e || 'All'} <span className="opacity-65">{n}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 text-[12px] font-extrabold text-navy">{['MTN MoMo', 'Orange Money', 'Visa · Mastercard'].map(x => <span key={x} className="inline-flex h-[26px] items-center rounded-md bg-[#FFFFFF] px-2.5">{x}</span>)}</div>
          </div>
          <div className="hidden -rotate-2 flex-col gap-2 lg:flex">
            {WHY.map(([icon, a, b]) => (
              <div key={a} className="flex items-center gap-2.5 rounded-xl bg-[#FFFFFF] px-3.5 py-3 text-[13.5px] text-navy shadow-[0_14px_30px_rgba(7,32,97,0.22)]">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] text-[#2F57C9]"><Icon name={icon} size={15} /></span>
                <span><b className="block">{a}</b>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-4 py-9 sm:px-8">
        {!list.length ? (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 rounded-xl border border-line bg-[#FFFFFF] p-8 text-center">
            <b className="text-[20px]">New packages are on their way.</b>
            <p className="text-[14.5px] text-ink2">In the meantime, start with the free courses: no payment needed.</p>
            <Link href="/courses" className="inline-flex h-11 items-center rounded-md bg-[#2F57C9] px-5 font-bold text-[#FFFFFF]">See the courses</Link>
          </div>
        ) : <PackageGrid list={shown} />}

        {shown.length > 1 && (
          <section>
            <h2 className="mb-1 text-[24px] font-extrabold tracking-[-0.02em]">Compare side by side</h2>
            {/* More than four columns can't be read side by side: the first four, and the chips narrow it */}
            <p className="mb-3.5 text-[13.5px] text-[#637090]">{shown.length > 4 ? `The first 4 of ${shown.length}.${exams.length > 1 ? ' Pick an exam above to compare others.' : ''}` : 'Everything each package includes, in one table.'}</p>
            <PackageCompare list={shown.slice(0, 4)} />
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-[linear-gradient(135deg,#EAF0FF,#DCE6FF)] px-[22px] py-5">
            <span className="min-w-[200px] flex-1"><b className="text-[18px]">Only need one subject?</b><span className="mt-1 block text-[14px] text-[#3A4A6B]">{courseCount ? `${courseCount} single courses, ` : 'Single courses, '}every one free to start.</span></span>
            <Link href="/courses" className="inline-flex h-10 items-center gap-1.5 rounded-[9px] bg-[#2F57C9] px-3.5 text-[14px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">Browse courses<Icon name="arrowRight" size={14} /></Link>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-[#072061] px-[22px] py-5 text-[#FFFFFF]">
            <span className="min-w-[200px] flex-1"><b className="text-[18px]">Buying for a class?</b><span className="mt-1 block text-[14px] text-[#C9D4F2]">Schools get seats at a price per student, and see every student’s progress.</span></span>
            <Link href="/schools" className="inline-flex h-10 items-center gap-1.5 rounded-[9px] bg-[#FFFFFF] px-3.5 text-[14px] font-extrabold text-[#2F57C9]">For schools<Icon name="arrowRight" size={14} /></Link>
          </div>
        </div>

        <section>
          <h2 className="mb-1 text-[24px] font-extrabold tracking-[-0.02em]">Questions</h2>
          {[
            ['What’s the difference between a package and a course?', 'A course is one subject or topic. A package puts several courses together at one price, usually everything for one exam, and can come with a mentor or a live class.'],
            ['What happens when my months are up?', 'Your access to the package’s courses ends; your certificates and progress stay. You can buy the package again to keep going.'],
            ['Can I pay with MTN or Orange Money?', 'Yes: MTN Mobile Money, Orange Money or a card. You get a receipt by email straight away.'],
            ['How do I book my mentor?', 'If your package includes mentoring, open Mentorship in your portal: pick a teacher, a day and a time.'],
          ].map(([q, a]) => (
            <details key={q} className="group border-t border-line first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[16px] font-bold"><span className="flex-1">{q}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF0FF] text-[#3F6FE8]"><Icon name="chevronRight" size={15} className="transition-transform group-open:rotate-90" /></span></summary>
              <p className="pb-4 pr-12 text-[15px] leading-relaxed text-[#3A4A6B]">{a}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  );
}

export function PackageGrid({ list }: { list: ListPkg[] }) {
  if (list.length === 1) return <PackageCard p={list[0]} wide />;
  return <div className="grid gap-x-5 gap-y-7 md:grid-cols-2 xl:grid-cols-3">{list.map(p => <PackageCard key={p.id} p={p} />)}</div>;
}

function Badge({ icon, label, cls }: { icon: IconName; label: string; cls: string }) {
  return <span className={clsx('inline-flex h-[26px] flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-extrabold', cls)}><Icon name={icon} size={13} />{label}</span>;
}

/** A signed-in student's package: until when, and an extra they can still add */
export interface PkgOwned { until: string | null; add?: { label: string; href: string } | null }

export function PackageCard({ p, wide, signedIn, owned, dim }: { p: ListPkg; wide?: boolean; signedIn?: boolean; owned?: PkgOwned | null; dim?: boolean }) {
  const href = pageOf(p);
  const checkout = signedIn ? `/packages/${p.id}/checkout` : `/register?next=${encodeURIComponent(`/packages/${p.id}/checkout`)}`;
  const monthly = perMonth(p.priceAmount, p.currency, p.months);
  const teachers = p.teachers ?? [];
  const mentor = mentorText(p);
  const live = liveText(p);
  const badges = [
    owned ? <Badge key="y" icon="check" label="Yours" cls="bg-[#FFFFFF] text-[#17703A] shadow-[0_0_0_1px_rgba(23,112,58,0.35)]" /> : null,
    p.published === false ? <Badge key="d" icon="edit" label="Draft" cls="bg-[#FFF1D6] text-[#8A5A00]" /> : null,
    p.bestValue ? <Badge key="b" icon="star" label="Best value" cls="bg-[#072061] text-[#FFFFFF]" /> : null,
    mentor && p.mentorIncluded ? <Badge key="m" icon="mentorship" label="Mentoring included" cls="bg-[linear-gradient(120deg,#2F57C9,#5B82F5)] text-[#FFFFFF]" /> : null,
    p.live ? <Badge key="l" icon="live" label="Live classes" cls="bg-[linear-gradient(120deg,#2F57C9,#5B82F5)] text-[#FFFFFF]" /> : null,
    p.worth ? <Badge key="s" icon="tag" label={`Save ${price(p.worth - p.priceAmount, p.currency)}`} cls="bg-[#17703A] text-[#FFFFFF]" /> : null,
  ].filter(Boolean).slice(0, 2);
  const tiles: [IconName, string, boolean][] = [
    ['courses', s(p.courses, 'course'), true],
    ['list', p.lessons ? s(p.lessons, 'lesson') : 'Lessons coming', p.lessons > 0],
    ['grade', p.questions ? s(p.questions, 'practice question') : 'No question bank yet', !!p.questions],
    ['mentorship', mentor ?? 'No mentoring', !!mentor],
    ['live', live ?? 'No live classes', !!live],
    ['calendar', p.months ? `${p.months} months access` : 'Access while on sale', true],
  ];
  const covers = [...p.covers, null, null].slice(0, 2);
  const who = teachers.length ? `${teachers.slice(0, 2).map(t => t.name).join(', ')}${(p.teacherCount ?? teachers.length) > 2 ? ` and ${(p.teacherCount ?? teachers.length) - 2} more` : ''}` : 'The CareerPath team';

  return (
    <div className={clsx('flex min-w-0 flex-col gap-2 transition-opacity', dim && 'opacity-40')}>
      <div className="flex h-[26px] gap-1.5 overflow-hidden">{badges}</div>
      <div className={clsx('group relative flex flex-1 overflow-hidden rounded-[18px] bg-white text-navy transition duration-300 hover:-translate-y-1 hover:border-[#3F6FE8] hover:shadow-[0_24px_48px_rgba(47,87,201,0.28)]',
        p.bestValue ? 'border-2 border-[#3F6FE8]' : 'border border-line', wide ? 'flex-col md:flex-row' : 'flex-col')}>
        <Link href={href} aria-label={p.name} className="absolute inset-0 z-[1]" />

        {/* Banner: course pictures under the count, the teachers on the swoosh */}
        <span className={clsx('relative block flex-shrink-0 overflow-hidden bg-[linear-gradient(125deg,#072061_0%,#1B3A94_55%,#2F57C9_100%)]', wide ? 'h-[210px] md:h-auto md:min-h-[330px] md:w-[46%]' : 'h-[170px]')}>
          <span className="absolute -right-10 -top-[30px] h-[250px] w-[230px] -skew-x-[14deg] rounded-[40px_0_0_140px] bg-[linear-gradient(200deg,#8EA8FF,#3F6FE8_60%,#2F57C9)] transition-transform duration-[350ms] group-hover:-translate-x-3" />
          <span className={clsx('absolute h-[130px] w-[170px]', wide ? 'left-5 top-9 md:left-9 md:top-[70px] md:scale-125 md:origin-top-left' : 'left-5 top-[22px]')}>
            {covers.map((c, i) => (
              <span key={i} className={clsx('absolute h-24 w-24 overflow-hidden rounded-xl shadow-[0_14px_28px_rgba(0,0,0,0.35)] transition-transform duration-[350ms]', i ? 'left-[34px] top-3 -rotate-3' : 'left-0 top-[26px] -rotate-[10deg] group-hover:-translate-x-1 group-hover:-rotate-[14deg]')}>
                {c ? <Cover src={c} seed={p.id + i} className="h-full w-full" /> : (
                  // No cover: our own blues, never the generic fallback colours
                  <span className={clsx('flex h-full w-full items-end p-2.5 text-[11px] font-extrabold uppercase leading-tight tracking-[0.04em] text-[#FFFFFF]', i ? 'bg-[linear-gradient(135deg,#5B82F5,#2F57C9)]' : 'bg-[linear-gradient(135deg,#8EA8FF,#3F6FE8)]')}>{p.subjects?.[i] ?? p.exams[i] ?? ''}</span>
                )}
              </span>
            ))}
            <span className="absolute left-[66px] top-0 flex h-24 w-[104px] rotate-6 flex-col items-center justify-center rounded-xl bg-[#FFFFFF] text-[#2F57C9] shadow-[0_14px_28px_rgba(0,0,0,0.35)] transition-transform duration-[350ms] group-hover:rotate-0 group-hover:scale-105">
              <b className="text-[34px] leading-none tracking-[-0.02em]">{p.courses}</b>
              <span className="mt-1 text-[10px] font-extrabold tracking-[0.07em] text-[#637090]">COURSE{p.courses === 1 ? '' : 'S'}</span>
            </span>
          </span>
          {teachers.length > 0 && (
            <span className={clsx('absolute flex', wide ? 'right-5 top-12 md:bottom-16 md:right-9 md:top-auto' : 'right-4 top-[58px]')}>
              {teachers.map((t, i) => (
                <span key={(t.name ?? '') + i} className={clsx('flex items-center justify-center overflow-hidden bg-[#FFFDF8] font-extrabold text-[#3F6FE8] shadow-[0_12px_26px_rgba(7,32,97,0.45)] transition-transform duration-[350ms] group-hover:rotate-0 group-hover:scale-105', TILT[i], i ? '-ml-3.5' : '', wide ? 'h-[54px] w-[54px] rounded-[14px] md:h-[84px] md:w-[84px] md:rounded-[20px]' : 'h-[54px] w-[54px] rounded-[14px]')}>
                  {t.avatarUrl ? <img src={t.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(t.name)}
                </span>
              ))}
            </span>
          )}
          <span className="absolute bottom-2.5 left-4 flex gap-1.5">
            {[...p.exams.slice(0, 2), p.months ? `${p.months} months` : null].filter(Boolean).map(t => <span key={t} className="inline-flex h-[22px] items-center rounded-[5px] bg-[rgba(255,255,255,0.18)] px-2 text-[11px] font-extrabold text-[#FFFFFF]">{t}</span>)}
          </span>
        </span>

        <span className={clsx('relative flex flex-1 flex-col gap-2.5 transition-colors duration-300 group-hover:text-[#FFFFFF]', wide ? 'p-5 md:px-[26px] md:py-6' : 'px-[18px] py-4')}>
          <span aria-hidden className="absolute inset-0 bg-[linear-gradient(210deg,#8EA8FF,#3F6FE8_46%,#2F57C9)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <span className="relative line-clamp-2 text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-muted transition-colors group-hover:text-[#EEF3FF]">{[...p.exams, ...(p.subjects ?? [])].join(' · ')}</span>
          <b className={clsx('relative font-extrabold leading-[1.15] tracking-[-0.02em]', wide ? 'text-[24px] md:text-[28px]' : 'text-[20px]')}>{short(p.name)}</b>
          {p.description && <span className="relative line-clamp-2 text-[14px] leading-normal text-ink2 transition-colors group-hover:text-[#EEF3FF]">{p.description.replace(/\s*\n+\s*(\.{3}|…)?\s*/g, ' ').trim()}</span>}
          <span className={clsx('relative grid gap-1.5', wide ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2')}>
            {tiles.map(([icon, label, on]) => (
              <span key={icon} className={clsx('flex items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-[12.5px] font-bold leading-tight transition-colors', on ? 'bg-subtle group-hover:bg-[rgba(255,255,255,0.14)]' : 'bg-subtle text-muted group-hover:bg-[rgba(255,255,255,0.08)] group-hover:text-[#C9D4F2]')}>
                <span className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px]', on ? 'bg-accent-soft text-azure-strong group-hover:bg-[#FFFFFF]' : 'bg-subtle text-muted opacity-60')}><Icon name={icon} size={13} /></span>{label}
              </span>
            ))}
          </span>
          {owned && (
            <span className="relative flex items-start gap-2 rounded-[9px] border border-[rgba(46,170,95,0.35)] bg-[rgba(23,112,58,0.12)] px-2.5 py-2 text-[12.5px] group-hover:border-[rgba(255,255,255,0.3)] group-hover:bg-[rgba(255,255,255,0.14)]">
              <Icon name="check" size={14} className="mt-0.5 text-[#2EAA5F] group-hover:text-[#FFFFFF]" />
              <span className="min-w-0"><b className="block">Yours{owned.until ? ` until ${new Date(owned.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</b>
                {owned.add && <Link href={owned.add.href} className="pointer-events-auto relative z-10 font-bold text-azure-strong hover:underline group-hover:text-[#FFFFFF]">{owned.add.label}</Link>}</span>
            </span>
          )}
          {!!p.soon && <span className="relative rounded-[7px] bg-[#FFF8EA] px-2.5 py-1.5 text-[12px] text-[#8A5A00] transition-colors group-hover:bg-[rgba(255,255,255,0.14)] group-hover:text-[#FFF1D6]">{p.soon} of {s(p.courses, 'course')} still moving from the website</span>}
          <span className="relative flex items-center gap-2 text-[13px] font-bold">
            {teachers.length > 0 && <span className="flex">{teachers.map((t, i) => <span key={i} className={clsx('flex h-[26px] w-[26px] items-center justify-center overflow-hidden rounded-[7px] border-2 border-white bg-accent-soft text-[9px] text-azure-strong', i ? '-ml-[7px]' : '')}>{t.avatarUrl ? <img src={t.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(t.name)}</span>)}</span>}
            <span className="min-w-0 truncate">{who}</span>
          </span>
          <span className="relative mt-auto flex items-end gap-2.5 border-t border-line pt-3 transition-colors group-hover:border-[rgba(255,255,255,0.25)]">
            <span className="min-w-0 flex-1">
              <b className="block text-[26px] font-extrabold leading-none tracking-[-0.02em]">{price(p.priceAmount, p.currency)}</b>
              <span className="text-[12.5px] text-muted transition-colors group-hover:text-[#EEF3FF]">{owned ? 'Paid · it’s yours' : [p.months ? `${p.months} months` : null, monthly].filter(Boolean).join(' · ')}</span>
              {p.worth && !owned && <span className="mt-1 block text-[11.5px] font-extrabold leading-snug text-[#17703A] group-hover:text-[#FFFFFF]">Save {price(p.worth - p.priceAmount, p.currency)} on buying them one by one</span>}
            </span>
            <Link href={owned ? href : checkout} className="pointer-events-auto relative z-10 inline-flex h-[42px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[#2F57C9] px-[15px] text-[14px] font-extrabold text-[#FFFFFF] transition-all hover:bg-[#2548AE] group-hover:gap-2.5 group-hover:bg-[#FFFFFF] group-hover:text-[#2F57C9]">{owned ? 'Open' : 'Get it'}<Icon name="arrowRight" size={14} /></Link>
          </span>
        </span>
      </div>
    </div>
  );
}

/** Side by side, once there are two or more */
export function PackageCompare({ list }: { list: ListPkg[] }) {
  if (list.length < 2) return null;
  const rows: [string, (p: ListPkg) => React.ReactNode][] = [
    ['Price', p => <><b>{price(p.priceAmount, p.currency)}</b><br /><small className="text-muted">{perMonth(p.priceAmount, p.currency, p.months) ?? ''}</small></>],
    ['Courses', p => <>{p.courses}{p.soon ? <small className="text-[#8A5A00]"> ({p.soon} coming)</small> : null}</>],
    ['Lessons', p => p.lessons || null],
    ['Practice questions', p => p.questions || null],
    ['Mentoring', p => mentorText(p)],
    ['Live classes', p => liveText(p)],
    ['Access', p => p.months ? `${p.months} months` : 'While on sale'],
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr>
            <th className="w-[190px] border-b border-line" />
            {list.map(p => (
              <th key={p.id} className={clsx('border-b border-line min-w-[170px] px-4 py-3 text-left align-bottom text-[15px]', p.bestValue && 'bg-accent-soft')}>
                {p.bestValue && <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-azure-strong">Best value</span>}{short(p.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <td className="border-b border-line px-4 py-3 font-bold text-muted">{label}</td>
              {list.map(p => { const v = cell(p); return <td key={p.id} className={clsx('border-b border-line px-4 py-3', p.bestValue && 'bg-accent-soft', v == null && 'text-muted')}>{v ?? '—'}</td>; })}
            </tr>
          ))}
          <tr>
            <td className="px-4 py-3" />
            {list.map(p => <td key={p.id} className={clsx('px-4 py-3', p.bestValue && 'bg-accent-soft')}><Link href={pageOf(p)} className="inline-flex h-9 items-center whitespace-nowrap rounded-lg bg-[#2F57C9] px-3 text-[13px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">See inside</Link></td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
