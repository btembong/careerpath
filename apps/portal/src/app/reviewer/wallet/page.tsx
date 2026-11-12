'use client';
import { Earnings } from '@/components/payout/Earnings';

export default function ReviewerEarningsPage() {
  return <Earnings subtitle="Your share of sales from courses you reviewed" accountHref="/reviewer/profile" />;
}
