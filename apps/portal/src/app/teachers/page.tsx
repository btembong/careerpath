import type { Metadata } from 'next';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { loadTeachers } from '@/components/public/PublicTeachers';
import { TeacherBrowser } from '@/components/public/TeacherBrowser';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'Teachers',
  description: 'Real teachers from Cameroon, Nigeria, Kenya, South Africa and more. See their courses, watch their intros, and learn with them on CareerPath Africa.',
};

/** Every approved teacher, for visitors. Signed-in students are sent to their own Teachers page by the middleware. */
export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [list, sp] = await Promise.all([loadTeachers(), searchParams]);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      <TeacherBrowser list={list} initial={{ q: sp.q ?? '', subject: sp.subject ?? '', country: (sp.country ?? '').toUpperCase(), video: sp.video === '1' }} />
      <PublicFooter />
    </div>
  );
}
