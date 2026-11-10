'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import CallLayer from '@/components/calls/CallLayer';
import { PushPrompt } from '@/components/push/Push';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/ui/CommandPalette';

export default function CountryRepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <CallLayer />
      <PushPrompt />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
