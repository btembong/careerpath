'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface CertificateResult {
  valid: boolean;
  courseId: string;
  courseName: string;
  studentEmail: string;
  studentName: string;
  issuedAt: string;
  verifyCode: string;
}

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [cert, setCert] = useState<CertificateResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/certificates/verify/${code}`,
      { cache: 'no-store' },
    )
      .then(r => (r.ok ? r.json() : null))
      .then(setCert)
      .catch(() => setCert(null))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-azure border-t-transparent" />
    </main>
  );

  if (!cert) return (
    <main className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-bold text-navy mb-1">Certificate not found</p>
        <p className="text-xs text-royal/50">The verification code may be invalid or expired.</p>
      </div>
    </main>
  );

  const issuedDate = new Date(cert.issuedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy mx-auto mb-3">
            <span className="text-lg font-black text-white">C</span>
          </div>
          <p className="text-sm font-semibold text-navy">CareerPath<span className="text-azure">Africa</span></p>
        </div>

        {/* Certificate card */}
        <div className="rounded-2xl border border-cloud bg-white overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(7,32,97,0.05)' }}>

          {/* Navy header */}
          <div className="bg-navy px-6 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/20">
                <Icon name="certificates" size={20} className="text-azure" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">CERTIFICATE</p>
                <p className="text-base font-bold text-white">Course Completion</p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            {[
              { icon: 'user' as const,        label: 'Student',           value: cert.studentName },
              { icon: 'courses' as const,      label: 'Course',            value: cert.courseName },
              { icon: 'calendar' as const,     label: 'Issued on',         value: issuedDate },
              { icon: 'hash' as const,         label: 'Verification code', value: cert.verifyCode, mono: true },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-cloud text-azure mt-0.5">
                  <Icon name={row.icon} size={14} />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">{row.label}</p>
                  <p className={`text-sm font-semibold text-navy mt-0.5 ${row.mono ? 'font-mono' : ''}`}>{row.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Verified badge */}
          <div className="border-t border-cloud px-6 py-4">
            <div className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-azure flex-shrink-0" />
              <p className="text-sm font-semibold text-navy">This certificate is genuine and verified</p>
            </div>
            <p className="text-xs text-royal/50 mt-1 ml-6">
              Issued by CareerPath Africa. Powered by a tamper-proof verification system.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
