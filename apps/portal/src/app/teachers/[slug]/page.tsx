import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Cover, PublicFooter, PublicHeader, price } from '@/components/public/PublicChrome';
import { TeacherPhoto } from '@/components/teachers/TeacherPhoto';
import { Flag } from '@/components/ui/Flag';
import { VideoEmbed } from '@/components/ui/VideoEmbed';

export const revalidate = 300;

interface Profile {
  id: string; slug: string; name: string; avatarUrl: string | null; country: { code: string; name: string } | null; bio: string | null; videoUrl: string | null;
  subjects: string[]; yearsExperience: number | null; teachingSince: number | null; qualification: string | null; students: number;
  rating: number | null; ratings: number;
  reviews: { rating: number; comment: string | null; at: string; by: string }[];
  courses: { slug: string; title: string; coverUrl: string | null; exam: string | null; subject: string | null; lessons: number; selling: 'free' | 'paid' | 'package' | 'notsale'; price: { amount: number; currency: string } | null }[];
  others: { slug: string; name: string; avatarUrl: string | null; courses: number; subjects: string[] }[];
}

async function load(slug: string): Promise<Profile | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/teacher-page/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const QUAL: Record<string, string> = { HIGH_SCHOOL: 'High school certificate', BACHELOR: 'Bachelor’s degree', MASTER: 'Master’s degree', PHD: 'PhD', PROFESSIONAL: 'Professional certificate' };
const short = (s: string) => s.replace('Literature in English', 'Literature').replace('English Language', 'English').replace('Core Mathematics', 'Maths');
const first = (n: string) => n.split(/\s+/)[0];
const sell = (c: Profile['courses'][number]) => c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'free' ? 'Free' : c.selling === 'package' ? 'In a package' : 'Free';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await load((await params).slug);
  if (!t) return { title: 'Teacher' };
  const what = t.subjects.slice(0, 3).join(', ');
  return {
    title: `${t.name}${what ? `, ${what} teacher` : ''}`,
    description: (t.bio ?? `${t.name} teaches ${what || 'on CareerPath Africa'}${t.country ? ` from ${t.country.name}` : ''}.`).slice(0, 160),
    openGraph: t.avatarUrl ? { images: [t.avatarUrl] } : undefined,
  };
}

