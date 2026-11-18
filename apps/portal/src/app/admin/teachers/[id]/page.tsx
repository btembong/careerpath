'use client';
import { useParams } from 'next/navigation';
import { TeacherProfileView } from '@/components/teachers/TeacherProfileView';

/** An admin's preview of a teacher's profile, exactly as students see it */
export default function AdminTeacherPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <TeacherProfileView id={id} backHref="/admin/teachers" backLabel="Teachers" preview />;
}
