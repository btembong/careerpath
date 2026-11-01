'use client';
import { useParams } from 'next/navigation';
import { Verify } from '@/components/verify/Verify';

/** Opened from the link or QR code printed on a certificate */
export default function VerifyCodePage() {
  const { code } = useParams<{ code: string }>();
  return <Verify initialKind="certificate" initialCode={decodeURIComponent(code)} />;
}
