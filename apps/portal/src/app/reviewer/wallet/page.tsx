'use client';
import { Earnings } from '@/components/payout/Earnings';

export default function ReviewerEarningsPage() {
  return (
    <Earnings
      subtitle="Your share of sales from courses you approved"
      countLabel="Sales" countSub={d => `of approved courses, ${d.range}`} shareSub="of each sale"
      breakdownTitle={() => 'By approved course'} accountHref="/reviewer/profile"
      how={d => `You earn ${d.stats.share?.value && d.stats.share.value !== 'set per course' ? d.stats.share.value : 'a share'} of every sale of a course you reviewed and approved, for as long as it sells. Earnings are paid monthly to your payout account once it’s verified.`}
    />
  );
}
