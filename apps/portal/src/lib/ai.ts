'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

let cached: Promise<boolean> | null = null;

/** Whether the AI is switched on (the Anthropic key is set). Asked once per page load. */
export function useAiEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    cached ??= api.get('/ai/status').then(r => !!r.data?.enabled).catch(() => false);
    cached.then(setOn);
  }, []);
  return on;
}
