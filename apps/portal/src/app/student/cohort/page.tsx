import { redirect } from 'next/navigation';

/** The cohort page moved to /student/cohorts; keep old links working. */
export default async function OldCohortPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(id ? `/student/cohorts?id=${encodeURIComponent(id)}` : '/student/cohorts');
}
