import { redirect } from 'next/navigation';

/** Student alerts are now part of My students. */
export default function OldAlertsPage() {
  redirect('/teacher/students');
}
