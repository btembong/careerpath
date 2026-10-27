'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import api from '@/lib/api';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isFullScreen = pathname === '/teacher/onboarding' || pathname === '/teacher/welcome';
  const [status, setStatus] = useState<'loading' | 'pending' | 'ok'>('loading');

  useEffect(() => {
    api.get('/auth/me')
      .then(r => {
        if (r.data?.approvalStatus === 'PENDING') { setStatus('pending'); return; }
        // Setup order: WP tutors complete their profile first, then everyone watches the orientation video
        const required = r.data?.teacherProfileComplete === false ? '/teacher/onboarding'
                       : r.data?.onboardingVideoPending ? '/teacher/welcome'
                       : null;
        if (required && pathname !== required) {
          router.replace(required);
          return;
        }
        setStatus('ok');
      })
      .catch(() => setStatus('ok')); // let API calls fail naturally if network error
  }, [pathname, router]);

  if (isFullScreen && status === 'ok') return <ErrorBoundary>{children}</ErrorBoundary>;

  if (status === 'loading') return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <div className="hidden lg:flex w-64 flex-col border-r border-cloud bg-white animate-pulse" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SkeletonTopbar />
        <div className="flex-1 p-6 space-y-4">
          <div className="h-32 rounded-2xl bg-cloud animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {[0,1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  );

  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#030e30] via-[#072061] to-[#0d2f8a] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center space-y-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 mx-auto">
            <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-navy mb-1">Application under review</h1>
            <p className="text-sm text-royal/60">
              Your teacher application has been received and is being reviewed by our admin team.
              You'll receive an email once a decision has been made — this usually takes 1–2 business days.
            </p>
          </div>
          <div className="rounded-2xl bg-surface border border-cloud p-4 text-left space-y-3">
            {[
              { n: 1, label: 'Application received', done: true },
              { n: 2, label: 'Admin reviews profile', done: false },
              { n: 3, label: 'Decision sent by email', done: false },
              { n: 4, label: 'Start teaching!', done: false },
            ].map(step => (
              <div key={step.n} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold
                  ${step.done ? 'border-azure bg-azure text-white' : 'border-cloud text-royal/40'}`}>
                  {step.done ? '✓' : step.n}
                </div>
                <span className={`text-sm ${step.done ? 'text-navy font-semibold' : 'text-royal/50'}`}>{step.label}</span>
              </div>
            ))}
          </div>
          <Link href="/login"
            className="block w-full rounded-2xl border border-cloud py-3 text-sm font-semibold text-royal/60 hover:bg-surface transition">
            Sign in with a different account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <OfflineIndicator />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
