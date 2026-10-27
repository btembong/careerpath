'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /apply — teacher application entry point.
 * The marketing site (careerpathafrica.com) links here.
 * We redirect to /register with the teacher role pre-selected.
 */
export default function ApplyPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/register?role=teacher');
  }, [router]);
  return null;
}
