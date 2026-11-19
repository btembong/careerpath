import Link from 'next/link';
import { clsx } from 'clsx';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';
import { Flag } from '@/components/ui/Flag';

export interface PublicTeacher {
  id: string; slug: string; name: string; avatarUrl: string | null; country: { code: string; name: string } | null; hasVideo: boolean;
  subjects: string[]; yearsExperience: number | null; courses: number; rating: number | null; ratings: number;
}

export async function loadTeachers(): Promise<PublicTeacher[]> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/teacher-list`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

const fact = 'inline-flex h-[26px] items-center gap-1 rounded-[5px] bg-[#F4F6FB] px-2 text-xs text-[#637090]';

/** The student Teachers page card, for visitors: tilted photo, flag, two subjects, only facts that exist, and the profile link */
export function PublicTeacherCard({ t }: { t: PublicTeacher }) {
  return (
    <Link href={`/teachers/${t.slug}`} className="group flex flex-col gap-2.5 rounded-lg border-2 border-line bg-white px-4 pb-3.5 pt-[18px] text-navy hover:border-[#C9D7FB]">
      <TeacherPhoto src={t.avatarUrl} name={t.name} video={t.hasVideo} />
      <span className="mt-1 flex items-center gap-1.5 text-[17px] font-extrabold leading-tight tracking-[-0.01em]"><span className="line-clamp-2">{t.name}</span><Flag code={t.country?.code} title={t.country?.name} /></span>
      {t.subjects.length > 0 && <span className="text-[13px] leading-snug text-[#3A4A6B]">{t.subjects.slice(0, 2).join(' · ')}{t.subjects.length > 2 && <span className="text-[#9AA6C2]"> +{t.subjects.length - 2}</span>}</span>}
      <span className="flex flex-wrap gap-1.5">
        {t.courses ? <span className={fact}><b className="text-[13px] text-navy">{t.courses}</b> course{t.courses === 1 ? '' : 's'}</span> : <span className={fact}>Courses coming</span>}
        {!!t.yearsExperience && <span className={fact}><b className="text-[13px] text-navy">{t.yearsExperience}</b> yrs</span>}
        {t.ratings > 0 && t.rating != null && <span className={fact}><b className="text-[13px] text-navy">{t.rating} ★</b> {t.ratings}</span>}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 border-t border-[#EEF1F7] pt-2.5 text-[12.5px]">
        <span className="text-[#637090]">{t.country?.name ?? ''}</span>
        <b className="text-[#2F57C9] group-hover:underline">View profile →</b>
      </span>
    </Link>
  );
}

/** A phone row: tilted photo, name, subjects and one line of facts */
export function PublicTeacherRow({ t }: { t: PublicTeacher }) {
  return (
    <Link href={`/teachers/${t.slug}`} className="group flex items-center gap-3.5 rounded-lg border border-line bg-white p-3 text-navy">
      <TeacherPhoto src={t.avatarUrl} name={t.name} size="row" video={t.hasVideo} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[15px] font-bold leading-tight"><span className="truncate">{t.name}</span><Flag code={t.country?.code} title={t.country?.name} /></span>
        <span className="truncate text-[12.5px] text-[#3A4A6B]">{[t.subjects.slice(0, 2).join(' · '), t.yearsExperience ? `${t.yearsExperience} yrs` : null].filter(Boolean).join(' · ')}</span>
        <span className="text-xs text-[#637090]">{t.courses ? `${t.courses} course${t.courses === 1 ? '' : 's'}` : 'Courses coming'}{t.rating ? ` · ${t.rating} ★` : ''}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="flex-shrink-0 text-[#9AA6C2]"><path d="M9 6l6 6-6 6" /></svg>
    </Link>
  );
}

/** Up to six faces for the landing page: teachers with a photo, courses first, a mix of countries */
export function pickFaces(list: PublicTeacher[], n = 6) {
  const withPhoto = list.filter(t => t.avatarUrl);
  const out: PublicTeacher[] = [];
  const used = new Set<string>();
  // First pass: one per country, in list order (courses first)
  for (const t of withPhoto) if (out.length < n && !used.has(t.country?.code ?? '-')) { out.push(t); used.add(t.country?.code ?? '-'); }
  for (const t of withPhoto) if (out.length < n && !out.includes(t)) out.push(t);
  // Teachers with courses lead
  return out.sort((a, b) => Number(b.courses > 0) - Number(a.courses > 0) || b.courses - a.courses);
}

/** The landing page strip: big photos laid on a desk, tilted both ways */
export function TeacherFaces({ list }: { list: PublicTeacher[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 py-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {list.map((t, i) => (
        <Link key={t.slug} href={`/teachers/${t.slug}`} className="group flex w-[150px] flex-shrink-0 snap-start flex-col gap-1 text-navy sm:w-auto">
          <span className={clsx('relative block aspect-square w-full max-w-[170px] overflow-hidden rounded-[22px] bg-[#FFFDF8] shadow-[0_12px_26px_rgba(7,32,97,0.22)] transition-transform duration-200 group-hover:rotate-0', i % 2 ? 'rotate-2' : '-rotate-3')}>
            <img src={t.avatarUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
            {t.hasVideo && <span aria-hidden className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[rgba(7,32,97,0.82)] text-[#FFFFFF]"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg></span>}
          </span>
          <span className="mt-3 flex items-center gap-1.5 text-[15px] font-bold leading-tight"><span className="truncate">{t.name}</span><Flag code={t.country?.code} title={t.country?.name} /></span>
          <span className="truncate text-[13px] text-[#3A4A6B]">{[t.subjects.slice(0, 2).join(' · '), t.courses ? `${t.courses} course${t.courses === 1 ? '' : 's'}` : t.yearsExperience ? `${t.yearsExperience} yrs` : null].filter(Boolean).join(' · ')}</span>
        </Link>
      ))}
    </div>
  );
}
