import Link from 'next/link';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';
import { Flag } from '@/components/ui/Flag';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { BigCourseCard, CARD_GRID, type CardCourse, type CardMine } from '@/components/public/course/BigCourseCard';

export interface TeacherProfile {
  id: string; slug: string; name: string; avatarUrl: string | null; country: { code: string; name: string } | null; bio: string | null; videoUrl: string | null;
  subjects: string[]; yearsExperience: number | null; teachingSince: number | null; qualification: string | null; students: number;
  rating: number | null; ratings: number;
  reviews: { rating: number; comment: string | null; at: string; by: string }[];
  courses: (Omit<CardCourse, 'teacher' | 'id'> & { id?: string })[];
  others: { slug: string; name: string; avatarUrl: string | null; courses: number; subjects: string[] }[];
}

const QUAL: Record<string, string> = { HIGH_SCHOOL: 'High school certificate', BACHELOR: 'Bachelor’s degree', MASTER: 'Master’s degree', PHD: 'PhD', PROFESSIONAL: 'Professional certificate' };
export const shortSubject = (s: string) => s.replace('Literature in English', 'Literature').replace('English Language', 'English').replace('Core Mathematics', 'Maths');
export const firstName = (n: string) => n.split(/\s+/)[0];
export const shortBio = (bio: string | null) => bio && bio.length > 260 ? `${bio.slice(0, 250).replace(/\s+\S*$/, '')}…` : bio;

/**
 * A teacher's profile: the blue card, the stats, their courses, about, reviews, qualifications, the video and other teachers.
 * The public site shows it to visitors; the portal fills the slots with what the person looking can do:
 * `side` (the white card), `mobileAction`, `stat` (the fourth tile), `mine` (their courses with this teacher, shown first),
 * `cardHref` (where a course card opens) and `reviewForm`.
 */
