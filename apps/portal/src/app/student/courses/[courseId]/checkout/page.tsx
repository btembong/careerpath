'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { CheckoutView, CheckoutItem, addMonths } from '@/components/checkout/CheckoutView';
import api from '@/lib/api';

interface Course {
  id: string; title: string; isSoldIndividually: boolean; priceAmount: number | null; priceCurrency: string | null; accessMonths: number | null;
  teacher: { name: string | null; firstName: string | null; lastName: string | null } | null;
  modules: { lessons: { type: string }[] }[];
}

export default function CourseCheckoutPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<CheckoutItem | null>(null);
  const [owned, setOwned] = useState(false);
  // ?add=live,mentorship: extras only, for a student who already has it
  const addLater = (useSearchParams().get('add') ?? '').split(',').filter((k): k is 'live' | 'mentorship' => k === 'live' || k === 'mentorship');

  useEffect(() => {
    Promise.all([
      api.get(`/platform-courses/${courseId}`),
      api.get('/portals/student/library').catch(() => ({ data: { courses: [] } })),
    ]).then(([cr, lr]) => {
      const c: Course = cr.data;
      if (!c.isSoldIndividually || !c.priceAmount || !c.priceCurrency) { router.replace(`/student/courses/${courseId}`); return; }
      const has = (lr.data?.courses ?? []).some((x: { id: string }) => x.id === courseId);
      if (has && !addLater.length) { setOwned(true); return; }
      const lessons = c.modules.flatMap(m => m.lessons);
      const quizzes = lessons.filter(l => l.type === 'QUIZ').length;
      const teacher = c.teacher ? c.teacher.name || [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') : '';
      const access = c.accessMonths ? `${c.accessMonths} month${c.accessMonths === 1 ? '' : 's'}` : 'no time limit';
      setItem({
        kind: 'course', id: c.id, title: c.title,
        meta: [teacher, `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`, access].filter(Boolean).join(' · '),
        includes: [`${lessons.length === 1 ? 'The lesson' : `All ${lessons.length} lessons`}${quizzes ? ` and ${quizzes} quiz${quizzes === 1 ? '' : 'zes'}` : ''}`, 'Certificate when you finish', 'Watch on phone or computer'],
        priceAmount: c.priceAmount, currency: c.priceCurrency,
        accessUntil: c.accessMonths ? addMonths(new Date(), c.accessMonths) : null,
        ...(has && { addLater }),
      });
    }).catch(() => router.replace('/student/catalogue'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, router]);

  if (owned) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={`/student/courses/${courseId}`} backLabel="Course" title="Checkout" />
      <div className="m-4 rounded-lg border border-line bg-white p-10 text-center lg:m-7">
        <p className="text-sm font-semibold text-navy">You already have this course</p>
        <Link href={`/student/learn/${courseId}`} className="mt-4 inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Open the course</Link>
      </div>
    </div>
  );
  if (!item) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={`/student/courses/${courseId}`} backLabel="Course" title="Checkout" />
      <div className="flex flex-wrap gap-6 p-4 lg:px-7 lg:py-6">
        <div className="h-96 min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white animate-pulse" />
        <div className="h-80 min-w-0 flex-[1_1_320px] rounded-lg border border-line bg-white animate-pulse" />
      </div>
    </div>
  );
  return <CheckoutView item={item} backHref={`/student/courses/${courseId}`} backLabel={item.title} />;
}
