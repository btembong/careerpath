'use client';
import MessagesInbox from '@/components/messaging/MessagesInbox';

export default function AdminMessagesPage() {
  return <MessagesInbox backHref="/admin/dashboard" role="admin" />;
}
