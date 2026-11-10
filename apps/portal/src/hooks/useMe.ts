'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export interface MeSummary { name: string; firstName: string; avatarUrl: string | null; packageName: string | null }

// One request per page load, shared by the top bar and the phone menu (the sign-in token has no name or photo)
let pending: Promise<MeSummary | null> | null = null;

function load() {
  pending ??= api.get('/auth/me').then(r => {
    const d = r.data;
    const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email;
    return { name, firstName: d.firstName || String(name).split(/[\s@]/)[0], avatarUrl: d.avatarUrl ?? null, packageName: d.activePackages?.[0]?.name ?? null };
  }).catch(() => { pending = null; return null; });
  return pending;
}

/** The signed-in person's name, photo and current package. */
export function useMe() {
  const [me, setMe] = useState<MeSummary | null>(null);
  useEffect(() => {
    let live = true;
    load().then(m => { if (live) setMe(m); });
    const again = () => { pending = null; load().then(m => { if (live) setMe(m); }); };
    window.addEventListener('cpa-profile', again); // the profile page fires this after a save
    return () => { live = false; window.removeEventListener('cpa-profile', again); };
  }, []);
  return me;
}

export function initialsOf(s: string) {
  const parts = s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}
