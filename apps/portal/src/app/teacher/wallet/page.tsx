'use client';
import { Earnings } from '@/components/payout/Earnings';

const period = (r: string) => r === 'month' ? 'By course this month' : r === 'last' ? 'By course last month' : 'By course this year';

export default function TeacherEarningsPage() {
  return (
    <Earnings
      subtitle="Your share of course sales, and when it’s paid"
      countLabel="Course sales" countSub={d => d.range} shareSub="of each sale, after fees"
      breakdownTitle={period} accountHref="/teacher/profile"
      how={d => `You get ${d.stats.share?.value && d.stats.share.value !== 'set per course' ? d.stats.share.value : 'your agreed share'} of every sale of your courses — a single course, or your part when it’s sold in a package. Earnings are paid monthly to your payout account once it’s verified.`}
    />
  );
}
