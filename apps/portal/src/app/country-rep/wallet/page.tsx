'use client';
import { Earnings, type EarningsData } from '@/components/payout/Earnings';

/** "10% + GHS 20 a student" → commission and bonus, worded as a sentence */
function how(d: EarningsData) {
  const [pct, bonus] = (d.stats.share?.value ?? '').split(' + ');
  const commission = pct && pct !== 'not set' ? `${pct} of every sale` : 'a commission on every sale';
  return `You earn ${commission} to a student in your country${bonus ? `, plus ${bonus.replace(/ a student$/, '')} a month for each student with an active package` : ''}. Earnings are paid monthly to your payout account once it’s verified.`;
}

export default function RepEarningsPage() {
  return (
    <Earnings
      subtitle="Commission on sales in your country, and your active-student bonus"
      countLabel="Sales" countSub={d => `in your country, ${d.range}`} shareSub="commission + bonus"
      breakdownTitle={r => r === 'month' ? 'This month' : r === 'last' ? 'Last month' : 'This year'} accountHref="/country-rep/profile"
      how={how}
    />
  );
}
