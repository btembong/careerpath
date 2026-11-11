import { LegalDraft } from '@/components/legal/LegalDraft';

export const metadata = { title: 'Privacy Policy — CareerPath Africa' };

export default function PrivacyPage() {
  return (
    <LegalDraft
      title="Privacy Policy"
      version="Draft · November 2026"
      intro="This Privacy Policy explains what personal information CareerPath Africa collects when you use the portal, why, and the choices you have."
      covers={[
        'What we collect: your account details, learning progress, test results, messages and payments.',
        'Why we use it: to run your courses and classes, mark your work, send reminders and keep the portal safe.',
        'Who we share it with: your teachers, your school if it enrolled you, and the services that run the portal (video calls, email, payments, storage).',
        'Recordings of live classes and calls, and how long they are kept.',
        'Notifications and emails, and how to choose which ones you get.',
        'Your rights: seeing your data, downloading it, correcting it and deleting your account.',
        'How we keep your information safe, and how long we keep it.',
        'Children and young learners using the portal.',
      ]}
    />
  );
}
