import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { TeacherPageBody, firstName, type TeacherProfile } from '@/components/public/TeacherPageBody';

export const revalidate = 300;

type Profile = TeacherProfile;

async function load(slug: string): Promise<Profile | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/teacher-page/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}


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
  const ld = {
    '@context': 'https://schema.org', '@type': 'Person', name: t.name, jobTitle: subjects.length ? `${subjects.slice(0, 2).join(' and ')} teacher` : 'Teacher',
    ...(t.avatarUrl && { image: t.avatarUrl }), ...(t.bio && { description: t.bio.slice(0, 300) }), ...(t.country && { nationality: t.country.name }),
    knowsAbout: subjects, worksFor: { '@type': 'Organization', name: 'CareerPath Africa', url: 'https://app.careerpathafrica.com' },
  };

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

        <TeacherPageBody t={t}
          mobileAction={<Link href={startHref} className="inline-flex h-11 items-center justify-center rounded-md bg-[#072061] px-4 text-[15px] font-extrabold text-[#FFFFFF]">{startLabel}</Link>}
          side={<>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">Learn with {firstName(t.name)}</p>
            <Link href={startHref} className="inline-flex h-10 items-center justify-center rounded-md bg-[#2F57C9] text-[14px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">{startLabel}</Link>
            <Link href="/packages" className="inline-flex h-10 items-center justify-center rounded-md border border-line text-[14px] font-extrabold text-navy hover:bg-[#F4F6FB]">Book mentoring · with a package</Link>
            <span className="text-[12.5px] text-[#637090]">Free account · pay by mobile money or card</span>
          </>} />
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

