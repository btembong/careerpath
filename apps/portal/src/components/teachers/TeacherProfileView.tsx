'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TeacherPageBody, firstName, type TeacherProfile } from '@/components/public/TeacherPageBody';
import type { CardMine } from '@/components/public/course/BigCourseCard';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

/** What only the portal knows: the teacher's free times */
interface PortalTeacher { id: string; availableSlots: { id: string; startsAt: string; durationMins: number }[] }
interface LibCourse { id: string; pct: number; state: 'new' | 'going' | 'done'; next: { id: string; title: string } | null }
const slotLabel = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

/**
 * A teacher's page inside the portal: their public profile, plus what the person looking can do.
 * A student books mentoring, sends a message, sees their own courses with this teacher first, and can rate them.
 * `preview` (admins) shows it without actions; `own` is the teacher looking at their own page.
 */
export function TeacherProfileView({ id, backHref = '/student/teachers', backLabel = 'Teachers', preview, own }: { id: string; backHref?: string; backLabel?: string; preview?: boolean; own?: boolean }) {
  const router = useRouter();
  const [t, setT] = useState<TeacherProfile | null>(null);
  const [extra, setExtra] = useState<PortalTeacher | null>(null);
  const [lib, setLib] = useState<LibCourse[]>([]);
  const [allow, setAllow] = useState<{ perMonth: number | null; left: number | null; hasPackage: boolean } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const student = !preview && !own;

  async function load() {
    const [pub, portal, l, a] = await Promise.all([
      api.get(`/catalogue/teacher-page/${id}`),
      api.get(`/teachers/${id}`).catch(() => ({ data: null })),
      student ? api.get('/portals/student/library').catch(() => ({ data: { courses: [] } })) : Promise.resolve({ data: { courses: [] } }),
      student ? api.get('/mentorship/allowance').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ]);
    setT(pub.data); setExtra(portal.data); setLib(l.data?.courses ?? []); setAllow(a.data);
  }
  useEffect(() => { load().catch(() => { notify.error('Teacher not found'); router.push(backHref); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={backHref} backLabel={backLabel} title="Teacher" />
      <div className="m-4 h-72 animate-pulse rounded-[14px] bg-[#3F6FE8]/30 lg:m-7" />
    </div>
  );

  const first = firstName(t.name);
  const slots = extra?.availableSlots ?? [];
  // Their courses with this teacher: progress, the next lesson, Continue
  const libById = new Map(lib.map(x => [x.id, x]));
  const mine = new Map<string, CardMine>();
  for (const c of t.courses) {
    const cid = c.id ?? c.slug, l = libById.get(cid);
    if (l) mine.set(cid, { pct: l.pct, next: l.next?.title ?? null, href: l.next ? `/student/learn/${cid}/lesson/${l.next.id}` : `/student/learn/${cid}` });
  }
  const learnsWith = mine.size > 0;
  const avg = learnsWith ? Math.round([...mine.values()].reduce((n, m) => n + m.pct, 0) / mine.size) : 0;

  const book = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#2F57C9] text-[14px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]';
  const ghost = 'inline-flex h-10 items-center justify-center rounded-md border border-line text-[14px] font-extrabold text-navy hover:bg-[#F4F6FB]';
  const times = (label: string) => slots.length > 0 && (
    <span className="flex flex-col gap-1">
      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">{label}</span>
      {slots.slice(0, 3).map(s => (
        <Link key={s.id} href={student ? '/student/mentorship' : '#'} className="rounded-md border border-[#D5DDEC] px-2.5 py-1.5 text-[12.5px] font-bold text-[#2F57C9] hover:bg-[#F4F6FB]">{slotLabel(s.startsAt)}</Link>
      ))}
    </span>
  );
  const mentoringNote = !student ? null
    : allow && !allow.hasPackage ? <>Mentoring comes with packages. <Link href="/packages" className="font-bold text-[#2F57C9] hover:underline">See packages</Link></>
    : allow?.perMonth != null ? `${allow.left} of ${allow.perMonth} mentor sessions left this month`
    : null;

  const side = student ? <>
    <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">Learn with {first}</p>
    <Link href="/student/mentorship" className={book}><Icon name="mentorship" size={15} />Book a mentoring session</Link>
    {slots.length ? times('Next free times') : <span className="text-[12.5px] text-[#637090]">No free times right now.</span>}
    <Link href={`/student/messages?to=${t.id}`} className={ghost}>Send a message</Link>
    {mentoringNote && <span className="text-[12px] leading-snug text-[#637090]">{mentoringNote}</span>}
  </> : <>
    <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#637090]">Students see</p>
    <span className={clsx(book, 'pointer-events-none')}><Icon name="mentorship" size={15} />Book a mentoring session</span>
    {slots.length ? times(own ? 'Your next free times' : 'Next free times') : <span className="text-[12.5px] text-[#637090]">{own ? 'You have no free times open.' : 'No free times right now.'}</span>}
    <span className={clsx(ghost, 'pointer-events-none')}>Send a message</span>
  </>;

  const reviewForm = student && learnsWith && (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-[13.5px] font-bold text-navy">Rate {first}</p>
      <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)}
          className={clsx('h-9 w-9 rounded-md border text-lg', n <= stars ? 'border-azure-strong bg-accent-soft text-azure-strong' : 'border-line text-muted')}>★</button>
      ))}</div>
      <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} maxLength={500} placeholder={`What was it like learning with ${first}? (optional)`}
        className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure-strong" />
      <div><Button size="sm" loading={busy} disabled={!stars} onClick={async () => {
        setBusy(true);
        try { await api.post(`/teachers/${id}/reviews`, { rating: stars, comment: comment.trim() || undefined }); notify.success('Thanks for your review'); setStars(0); setComment(''); await load(); }
        catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your review'); }
        finally { setBusy(false); }
      }}>Send review</Button></div>
      <p className="text-[12px] text-muted">Only students who learn with {first} can rate them.</p>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col text-navy">
      <Topbar backHref={backHref} backLabel={backLabel} title={t.name} subtitle={preview ? 'Preview: what students see' : own ? 'How students see you' : 'Teacher profile'} />
      <div className="flex flex-col gap-5 p-4 pb-24 lg:px-7 lg:py-6">
        {own && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-azure-strong bg-accent-soft px-4 py-3 text-[13.5px] text-ink2">
            <Icon name="check" size={16} className="text-[#2EAA5F]" />
            <span className="min-w-[240px] flex-1"><b className="text-navy">This is your public profile</b>, as students and visitors see it. Booking and messages are off for you here.</span>
            <Link href="/teacher/profile" className="inline-flex h-9 items-center rounded-lg bg-azure-strong px-3.5 text-[13px] font-extrabold text-on-accent">Edit my profile</Link>
            <Link href="/teacher/mentorship" className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3.5 text-[13px] font-extrabold text-navy hover:bg-subtle">Add a free time</Link>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/teachers/${t.slug}`).then(() => notify.success('Link copied')).catch(() => notify.error('Could not copy the link')); }}
              className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3.5 text-[13px] font-extrabold text-navy hover:bg-subtle">Copy the link</button>
          </div>
        )}
        <TeacherPageBody t={t} side={side}
          mobileAction={student ? <>
            <Link href="/student/mentorship" className="inline-flex h-11 items-center justify-center rounded-md bg-[#072061] px-4 text-[15px] font-extrabold text-[#FFFFFF]">Book a mentoring session</Link>
            <Link href={`/student/messages?to=${t.id}`} className="inline-flex h-11 items-center justify-center rounded-md bg-[rgba(255,255,255,0.3)] px-4 text-[15px] font-extrabold text-navy">Send a message</Link>
          </> : undefined}
          stat={learnsWith ? { label: `You with ${first}`, value: String(mine.size), sub: `course${mine.size === 1 ? '' : 's'} · ${avg}% done`, strong: true } : undefined}
          mine={student ? mine : undefined}
          cardHref={cid => student ? (mine.has(cid) ? `/student/learn/${cid}` : `/student/courses/${cid}`) : own ? `/teacher/courses/${cid}` : `/admin/courses`}
          reviewForm={reviewForm || undefined} />
      </div>
    </div>
  );
}
