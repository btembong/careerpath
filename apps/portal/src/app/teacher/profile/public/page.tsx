'use client';
import { useEffect, useState } from 'react';
import { TeacherProfileView } from '@/components/teachers/TeacherProfileView';
import api from '@/lib/api';

/** A teacher's own public profile, as students and visitors see it */
export default function MyPublicProfilePage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { api.get('/auth/me').then(r => setId(r.data?.id ?? null)).catch(() => {}); }, []);
  if (!id) return <div className="m-4 h-72 animate-pulse rounded-[14px] bg-[#3F6FE8]/30 lg:m-7" />;
  return <TeacherProfileView id={id} own backHref="/teacher/profile" backLabel="My profile" />;
}
