'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Certificate {
  id: string;
  courseName: string | null;
  packageName: string | null;
  cohortName: string | null;
  issuedAt: string;
  pdfUrl: string | null;
  verifyCode: string | null;
  grade: string | null;
  score: number | null;
  maxScore: number | null;
}

function verifyUrl(code: string | null): string {
  if (!code) return '#';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/verify/${code}`;
}

function copyVerifyLink(code: string | null) {
  if (!code) return;
  const url = verifyUrl(code);
  navigator.clipboard.writeText(url)
    .then(() => notify.success('Verify link copied!'))
    .catch(() => notify.error('Could not copy link'));
}

export default function CertificatesPage() {
  const [certs,   setCerts]   = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    api.get('/certificates')
      .then(r => setCerts(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 max-w-5xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl overflow-hidden border border-cloud shadow-card">
              <div className="h-40 bg-navy/10 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-8 w-full rounded-xl bg-cloud animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-8 w-8 rounded-xl bg-cloud animate-pulse" />
                  <div className="h-8 w-8 rounded-xl bg-cloud animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="My Certificates"
        subtitle={certs.length > 0
          ? `${certs.length} certificate${certs.length !== 1 ? 's' : ''} earned`
          : 'Your earned achievements'}
      />

      <div className="flex-1 p-6 max-w-5xl w-full mx-auto">
        {certs.length === 0 ? (
          <Card>
            <EmptyState
              icon="certificates"
              title="No certificates yet"
              description="Complete a course to earn your first certificate"
              action={{ label: 'Browse courses', href: '/student/catalogue' }}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {certs.map((cert) => {
              const scorePct = cert.score != null && cert.maxScore
                ? Math.round((cert.score / cert.maxScore) * 100)
                : null;
              const context = [cert.packageName, cert.cohortName].filter(Boolean).join(' · ');

              return (
                <Card key={cert.id} padding="none" className="overflow-hidden">
                  {/* Header */}
                  <div className="bg-navy p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-azure/20 mb-3">
                      <Icon name="certificates" size={22} className="text-azure" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">Certificate of Completion</p>
                    <h3 className="text-base font-bold text-white mt-1 leading-snug">
                      {cert.courseName ?? 'Course Completion'}
                    </h3>
                    {context && (
                      <p className="text-xs text-white/40 mt-1 truncate">{context}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <p className="text-xs text-white/40">
                        Issued {new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      {cert.grade && (
                        <span className="rounded-md bg-azure/20 px-2 py-0.5 text-[10px] font-bold text-azure">
                          {cert.grade}
                        </span>
                      )}
                      {scorePct !== null && (
                        <span className="rounded-md bg-azure/20 px-2 py-0.5 text-[10px] font-bold text-azure">
                          {scorePct}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 space-y-2">
                    {/* Primary row: Preview + Download or Verify */}
                    {cert.pdfUrl ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPreview({ url: cert.pdfUrl!, name: cert.courseName ?? 'Certificate' })}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cloud bg-white py-2.5 text-xs font-semibold text-navy hover:bg-cloud transition">
                          <Icon name="eye" size={13} /> Preview
                        </button>
                        <a href={cert.pdfUrl} target="_blank" rel="noreferrer"
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-azure py-2.5 text-xs font-semibold text-white hover:bg-royal transition">
                          <Icon name="download" size={13} /> Download
                        </a>
                      </div>
                    ) : cert.verifyCode ? (
                      <a href={verifyUrl(cert.verifyCode)} target="_blank" rel="noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-azure py-2.5 text-xs font-semibold text-white hover:bg-royal transition">
                        <Icon name="externalLink" size={13} /> Verify certificate
                      </a>
                    ) : null}

                    {/* Secondary row: LinkedIn share · Copy link · Verify */}
                    {cert.verifyCode && (
                      <div className="flex gap-2">
                        <a
                          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl(cert.verifyCode))}`}
                          target="_blank" rel="noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[#0077B5] flex-shrink-0">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                          LinkedIn
                        </a>
                        <button
                          onClick={() => copyVerifyLink(cert.verifyCode)}
                          title="Copy verify link"
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                          <Icon name="copy" size={13} /> Copy link
                        </button>
                        {cert.pdfUrl && (
                          <a href={verifyUrl(cert.verifyCode)} target="_blank" rel="noreferrer"
                            title="Verify certificate"
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                            <Icon name="externalLink" size={13} /> Verify
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={spring.smooth}
              className="relative w-full max-w-3xl h-[80vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-cloud">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy truncate">{preview.name}</p>
                  <p className="text-[10px] text-royal/50">Certificate preview</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={preview.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal transition">
                    <Icon name="download" size={12} /> Download
                  </a>
                  <button
                    onClick={() => setPreview(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-cloud hover:bg-cloud transition">
                    <Icon name="close" size={16} className="text-navy" />
                  </button>
                </div>
              </div>
              {/* PDF iframe */}
              <iframe
                src={preview.url}
                title="Certificate preview"
                className="flex-1 w-full border-0"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
