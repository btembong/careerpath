'use client';
import { Suspense as _Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Verify } from '@/components/verify/Verify';

// The repo's React types don't accept Suspense as a JSX element (same workaround as the login page)
const Suspense = _Suspense as any;

function Inner() {
  const p = useSearchParams();
  const receipt = p.get('receipt');
  return <Verify initialKind={receipt ? 'receipt' : 'certificate'} initialCode={receipt ?? p.get('code') ?? ''} />;
}

export default function VerifyPage() {
  return <Suspense><Inner /></Suspense>;
}
