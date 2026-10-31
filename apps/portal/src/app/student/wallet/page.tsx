import { redirect } from 'next/navigation';

/** Students have no wallet balance to show: access, payments and receipts live on Billing */
export default function StudentWalletPage() {
  redirect('/student/billing');
}
