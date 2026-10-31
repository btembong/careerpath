'use client';
import MessagesInbox from '@/components/messaging/MessagesInbox';

export default function ReviewerMessagesPage() {
  return <MessagesInbox backHref="/reviewer/dashboard" role="reviewer" />;
}
