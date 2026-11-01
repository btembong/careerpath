import { redirect } from 'next/navigation';

/** Course management does everything the old course list did: tags, teachers, selling, packages, content and pricing settings */
export default function AdminCoursesPage() {
  redirect('/admin/courses/manage');
}
