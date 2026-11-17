import { cookies } from 'next/headers';
import { Sidebar } from '@/components/layout/Sidebar';

/** Signed in: the portal with its sidebar. Visitors: the public package pages, full width. */
export default async function PackagesLayout({ children }: { children: React.ReactNode }) {
  const signedIn = !!(await cookies()).get('cpa_token')?.value;
  if (!signedIn) return <>{children}</>;
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
