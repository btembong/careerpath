import { redirect } from 'next/navigation';

/** Quiz grading is now part of the single grading queue. */
export default function OldQuizGradingPage() {
  redirect('/teacher/grading?filter=quiz');
}
