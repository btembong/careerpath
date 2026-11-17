import type { Metadata } from 'next';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { CourseBrowser, type BrowseData } from '@/components/public/CourseBrowser';

export const revalidate = 300;

async function load(): Promise<BrowseData | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/course-list`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const d = await load();
  const exam = sp.exam && d ? d.courses.find(c => c.exam?.id === sp.exam)?.exam?.name : null;
  const n = d?.courses.length ?? 0;
  return {
    title: exam ? `${exam} courses online · CareerPath Africa` : `${n || ''} exam prep courses, free to start · CareerPath Africa`.trim(),
    description: `Lessons, notes, quizzes and practice questions${exam ? ` for ${exam}` : ' for GCE, WASSCE, IELTS, TOEFL and more'}, from teachers across Africa. Start free; pay by mobile money or card.`,
  };
}

/** The public course list. Signed-in students are sent to their own catalogue by the middleware. */
export default async function PublicCoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [d, sp] = await Promise.all([load(), searchParams]);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      {d ? <CourseBrowser data={d} initial={sp} />
        : <p className="mx-auto max-w-md px-4 py-24 text-center text-ink2">The courses couldn’t load just now. Refresh the page in a moment.</p>}
      <PublicFooter />
    </div>
  );
}
