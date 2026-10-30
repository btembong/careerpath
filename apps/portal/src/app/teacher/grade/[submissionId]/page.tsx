import { redirect } from 'next/navigation';

/** Grading a hand-in now happens in the single grading queue. */
export default async function OldGradePage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  redirect(`/teacher/grading?item=${encodeURIComponent(submissionId)}`);
}
