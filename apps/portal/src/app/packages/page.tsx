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

async function adminList(token: string): Promise<ListPkg[] | null> {
  try { const r = await fetch(`${API}/admin/packages/public-list-preview`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

/** Visitors: the packages as cards like the course cards, compared side by side. Signed in: the portal's own packages page, as before. */
export default async function PackagesRoute({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await cookies()).get('cpa_token')?.value;
  const preview = !!token && (await searchParams).preview === '1';
  if (token && !preview) return <PackagesApp />;
  const [list, courses] = await Promise.all([
    // Admins can look at the page with the drafts in it before publishing them (the API refuses everyone else)
    preview ? adminList(token!) : get<ListPkg[]>('/catalogue/package-list', []),
    get<{ courses: unknown[] }>('/catalogue/course-list', { courses: [] }),
  ]);
  if (preview && !list) return <PackagesApp />;
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      {preview && <p className="bg-[#FFF1D6] px-4 py-2.5 text-center text-[13.5px] font-semibold text-[#8A5A00]">Preview with the drafts: packages marked Draft aren’t published yet. Only admins can see this page.</p>}
      <PackagesView list={list ?? []} courseCount={courses.courses?.length ?? 0} />
      <PublicFooter />
    </div>
  );
}
