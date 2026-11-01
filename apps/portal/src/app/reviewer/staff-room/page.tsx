'use client';
import { Topbar } from '@/components/layout/Topbar';
import { StaffRoom } from '@/components/community/StaffRoom';

export default function StaffRoomPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Staff room" subtitle="Teachers, reviewers and CareerPath — students don’t see this" />
      <StaffRoom />
    </div>
  );
}
