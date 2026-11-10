'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { PushPrompt } from '@/components/push/Push';
import { CommandPalette } from '@/components/ui/CommandPalette';

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <MobileNav />
      <PushPrompt />
      <CommandPalette />
    </div>
  );
}
