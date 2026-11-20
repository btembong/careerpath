import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { CoursePageBody, splitTitle, type CoursePage } from '@/components/public/course/CoursePageBody';

export const revalidate = 300;

async function load(slug: string): Promise<CoursePage | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/course-page/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: 'Course' };
  const where = [c.exam, c.subject].filter(Boolean).join(' · ');
  return {
    title: `${c.title}${where ? ` · ${where}` : ''}`,
    description: c.shortDescription ?? c.description?.slice(0, 160) ?? undefined,
    openGraph: { title: c.title, description: c.shortDescription ?? undefined, images: c.coverUrl ? [c.coverUrl] : undefined },
  };
}

/** The public course page: what a visitor sees before signing in. Signed-in students are sent to their own course page. */
export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const raw = await load((await params).slug);
  if (!raw) notFound();
  const c: CoursePage = { ...raw, examCountries: raw.examCountries ?? [], teacherMore: raw.teacherMore ?? [], examMore: raw.examMore ?? [], packages: raw.packages ?? [], outcomes: raw.outcomes ?? [], modules: raw.modules ?? [] };
  // Free courses: after signing up the student is enrolled and lands on the first lesson (?start=1)
  const start = `/register?next=${encodeURIComponent(`/student/courses/${c.id}${c.selling === 'free' ? '?start=1' : ''}`)}`;
  const buy = `/register?next=${encodeURIComponent(`/student/courses/${c.id}/checkout`)}`;
  const { main } = splitTitle(c.title);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      <nav aria-label="Where it sits" className="mx-auto flex w-full max-w-[1252px] flex-wrap gap-1.5 px-4 pt-5 text-[13px] text-[#637090] sm:px-8">
        <Link href="/courses" className="hover:text-navy">Courses</Link>{c.exam && <><span>›</span><span>{c.exam}</span></>}{c.subject && <><span>›</span><span>{c.subject}</span></>}<span>›</span><b className="text-navy">{main}</b>
      </nav>
      <CoursePageBody c={c} start={start} buy={buy} />
      <PublicFooter />
    </div>
  );
}
