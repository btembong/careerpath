import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { NotificationProvider, NotificationBridge } from '@/components/providers/NotificationProvider';
import { ServiceWorkerRegistration } from '@/components/providers/ServiceWorkerRegistration';
import { DisplayPrefsApplier } from '@/components/providers/DisplayPrefsApplier';
import { ErrorReporter } from '@/components/providers/ErrorReporter';
import './globals.css';

// Bricolage Grotesque is a variable font — no weight array needed.
// Turbopack requires a single query entry; omitting weight loads the full
// variable range (200–800) in one request.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'CareerPath Africa',
    template: '%s | CareerPath Africa',
  },
  description: 'Learn, grow, and advance your career across Africa with expert-led courses, live classes, and mentorship.',
  manifest: '/manifest.json',
  keywords: ['e-learning', 'Africa', 'courses', 'mentorship', 'certificates', 'career'],
  authors: [{ name: 'CareerPath Africa' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CareerPath Africa',
  },
  openGraph: {
    title: 'CareerPath Africa',
    description: 'Expert-led education for African professionals',
    type: 'website',
    locale: 'en_US',
  },
  robots: { index: false, follow: false }, // Keep private until launch
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.className}>
      <body>
        <NotificationProvider>
          <NotificationBridge />
          <ServiceWorkerRegistration />
          <DisplayPrefsApplier />
          <ErrorReporter />
          {children}
        </NotificationProvider>
      </body>
    </html>
  );
}
