'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { reportError } from '@/components/providers/ErrorReporter';

/** A page crashed: say so plainly, offer to try again, and tell Admin → Errors */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error.message || 'Page crashed', error.stack); }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-[22px] font-extrabold text-navy">Something went wrong on this page.</p>
      <p className="max-w-[420px] text-sm text-ink2">We’ve been told about it. Try again; if it keeps happening, go back and try another way.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="h-10 rounded-md bg-[#3F6FE8] px-4 text-sm font-semibold text-white hover:bg-[#2F57C9]">Try again</button>
        <Link href="/" className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-navy hover:bg-subtle">Go to my home page</Link>
      </div>
    </div>
  );
}
