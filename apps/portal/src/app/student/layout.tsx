'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import CallLayer from '@/components/calls/CallLayer';
import { PushPrompt } from '@/components/push/Push';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';
import api from '@/lib/api';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === '/student/onboarding') { setChecked(true); return; }
    // Fast path: skip API call once we know onboarding is done this session
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cpa_onboarded') === '1') {
      setChecked(true);
      return;
    }
    api.get('/auth/me')
      .then(r => {
        if (r.data.role === 'STUDENT' && !r.data.onboardingCompleted) {
          router.replace('/student/onboarding');
        } else {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('cpa_onboarded', '1');
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [pathname]);

  // A school join link opened before signing up: take the seat once onboarding is done
  useEffect(() => {
    if (!checked || pathname === '/student/onboarding' || pathname.startsWith('/student/join/')) return;
    let code: string | null = null;
    try { code = localStorage.getItem('cpa:pendingJoin'); } catch {}
    if (code) router.replace(`/student/join/${encodeURIComponent(code)}`);
  }, [checked, pathname, router]);

  if (!checked && pathname !== '/student/onboarding') return null;

  // Onboarding is a full screen of its own, without the portal menus
  if (pathname === '/student/onboarding') return <ErrorBoundary>{children}</ErrorBoundary>;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <OfflineIndicator />
      <Sidebar />
      <CallLayer />
      <PushPrompt />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
