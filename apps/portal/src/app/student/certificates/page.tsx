'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { Celebrate, ShareDialog } from '@/components/celebrate/Celebrate';
import { HelpfulEmpty } from '@/components/ui/HelpfulEmpty';

interface Certificate { id: string; courseId: string; courseName: string; issuedAt: string; verifyCode: string; pdfUrl: string }
interface LibraryCourse { id: string; title: string; lessons: number; done: number; pct: number; state: 'new' | 'going' | 'done'; certificate: unknown }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const verifyUrl = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${code}`;

const certShare = (c: Certificate) => ({ c1: 'Certified in', c2: `${c.courseName}.`, c3: `Check it: ${c.verifyCode}`, label: '✓ Verifiable', link: verifyUrl(c.verifyCode) });
const WEEK = 7 * 24 * 3600 * 1000;

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [onTheWay, setOnTheWay] = useState<LibraryCourse[]>([]);
  const [sharing, setSharing] = useState<Certificate | null>(null);

  useEffect(() => {
    api.get('/certificates').then(r => setCerts(r.data ?? [])).catch(() => { setCerts([]); notify.error('Could not load your certificates'); });
    api.get('/portals/student/library')
      .then(r => setOnTheWay(((r.data?.courses ?? []) as LibraryCourse[]).filter(c => !c.certificate && c.state !== 'done' && c.lessons > 0).sort((a, b) => b.pct - a.pct)))
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Certificates" subtitle="Proof of what you’ve finished — download, share or verify" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        {certs?.[0] && Date.now() - +new Date(certs[0].issuedAt) < WEEK && (
          <Celebrate emoji="🎓" l1="Certified." l2="It’s official."
            sub={`${certs[0].courseName}. Anyone can check it with the code ${certs[0].verifyCode} at ${typeof window !== 'undefined' ? window.location.host : 'app.careerpathafrica.com'}/verify.`}
            next={{ label: 'Download PDF', href: certs[0].pdfUrl }}
            share={certShare(certs[0])} />
        )}
        {sharing && <ShareDialog share={certShare(sharing)} onClose={() => setSharing(null)} />}
        {!certs ? <div className="h-56 rounded-lg bg-subtle animate-pulse" /> : !certs.length ? (
          <HelpfulEmpty title="Your first certificate is a course away." body="Finish every lesson and quiz in a course and your certificate is made here."
            cta={onTheWay[0] ? { label: 'Continue my course', href: `/student/courses/${onTheWay[0].id}` } : { label: 'Browse the catalogue', href: '/student/catalogue' }}
            preview={{ icon: '🎓', title: 'Certificate', line: onTheWay[0]?.title ?? 'Core Maths' }} />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {certs.map(c => (
              <article key={c.id} className="flex flex-col gap-2.5 rounded-lg border border-azure bg-white p-[18px]">
                <div className="grid h-[120px] place-items-center rounded-md border border-line bg-subtle text-center">
                  <div className="px-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Certificate of completion</p>
                    <p className="mt-1.5 text-[15px] font-extrabold text-navy">{c.courseName}</p>
                  </div>
                </div>
                <p className="text-[12.5px] text-muted">Issued {fmt(c.issuedAt)} · code <span className="font-mono">{c.verifyCode}</span></p>
                <div className="flex gap-2">
                  <a href={c.pdfUrl} target="_blank" rel="noreferrer" className="grid h-[34px] flex-1 place-items-center rounded-md bg-azure-strong text-[13px] font-semibold text-on-accent hover:opacity-90">Download PDF</a>
                  <button onClick={() => setSharing(c)} className="grid h-[34px] place-items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Share</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold text-navy">On the way</h2>
          {!onTheWay.length ? <p className="text-[13px] text-muted">No courses in progress.</p> : onTheWay.map(c => {
            const left = c.lessons - c.done;
            return (
              <Link key={c.id} href={`/student/courses/${c.id}`} className="flex items-center gap-3 rounded-md py-1 text-[13.5px] text-navy hover:bg-subtle">
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="h-1.5 w-[120px] shrink-0 rounded-full bg-subtle"><span className="block h-1.5 rounded-full bg-azure" style={{ width: `${c.pct}%` }} /></span>
                <span className="hidden w-[150px] text-[12.5px] text-muted sm:block">{left} lesson{left === 1 ? '' : 's'} left</span>
              </Link>
            );
          })}
        </section>

        <p className="text-[12.5px] text-muted">
          Anyone can check a certificate is real at <Link href="/verify" className="font-semibold text-azure-strong hover:underline">careerpathafrica.com/verify</Link> with its code.
        </p>
      </div>
    </div>
  );
}
