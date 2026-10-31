import { redirect } from 'next/navigation';

/** Points, badges and study time now live on My progress */
export default function StudentAnalyticsPage() {
  redirect('/student/progress');
}
