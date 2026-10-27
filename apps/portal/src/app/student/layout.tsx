'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
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

  if (!checked && pathname !== '/student/onboarding') return null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <OfflineIndicator />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
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
