import { LegalDraft } from '@/components/legal/LegalDraft';

export const metadata = { title: 'Terms and Conditions — CareerPath Africa' };

export default function TermsPage() {
  return (
    <LegalDraft
      title="Terms and Conditions"
      version="Draft · November 2026"
      intro="These Terms and Conditions are the agreement between you and CareerPath Africa for using the portal: learning, live classes, tests, mentoring and payments."
      covers={[
        'Your account: who can sign up, keeping your sign-in safe, and accounts for schools.',
        'Courses and packages: what you get when you buy, how long access lasts, and refunds.',
        'Live classes and recordings: joining, recordings for watching in the portal only, and not sharing them.',
        'Tests, certificates and how results are used.',
        'Fair use: respectful behaviour in classes, messages and the community.',
        'Content ownership: what belongs to CareerPath Africa and its teachers.',
        'Payments: prices, currencies, mobile money and card payments.',
        'Suspending or closing an account, and changes to these terms.',
      ]}
    />
  );
}
