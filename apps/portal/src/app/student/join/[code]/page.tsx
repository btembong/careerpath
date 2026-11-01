'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

/** A signed-in student takes a seat with their school's join link */
export default function StudentJoinPage() {
  const { code } = useParams<{ code: string }>();
  const [res, setRes] = useState<{ claimed: { organisation: string; packageName: string }[]; already?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.removeItem('cpa:pendingJoin'); } catch {}
    api.post(`/org/join/${encodeURIComponent(code)}`).then(r => setRes(r.data)).catch(e => setError(e?.response?.data?.message ?? 'Could not join'));
  }, [code]);
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Join your school" subtitle="Seats your school bought" />
      <div className="p-4 lg:px-7 lg:py-6">
        <section className="mx-auto flex max-w-xl flex-col gap-3 rounded-lg border border-line bg-white p-6 text-center">
          {error ? <><p className="text-[16px] font-bold text-navy">Couldn’t join</p><p className="text-[13.5px] text-ink2">{error}</p></>
            : !res ? <><p className="text-[16px] font-bold text-navy">Joining…</p><div className="mx-auto h-1.5 w-40 animate-pulse rounded bg-subtle" /></>
            : res.claimed.length ? <>
              <p className="text-[18px] font-extrabold text-navy">You’re in</p>
              {res.claimed.map((c, i) => <p key={i} className="text-[13.5px] text-ink2"><strong className="text-navy">{c.organisation}</strong> gave you <strong className="text-navy">{c.packageName}</strong>.</p>)}
              <Link href="/student/courses" className="mx-auto mt-2 inline-flex h-10 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Go to my courses</Link>
            </> : <><p className="text-[16px] font-bold text-navy">You already have a seat</p><Link href="/student/courses" className="mx-auto text-[13.5px] font-semibold text-azure-strong hover:underline">Go to my courses</Link></>}
        </section>
      </div>
    </div>
  );
}
