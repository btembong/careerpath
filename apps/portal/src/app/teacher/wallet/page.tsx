'use client';
import { Earnings } from '@/components/payout/Earnings';

export default function TeacherEarningsPage() {
  return <Earnings subtitle="Course sales, classes you teach, mentoring, and anything added for you" accountHref="/teacher/profile" />;
}
