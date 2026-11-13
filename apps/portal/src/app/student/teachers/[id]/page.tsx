'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { ProfileHero, StatTiles, heroPrimary, heroSecondary } from '@/components/profile/ProfileHero';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Profile {
  id: string; name: string; avatarUrl: string | null; studentCount?: number; bio: string | null; videoIntroUrl: string | null; subjectAreas: string[]; yearsExperience: number | null;
  qualification: string | null; country: { name: string } | null; avgRating: number | null; reviewCount: number;
  courses: { id: string; title: string; programme: { name: string } | null; subject: { name: string } | null }[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string; student: { name: string } }[];
  availableSlots: { id: string; startsAt: string; durationMins: number }[];
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
// Some older profiles store subject ids instead of names
const realSubjects = (xs: string[]) => xs.filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));
const slotLabel = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} · ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

/** A teacher as students see them: the same profile hero teachers see on their own profile */
export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [allow, setAllow] = useState<{ perMonth: number | null; left: number | null; hasPackage: boolean } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [t, lib, a] = await Promise.all([
      api.get(`/teachers/${id}`),
      api.get('/portals/student/library').catch(() => ({ data: { courses: [] } })),
      api.get('/mentorship/allowance').catch(() => ({ data: null })),
    ]);
    setP(t.data); setOwned(new Set((lib.data?.courses ?? []).map((c: { id: string }) => c.id))); setAllow(a.data);
  }
  useEffect(() => { load().catch(() => { notify.error('Teacher not found'); router.push('/student/teachers'); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/teachers" backLabel="Teachers" title="Teacher" />
      <div className="m-4 h-72 animate-pulse rounded-[14px] bg-[#3F6FE8]/30 lg:m-7" />
    </div>
  );
  const taughtByThem = p.courses.some(c => owned.has(c.id));
  const subjects = realSubjects(p.subjectAreas);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/teachers" backLabel="Teachers" title={p.name} subtitle="Teacher profile" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <ProfileHero photo={p.avatarUrl} initials={initials(p.name)}
          kicker={['Teacher', p.country?.name, p.yearsExperience ? `${p.yearsExperience} years teaching` : null].filter(Boolean).join(' · ')}
          l1={`${p.name}.`} l2={subjects.length ? `${subjects.slice(0, 2).join(' and ')}.` : 'Teaching on CareerPath.'}
          bio={p.bio} chips={subjects.slice(0, 4)}
          actions={<>
            <Link href="/student/mentorship" className={heroPrimary}>Book mentorship</Link>
            <Link href={`/student/messages?to=${p.id}`} className={heroSecondary}>Send a message</Link>
          </>} />
        <StatTiles tiles={[
          { l: 'Students', v: String(p.studentCount ?? 0) },
          { l: 'Rating', v: p.avgRating != null ? `${p.avgRating} ★` : '—', d: p.reviewCount ? `from ${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'}` : 'No reviews yet' },
          { l: 'Courses', v: String(p.courses.length), d: taughtByThem ? 'You learn with them' : undefined },
          { l: 'Free times', v: String(p.availableSlots.length), d: p.availableSlots[0] ? `next ${slotLabel(p.availableSlots[0].startsAt)}` : 'none right now' },
        ]} />

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            {p.videoIntroUrl && <div className="overflow-hidden rounded-lg border border-line bg-white p-2"><VideoEmbed url={p.videoIntroUrl} /></div>}
            {p.qualification && (
              <section className="rounded-lg border border-line bg-white p-[18px]">
                <h2 className="mb-1.5 text-base font-bold text-navy">Qualifications</h2>
                <p className="text-[13.5px] text-ink2">{p.qualification}</p>
              </section>
            )}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">Courses</h2>
              {!p.courses.length ? <p className="text-[13px] text-ink2">No published courses yet.</p> : p.courses.map(c => (
                <Link key={c.id} href={owned.has(c.id) ? `/student/learn/${c.id}` : `/student/courses/${c.id}`} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-[13.5px] hover:bg-subtle">
                  <span className="min-w-0"><strong className="block truncate font-semibold text-navy">{c.title}</strong><span className="text-xs text-muted">{[c.programme?.name, c.subject?.name].filter(Boolean).join(' · ')}</span></span>
                  <span className={clsx('whitespace-nowrap text-[12.5px] font-semibold', owned.has(c.id) ? 'text-azure-strong' : 'text-muted')}>{owned.has(c.id) ? 'You’re enrolled' : 'View course'}</span>
                </Link>
              ))}
            </section>
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">What students say</h2>
              {!p.reviews.length && <p className="text-[13px] text-ink2">No reviews yet.</p>}
              {p.reviews.map(r => (
                <p key={r.id} className="text-[13.5px]"><strong className="text-navy">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</strong>{' '}
                  <span className="text-ink2">{r.comment ? `“${r.comment}”` : ''} · {r.student.name.split(' ')[0]}, {new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short' })}</span></p>
              ))}
              {taughtByThem && (
                <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
                  <p className="text-[13px] font-semibold text-navy">Rate {p.name.split(' ')[0]}</p>
                  <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)}
                      className={clsx('h-9 w-9 rounded-md border text-lg', n <= stars ? 'border-azure bg-accent-soft text-azure-strong' : 'border-line text-muted')}>★</button>
                  ))}</div>
                  <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} maxLength={500} placeholder="What was it like learning with them? (optional)"
                    className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                  <div><Button size="sm" loading={busy} disabled={!stars} onClick={async () => {
                    setBusy(true);
                    try { await api.post(`/teachers/${id}/reviews`, { rating: stars, comment: comment.trim() || undefined }); notify.success('Thanks for your review'); setStars(0); setComment(''); await load(); }
                    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your review'); }
                    finally { setBusy(false); }
                  }}>Send review</Button></div>
                </div>
              )}
            </section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-lg border border-azure bg-white p-[18px] lg:sticky lg:top-6">
            <h3 className="text-[15px] font-semibold text-navy">Book a mentorship session</h3>
            {allow?.perMonth != null && <p className="text-[12.5px] text-muted">{allow.left} of {allow.perMonth} sessions left this month</p>}
            {allow && !allow.hasPackage ? <p className="text-[13px] text-ink2">Mentorship comes with packages. <Link href="/packages" className="font-semibold text-azure-strong hover:underline">See packages</Link></p>
              : !p.availableSlots.length ? <p className="text-[13px] text-ink2">No free times right now.</p> : (
                <div className="grid grid-cols-2 gap-1.5">
                  {p.availableSlots.slice(0, 6).map(s => <span key={s.id} className="flex h-[34px] items-center justify-center rounded-md border border-line text-[12.5px] font-semibold text-navy">{slotLabel(s.startsAt)}</span>)}
                </div>
              )}
            <Link href="/student/mentorship" className="inline-flex h-[38px] items-center justify-center rounded-md bg-azure-strong text-[13.5px] font-semibold text-on-accent">See all times and book</Link>
            <Link href={`/student/messages?to=${p.id}`} className="inline-flex h-[38px] items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">Send a message</Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
