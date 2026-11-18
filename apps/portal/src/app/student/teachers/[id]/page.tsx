'use client';
import { useParams } from 'next/navigation';
import { TeacherProfileView } from '@/components/teachers/TeacherProfileView';

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <TeacherProfileView id={id} />;
}