export function TeacherPageBody({ t, side, mobileAction, stat, mine, cardHref, reviewForm }: {
  t: TeacherProfile; side: React.ReactNode; mobileAction?: React.ReactNode;
  stat?: { label: string; value: string; sub?: string; strong?: boolean };
  mine?: Map<string, CardMine>; cardHref?: (id: string) => string; reviewForm?: React.ReactNode;
}) {
  const subjects = t.subjects;
  const bioShort = shortBio(t.bio);
  const tile = 'rounded-lg border border-line bg-white p-3.5';
  const card = (c: TeacherProfile['courses'][number]) => {
    const id = c.id ?? c.slug;
    return <BigCourseCard key={c.slug} c={{ ...c, id, teacher: { name: t.name, avatarUrl: t.avatarUrl } }} href={cardHref?.(id)} mine={mine?.get(id) ?? null} />;
  };
  // Theirs first, as their own section; then the rest
  const theirs = mine ? t.courses.filter(c => mine.has(c.id ?? c.slug)) : [];
  const rest = mine ? t.courses.filter(c => !mine.has(c.id ?? c.slug)) : t.courses;

  return (
    <>
      <section className="keep-light relative grid items-center gap-6 overflow-hidden rounded-[14px] bg-[#3F6FE8] p-5 text-navy sm:p-[30px] lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:gap-[30px]">
        <span className="absolute right-5 top-5 lg:static">
          <span className="block lg:hidden"><TeacherPhoto src={t.avatarUrl} name={t.name} size="row" /></span>
          <span className="relative hidden h-[168px] w-[168px] -rotate-3 items-center justify-center overflow-hidden rounded-[26px] bg-[#FFFDF8] text-[56px] font-extrabold text-[#3F6FE8] shadow-[0_12px_26px_rgba(7,32,97,0.25)] lg:flex">
            {t.avatarUrl ? <img src={t.avatarUrl} alt={t.name} className="h-full w-full object-cover" /> : t.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </span>
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="flex max-w-[calc(100%-110px)] flex-wrap items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.08em] sm:text-[12.5px] lg:max-w-none">
            Teacher{t.country && <> · <Flag code={t.country.code} title={t.country.name} /> {t.country.name}</>}{t.yearsExperience ? ` · ${t.yearsExperience} years teaching` : ''}
          </p>
          <h1 className="mt-2 max-w-[calc(100%-110px)] text-[30px] font-extrabold leading-none tracking-[-0.035em] text-navy sm:text-[44px] lg:max-w-none">
            {t.name}.{subjects.length > 0 && <><br /><span className="text-[#FFFFFF]">{subjects.slice(0, 2).map(shortSubject).join(' and ')}.</span></>}
          </h1>
          {bioShort && <p className="mt-3 max-w-[580px] text-[15px] leading-relaxed text-[#0B1F55]">{bioShort}</p>}
          {subjects.length > 0 && <div className="mt-3.5 flex flex-wrap gap-1.5">{subjects.slice(0, 4).map(s => <Link key={s} href={`/teachers?subject=${encodeURIComponent(s)}`} className="inline-flex h-8 items-center rounded-md bg-[rgba(255,255,255,0.25)] px-3 text-[13.5px] font-bold hover:bg-[rgba(255,255,255,0.4)]">{s}</Link>)}</div>}
          {mobileAction && <div className="mt-4 flex flex-col gap-2 lg:hidden">{mobileAction}</div>}
        </div>
        <div className="hidden flex-col gap-2.5 rounded-xl bg-[#FFFFFF] p-4 shadow-[0_14px_30px_rgba(7,32,97,0.22)] lg:flex lg:-rotate-2">{side}</div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}><p className="text-[12px] text-muted">Courses</p><p className="mt-0.5 text-[24px] font-extrabold text-navy">{t.courses.length}</p></div>
        <div className={tile}><p className="text-[12px] text-muted">Students</p><p className="mt-0.5 text-[24px] font-extrabold text-navy">{t.students}</p></div>
        <div className={tile}><p className="text-[12px] text-muted">Rating</p><p className="mt-0.5 text-[24px] font-extrabold text-navy">{t.rating ? `${t.rating} ★` : '—'}</p><p className="text-[12px] text-muted">{t.ratings ? `from ${t.ratings} review${t.ratings === 1 ? '' : 's'}` : 'no reviews yet'}</p></div>
        {stat
          ? <div className={stat.strong ? 'rounded-lg border-2 border-azure-strong bg-accent-soft p-3.5' : tile}><p className="text-[12px] text-muted">{stat.label}</p><p className="mt-0.5 text-[24px] font-extrabold text-navy">{stat.value}</p>{stat.sub && <p className="text-[12px] text-muted">{stat.sub}</p>}</div>
          : <div className={tile}><p className="text-[12px] text-muted">Teaching since</p><p className="mt-0.5 text-[24px] font-extrabold text-navy">{t.teachingSince ?? '—'}</p></div>}
      </div>

      {theirs.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-baseline gap-3"><h2 className="flex-1 text-[20px] font-extrabold text-navy">Your courses with {firstName(t.name)}</h2><Link href="/student/courses" className="text-[13px] font-bold text-azure-strong hover:underline">My courses →</Link></div>
          <div className="@container"><div className={CARD_GRID}>{theirs.map(card)}</div></div>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section>
            <h2 className="mb-2.5 text-[20px] font-extrabold text-navy">{theirs.length ? `More by ${firstName(t.name)}` : `Courses by ${firstName(t.name)}`}</h2>
            {!t.courses.length ? <p className="rounded-lg border border-line bg-white p-5 text-[14px] text-ink2">{firstName(t.name)}’s first courses are on their way. <Link href="/courses" className="font-bold text-azure-strong hover:underline">See all courses</Link></p>
              : !rest.length ? <p className="rounded-lg border border-line bg-white p-5 text-[14px] text-ink2">You have every course {firstName(t.name)} teaches.</p> : <>
              <div className="@container"><div className={CARD_GRID}>{rest.slice(0, 8).map(card)}</div></div>
              {rest.length > 8 && (
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none text-[13.5px] font-extrabold text-azure-strong hover:underline group-open:hidden">See all {rest.length} courses →</summary>
                  <div className="@container"><div className={CARD_GRID}>{rest.slice(8).map(card)}</div></div>
                </details>
              )}
            </>}
          </section>

          {t.bio && t.bio !== bioShort && (
            <section className="rounded-lg border border-line bg-white p-[18px]">
              <h2 className="mb-1.5 text-[18px] font-extrabold text-navy">About {firstName(t.name)}</h2>
              <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink2">{t.bio}</p>
            </section>
          )}

          <section className="rounded-lg border border-line bg-white p-[18px]">
            <h2 className="mb-2 text-[18px] font-extrabold text-navy">What students say</h2>
            {!t.reviews.length ? <p className="text-[14px] text-ink2">No reviews yet.</p> : (
              <div className="flex flex-col divide-y divide-line">
                {t.reviews.map((r, i) => (
                  <p key={i} className="py-2 text-[14px] text-ink2">
                    <b className="text-navy" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</b>
                    {r.comment ? <> “{r.comment}”</> : null} · {r.by}, {new Date(r.at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </p>
                ))}
              </div>
            )}
            {reviewForm}
          </section>

          {(t.qualification || t.yearsExperience) && (
            <section className="rounded-lg border border-line bg-white p-[18px]">
              <h2 className="mb-1.5 text-[18px] font-extrabold text-navy">Qualifications</h2>
              <p className="text-[14.5px] text-ink2">{[t.qualification ? QUAL[t.qualification] ?? t.qualification : null, t.yearsExperience ? `${t.yearsExperience} years teaching` : null].filter(Boolean).join(' · ')}</p>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          {t.videoUrl && (
            <section className="rounded-lg border border-line bg-white p-4">
              <h2 className="mb-2 text-[15px] font-extrabold text-navy">Meet {firstName(t.name)}</h2>
              <VideoEmbed url={t.videoUrl} title={`${t.name}’s intro`} />
            </section>
          )}
          {t.others.length > 0 && subjects[0] && (
            <section className="rounded-lg border border-line bg-white p-4">
              <h2 className="mb-2.5 text-[15px] font-extrabold text-navy">More {shortSubject(subjects[0])} teachers</h2>
              <div className="flex flex-col gap-3">
                {t.others.map(o => (
                  <Link key={o.slug} href={`/teachers/${o.slug}`} className="group flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 -rotate-3 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[#FFFDF8] text-[15px] font-extrabold text-[#3F6FE8] transition-transform group-hover:rotate-0">
                      {o.avatarUrl ? <img src={o.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : o.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                    </span>
                    <span className="min-w-0 text-[13.5px]"><b className="block truncate text-navy group-hover:underline">{o.name}</b><span className="text-muted">{o.courses ? `${o.courses} course${o.courses === 1 ? '' : 's'}` : o.subjects.map(shortSubject).join(' · ')}</span></span>
                  </Link>
                ))}
              </div>
              <Link href={`/teachers?subject=${encodeURIComponent(subjects[0])}`} className="mt-3 inline-block text-[13px] font-extrabold text-azure-strong hover:underline">All {shortSubject(subjects[0])} teachers →</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
