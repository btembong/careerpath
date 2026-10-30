'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Public: type a certificate code to check it's real. */
export default function VerifyLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <main className="grid min-h-screen place-items-center bg-subtle p-4">
      <form onSubmit={e => { e.preventDefault(); if (code.trim()) router.push(`/verify/${encodeURIComponent(code.trim())}`); }}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-line bg-white p-6">
        <h1 className="text-lg font-extrabold text-navy">Check a certificate</h1>
        <p className="text-[13.5px] text-ink2">Enter the code printed on the certificate.</p>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. CPA-7KQ2-91" className="input-base font-mono" autoFocus />
        <button type="submit" className="h-10 rounded-md bg-azure-strong text-sm font-semibold text-on-accent hover:opacity-90">Check</button>
      </form>
    </main>
  );
}
