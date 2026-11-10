'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

/** Unread messages and notices, for the bell and the phone bar's dots. Refreshed every minute and when the page comes back. */
export function useBadges() {
  const [counts, setCounts] = useState({ messages: 0, notices: 0 });
  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      Promise.all([
        api.get<{ count: number }>('/messages/unread').then(r => r.data.count).catch(() => 0),
        api.get<{ count: number }>('/notifications/unread').then(r => r.data.count).catch(() => 0),
      ]).then(([messages, notices]) => { if (!stop) setCounts({ messages, notices }); });
    };
    load();
    const t = setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener('cpa-badges', load);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', load); window.removeEventListener('cpa-badges', load); };
  }, []);
  return counts;
}
