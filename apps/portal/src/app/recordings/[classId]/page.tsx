'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { BrandLogo } from '@/components/brand/BrandLogo';

const BASE: Record<string, string> = { STUDENT: '/student', TEACHER: '/teacher', ADMIN: '/admin' };

/** Older "Watch recording" links land here: send people to the recording page in their own part of the portal. */
export default function RecordingRedirect() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!user) return;
    router.replace(`${BASE[user.role] ?? '/student'}/recordings/${classId}`);
  }, [user, classId, router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-4 text-center">
      <BrandLogo />
      <p className="text-[15px] text-ink2">Opening the recording…</p>
    </div>
  );
}
