'use client';
import MessagesInbox from '@/components/messaging/MessagesInbox';

export default function TeacherMessagesPage() {
  return <MessagesInbox backHref="/teacher/dashboard" role="teacher" />;
}