/** One teacher's public profile: the profile hero students see in the portal, opened to visitors */
export default async function TeacherPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await load((await params).slug);
  if (!t) notFound();
  // Signed-in students see the same teacher inside their portal
  const token = (await cookies()).get('cpa_token')?.value;
  if (token) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'STUDENT') redirect(`/student/teachers/${t.id}`); }
    catch (e) { if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e; }
  }

  const subjects = t.subjects;
  const freeCourse = t.courses.find(c => c.selling === 'free' && c.lessons > 0) ?? t.courses.find(c => c.selling === 'free');
  const startHref = freeCourse ? `/courses/${freeCourse.slug}` : '/register';
  const startLabel = freeCourse ? 'Start a free course' : 'Start free';
  const bioShort = t.bio && t.bio.length > 260 ? `${t.bio.slice(0, 250).replace(/\s+\S*$/, '')}…` : t.bio;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Person', name: t.name, jobTitle: subjects.length ? `${subjects.slice(0, 2).join(' and ')} teacher` : 'Teacher',
    ...(t.avatarUrl && { image: t.avatarUrl }), ...(t.bio && { description: t.bio.slice(0, 300) }), ...(t.country && { nationality: t.country.name }),
    knowsAbout: subjects, worksFor: { '@type': 'Organization', name: 'CareerPath Africa', url: 'https://app.careerpathafrica.com' },
  };
  const tile = 'rounded-lg border border-line bg-white p-3.5';

  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-28 pt-5 sm:px-8 lg:pb-12">
        <nav aria-label="Breadcrumb" className="text-[13px] text-[#637090]">
          <Link href="/teachers" className="hover:text-navy">Teachers</Link>
          {subjects[0] && <> › <Link href={`/teachers?subject=${encodeURIComponent(subjects[0])}`} className="hover:text-navy">{subjects[0]}</Link></>}
          {' › '}<b className="text-navy">{t.name}</b>
        </nav>

        <section className="relative grid items-center gap-6 overflow-hidden rounded-[14px] bg-[#3F6FE8] p-5 sm:p-[30px] lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:gap-[30px]">
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
            <h1 className="mt-2 max-w-[calc(100%-110px)] text-[30px] font-extrabold leading-none tracking-[-0.035em] sm:text-[44px] lg:max-w-none">
              {t.name}.{subjects.length > 0 && <><br /><span className="text-[#FFFFFF]">{subjects.slice(0, 2).map(short).join(' and ')}.</span></>}
            </h1>
            {bioShort && <p className="mt-3 max-w-[580px] text-[15px] leading-relaxed text-[#0B1F55]">{bioShort}</p>}
            {subjects.length > 0 && <div className="mt-3.5 flex flex-wrap gap-1.5">{subjects.slice(0, 4).map(s => <Link key={s} href={`/teachers?subject=${encodeURIComponent(s)}`} className="inline-flex h-8 items-center rounded-md bg-[rgba(255,255,255,0.25)] px-3 text-[13.5px] font-bold hover:bg-[rgba(255,255,255,0.4)]">{s}</Link>)}</div>}
            <Link href={startHref} className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[#072061] px-4 text-[15px] font-extrabold text-[#FFFFFF] lg:hidden">{startLabel}</Link>
          </div>
          <div className="hidden flex-col gap-2.5 rounded-xl bg-[#FFFFFF] p-4 shadow-[0_14px_30px_rgba(7,32,97,0.22)] lg:flex lg:-rotate-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">Learn with {first(t.name)}</p>
            <Link href={startHref} className="inline-flex h-10 items-center justify-center rounded-md bg-[#2F57C9] text-[14px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">{startLabel}</Link>
            <Link href="/packages" className="inline-flex h-10 items-center justify-center rounded-md border border-line text-[14px] font-extrabold text-navy hover:bg-[#F4F6FB]">Book mentoring · with a package</Link>
            <span className="text-[12.5px] text-[#637090]">Free account · pay by mobile money or card</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={tile}><p className="text-[12px] text-[#637090]">Courses</p><p className="mt-0.5 text-[24px] font-extrabold">{t.courses.length}</p></div>
          <div className={tile}><p className="text-[12px] text-[#637090]">Students</p><p className="mt-0.5 text-[24px] font-extrabold">{t.students}</p></div>
          <div className={tile}><p className="text-[12px] text-[#637090]">Rating</p><p className="mt-0.5 text-[24px] font-extrabold">{t.rating ? `${t.rating} ★` : '—'}</p><p className="text-[12px] text-[#637090]">{t.ratings ? `from ${t.ratings} review${t.ratings === 1 ? '' : 's'}` : 'no reviews yet'}</p></div>
          <div className={tile}><p className="text-[12px] text-[#637090]">Teaching since</p><p className="mt-0.5 text-[24px] font-extrabold">{t.teachingSince ?? '—'}</p></div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section>
              <h2 className="mb-2.5 text-[20px] font-extrabold">Courses by {first(t.name)}</h2>
              {!t.courses.length ? <p className="rounded-lg border border-line bg-white p-5 text-[14px] text-ink2">{first(t.name)}’s first courses are on their way. <Link href="/courses" className="font-bold text-[#2F57C9] hover:underline">See all courses</Link></p> : <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {t.courses.slice(0, 6).map(c => <CourseCard key={c.slug} c={c} />)}
                </div>
                {t.courses.length > 6 && (
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-[13.5px] font-extrabold text-[#2F57C9] hover:underline group-open:hidden">See all {t.courses.length} courses →</summary>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{t.courses.slice(6).map(c => <CourseCard key={c.slug} c={c} />)}</div>
                  </details>
                )}
              </>}
            </section>

            {t.bio && t.bio !== bioShort && (
              <section className="rounded-lg border border-line bg-white p-[18px]">
                <h2 className="mb-1.5 text-[18px] font-extrabold">About {first(t.name)}</h2>
                <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-[#3A4A6B]">{t.bio}</p>
              </section>
            )}

            <section className="rounded-lg border border-line bg-white p-[18px]">
              <h2 className="mb-2 text-[18px] font-extrabold">What students say</h2>
              {!t.reviews.length ? <p className="text-[14px] text-[#3A4A6B]">No reviews yet.</p> : (
                <div className="flex flex-col divide-y divide-[#EEF1F7]">
                  {t.reviews.map((r, i) => (
                    <p key={i} className="py-2 text-[14px] text-[#3A4A6B]">
                      <b className="text-navy" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</b>
                      {r.comment ? <> “{r.comment}”</> : null} · {r.by}, {new Date(r.at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </p>
                  ))}
                </div>
              )}
            </section>

            {(t.qualification || t.yearsExperience) && (
              <section className="rounded-lg border border-line bg-white p-[18px]">
                <h2 className="mb-1.5 text-[18px] font-extrabold">Qualifications</h2>
                <p className="text-[14.5px] text-[#3A4A6B]">{[t.qualification ? QUAL[t.qualification] ?? t.qualification : null, t.yearsExperience ? `${t.yearsExperience} years teaching` : null].filter(Boolean).join(' · ')}</p>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-3">
            {t.videoUrl && (
              <section className="rounded-lg border border-line bg-white p-4">
                <h2 className="mb-2 text-[15px] font-extrabold">Meet {first(t.name)}</h2>
                <VideoEmbed url={t.videoUrl} title={`${t.name}’s intro`} />
              </section>
            )}
            {t.others.length > 0 && subjects[0] && (
              <section className="rounded-lg border border-line bg-white p-4">
                <h2 className="mb-2.5 text-[15px] font-extrabold">More {short(subjects[0])} teachers</h2>
                <div className="flex flex-col gap-3">
                  {t.others.map(o => (
                    <Link key={o.slug} href={`/teachers/${o.slug}`} className="group flex items-center gap-3">
                      <span className="flex h-11 w-11 flex-shrink-0 -rotate-3 items-center justify-center overflow-hidden rounded-[10px] border border-[#E4E9F3] bg-[#FFFDF8] text-[15px] font-extrabold text-[#3F6FE8] transition-transform group-hover:rotate-0">
                        {o.avatarUrl ? <img src={o.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : o.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </span>
                      <span className="min-w-0 text-[13.5px]"><b className="block truncate group-hover:underline">{o.name}</b><span className="text-[#637090]">{o.courses ? `${o.courses} course${o.courses === 1 ? '' : 's'}` : o.subjects.map(short).join(' · ')}</span></span>
                    </Link>
                  ))}
                </div>
                <Link href={`/teachers?subject=${encodeURIComponent(subjects[0])}`} className="mt-3 inline-block text-[13px] font-extrabold text-[#2F57C9] hover:underline">All {short(subjects[0])} teachers →</Link>
              </section>
            )}
          </aside>
        </div>
      </main>

      {/* Phones: the main button stays in reach */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="min-w-0 flex-1 text-[13px] text-[#637090]"><b className="block truncate text-navy">{t.name}</b>Free account</span>
        <Link href={startHref} className="inline-flex h-11 items-center rounded-md bg-[#2F57C9] px-4 text-[15px] font-extrabold text-[#FFFFFF]">{startLabel}</Link>
      </div>
      <PublicFooter />
    </div>
  );
}

function CourseCard({ c }: { c: Profile['courses'][number] }) {
  return (
    <Link href={`/courses/${c.slug}`} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-white hover:border-[#C9D7FB]">
      <Cover src={c.coverUrl} label={[c.exam, c.subject].filter(Boolean).join(' · ') || c.title} seed={c.slug} className="h-24 w-full" />
      <span className="flex flex-1 flex-col gap-1 px-3 py-2.5">
        {(c.exam || c.subject) && <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#637090]">{[c.exam, c.subject].filter(Boolean).join(' · ')}</span>}
        <b className="line-clamp-2 text-[14px] leading-snug group-hover:underline">{c.title}</b>
        <span className="mt-auto flex justify-between pt-1 text-[12.5px]"><span className="text-[#637090]">{c.lessons ? `${c.lessons} lesson${c.lessons === 1 ? '' : 's'}` : 'On the website'}</span><b className={c.selling === 'paid' ? 'text-navy' : 'text-[#17703A]'}>{sell(c)}</b></span>
      </span>
    </Link>
  );
}
