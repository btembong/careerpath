import type { MetadataRoute } from 'next';

export const revalidate = 3600;
const SITE = 'https://app.careerpathafrica.com';

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { next: { revalidate: 3600 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** The public pages search engines should find: home, courses, packages and teachers */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, packages, teachers] = await Promise.all([
    get<{ courses: { slug: string }[] }>('/catalogue/course-list'),
    get<{ id: string }[]>('/catalogue/package-list'),
    get<{ slug: string }[]>('/catalogue/teacher-list'),
  ]);
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({ url: `${SITE}${path}`, changeFrequency: 'weekly', priority });
  return [
    page('/', 1), page('/students', 0.9), page('/teach', 0.8), page('/schools', 0.8), page('/courses', 0.9), page('/teachers', 0.8), page('/packages', 0.8),
    ...(courses?.courses ?? []).map(c => page(`/courses/${c.slug}`, 0.7)),
    ...(packages ?? []).map(p => page(`/packages/${p.id}`, 0.6)),
    ...(teachers ?? []).map(t => page(`/teachers/${t.slug}`, 0.6)),
  ];
}
