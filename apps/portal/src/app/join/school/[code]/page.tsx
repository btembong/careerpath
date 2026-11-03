'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { BrandLogo } from '@/components/brand/BrandLogo';

/** Public page behind a school's join link: which school, then sign up or sign in to take a seat */
export default function SchoolJoinPage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<{ valid: boolean; name?: string; open?: boolean; emailDomain?: string | null } | null>(null);
  useEffect(() => {
    // Remembered so the seat is taken right after signing up (the student area picks it up)
    try { localStorage.setItem('cpa:pendingJoin', code); } catch {}
    api.get(`/org/join/${encodeURIComponent(code)}`).then(r => setInfo(r.data)).catch(() => setInfo({ valid: false }));
  }, [code]);
  const next = encodeURIComponent(`/student/join/${code}`);
  return (
    <div className="flex min-h-screen flex-col items-center bg-surface">
      <header className="flex w-full items-center gap-3 bg-[#3F6FE8] px-7 py-4">
        <BrandLogo tone="onBlue" />
      </header>
      <main className="flex w-full max-w-[560px] flex-col gap-4 px-4 py-10">
        {!info ? <div className="h-40 animate-pulse rounded-lg bg-white" /> : !info.valid ? (
          <section className="rounded-lg border border-line bg-white p-6">
            <p className="text-[20px] font-extrabold text-navy">This join link isn’t active</p>
            <p className="mt-1 text-[14px] text-ink2">Your school may have made a new one. Ask them for the latest link.</p>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-lg border border-azure bg-white p-6">
            <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Invitation</p>
            <p className="text-[24px] font-extrabold text-navy">{info.name} has a place for you</p>
            {info.open ? <>
              <p className="text-[14px] text-ink2">Create your account{info.emailDomain ? <> with your <strong className="text-navy">@{info.emailDomain}</strong> email</> : ''}, or sign in if you already have one. Your school’s package is added straight away.</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link href={`/register?next=${next}`} className="inline-flex h-11 items-center rounded-md bg-azure-strong px-5 text-[14px] font-semibold text-on-accent">Create my account</Link>
                <Link href={`/login?next=${next}`} className="inline-flex h-11 items-center rounded-md border border-line px-5 text-[14px] font-semibold text-navy hover:bg-subtle">I have an account</Link>
              </div>
            </> : <p className="text-[14px] text-ink2">All of {info.name}’s seats are taken. Ask your school to get more.</p>}
          </section>
        )}
      </main>
    </div>
  );
}
