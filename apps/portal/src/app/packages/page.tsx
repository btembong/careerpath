import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import PackagesApp from '@/components/packages/PackagesApp';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { PackagesView, type ListPkg } from '@/components/public/PackageList';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'Packages',
  description: 'Bundles of exam courses at one price, with practice, mock exams and optional live classes or a mentor. Pay by mobile money or card.',
};

const API = process.env.NEXT_PUBLIC_API_URL;
async function get<T>(path: string, fallback: T): Promise<T> {
  try { const r = await fetch(`${API}${path}`, { next: { revalidate: 300 } }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

/** Visitors: the packages as cards like the course cards, compared side by side. Signed in: the portal's own packages page, as before. */
export default async function PackagesRoute() {
  if ((await cookies()).get('cpa_token')?.value) return <PackagesApp />;
  const [list, courses] = await Promise.all([
    get<ListPkg[]>('/catalogue/package-list', []),
    get<{ courses: unknown[] }>('/catalogue/course-list', { courses: [] }),
  ]);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      <PackagesView list={list} courseCount={courses.courses?.length ?? 0} />
      <PublicFooter />
    </div>
  );
}
