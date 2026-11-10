'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import CallLayer from '@/components/calls/CallLayer';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/ui/CommandPalette';

export default function ReviewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <CallLayer />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
