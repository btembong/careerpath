'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as _RadixDialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Drawer, Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { HeroPhoto } from '@/components/hero/PageHero';
import { Flag } from '@/components/ui/Flag';
import { ActivityHistory } from '@/components/activity/Activity';
import { PersonPlaces } from '@/components/activity/WhereUsers';
import { downloadFromApi } from '@/lib/download';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixDialog = _RadixDialog as any;

export interface Money { currency: string; amount: number }
export const money = (m: Money[] | Money | null | undefined) => {
  const list = !m ? [] : Array.isArray(m) ? m : [m];
  return list.length ? list.map(x => `${x.currency} ${minorToMajor(x.amount, x.currency).toLocaleString()}`).join(' · ') : '—';
};
export const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const realSubjects = (xs: string[]) => xs.filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));
const day = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Detail {
  id: string; name: string; email: string; status: 'APPROVED' | 'SUSPENDED' | 'PENDING' | 'REJECTED'; joinedAt: string; avatarUrl: string | null;
  country: { code: string; name: string } | null; lastActive: string | null; lastDevice: string | null; subjects: string[]; yearsExperience: number | null;
  profile: { video: boolean; bio: boolean; photo: boolean; videoUrl: string | null };
  agreement: { at: string; version: string | null } | null;
  rating: number | null; ratings: number;
  courses: { id: string; title: string; status: string; students: number; commissionPct: number | null }[];
  cohorts: { id: string; name: string; students: number; classesHeld: number; attendancePct: number | null; missingRecordings: number }[];
  mentorship: { freeSlots: number; booked: number; rating: number | null; ratings: number };
  earned30d: Money[];
  money: { thisMonth: Money[]; lastMonth: Money[]; balance: Money | null; pending: Money[]; lastPaid: (Money & { at: string | null }) | null; account: { label: string; verified: boolean } | null };
  application: { submittedAt: string; qualification: string | null; modality: string | null; bio: string; cv: string | null; linkedin: string | null; website: string | null; phone: string | null; yearsExperience: number | null } | null;
}

const COURSE_STATUS: Record<string, string> = { PUBLISHED: 'Published', PENDING_REVIEW: 'In review', DRAFT: 'Draft', ARCHIVED: 'Archived' };
const QUAL: Record<string, string> = { HIGH_SCHOOL: 'High school', BACHELOR: 'Bachelor’s', MASTER: 'Master’s', PHD: 'PhD', PROFESSIONAL: 'Professional certificate' };
const MODE: Record<string, string> = { ONLINE: 'Online', IN_PERSON: 'In person', HYBRID: 'Online and in person' };
type Tab = 'overview' | 'courses' | 'teaching' | 'application' | 'money' | 'activity';

function Tile({ l, v, d }: { l: string; v: React.ReactNode; d?: React.ReactNode }) {
  return <div className="rounded-lg bg-subtle p-2.5"><p className="text-[11.5px] text-muted">{l}</p><p className="mt-0.5 truncate text-[19px] font-extrabold text-navy">{v}</p>{d && <p className="truncate text-[11.5px] text-muted">{d}</p>}</div>;
}
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2"><h3 className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">{title}</h3>{children}</section>
);

/** One teacher, everything in one place: a blue header with their photo and tabs underneath */
export function TeacherDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState('');

  const load = (tid: string) => api.get(`/portals/admin/teachers/${tid}/overview`).then(r => { setD(r.data); setVideo(r.data.profile.videoUrl ?? ''); });
  useEffect(() => { setD(null); setTab('overview'); if (id) load(id).catch(() => notify.error('Could not load this teacher')); }, [id]);

  async function suspend(on: boolean) {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/portals/admin/teachers/${id}/suspend`, { suspended: on, reason: reason.trim() || undefined });
      notify.success(on ? 'Teacher suspended' : 'Teacher reinstated');
      setSuspending(false); setReason(''); await load(id); onChanged();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'That didn’t work'); }
    finally { setBusy(false); }
  }
  async function nudge(kind: 'agreement' | 'photo') {
    if (!id) return;
    try { await api.post('/portals/admin/teachers-nudge', { kind, ids: [id] }); notify.success(kind === 'agreement' ? 'Reminder sent' : 'Asked for a photo'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send it'); }
  }
  async function saveVideo() {
    if (!id) return;
    try { await api.patch(`/teachers/admin/${id}/video`, { videoIntroUrl: video.trim() || null }); notify.success('Intro video saved'); await load(id); onChanged(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save the link'); }
  }

  const subjects = d ? realSubjects(d.subjects) : [];
  const students = d ? d.courses.reduce((n, c) => n + c.students, 0) + d.cohorts.reduce((n, c) => n + c.students, 0) : 0;
  const done = d ? [d.profile.photo, d.profile.bio, d.profile.video, !!d.agreement].filter(Boolean).length : 0;
  const tabs: [Tab, string][] = [['overview', 'Overview'], ['courses', `Courses${d ? ` ${d.courses.length}` : ''}`], ['teaching', 'Teaching'], ['application', 'Application'], ['money', 'Money'], ['activity', 'Activity']];
  const check = (ok: boolean, label: React.ReactNode, fix?: React.ReactNode) => (
    <div className="flex items-center gap-2 text-[13px] text-navy">
      <span className={clsx('inline-flex h-[21px] min-w-[21px] items-center justify-center rounded-[5px] text-[11px] font-extrabold', ok ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-[#FFF1D6] text-[#8A5A00]')}>{ok ? '✓' : '—'}</span>
      <span className="min-w-0">{label}{fix && <> · {fix}</>}</span>
    </div>
  );
  const fixBtn = 'font-bold text-azure-strong hover:underline';

  return (
    <>
      <Drawer open={!!id} onOpenChange={o => { if (!o) onClose(); }}>
        {id && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-50 bg-surface/70" />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild>
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col border-l border-line bg-white shadow-card-lg">
                <RadixDialog.Title className="sr-only">{d?.name ?? 'Teacher'}</RadixDialog.Title>
                <RadixDialog.Description className="sr-only">Teacher details</RadixDialog.Description>
                {/* Header: the profile hero, small */}
                <div className="keep-light relative flex flex-shrink-0 items-center gap-5 bg-[#3F6FE8] px-5 py-5 text-navy sm:px-6">
                  <RadixDialog.Close aria-label="Close" className="absolute right-3 top-3 rounded-md p-1.5 text-navy hover:bg-[rgba(255,255,255,0.2)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </RadixDialog.Close>
                  {!d ? <div className="h-[120px] w-full animate-pulse rounded-lg bg-[rgba(255,255,255,0.25)]" /> : <>
                    <div className="hidden sm:block"><HeroPhoto src={d.avatarUrl} initials={initialsOf(d.name)} /></div>
                    <div className="min-w-0 pr-6">
                      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.08em]">
                        Teacher{d.country && <> · <Flag code={d.country.code} title={d.country.name} /> {d.country.name}</>} · joined {new Date(d.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                        {d.status === 'SUSPENDED' && <span className="rounded bg-[#FDE8E8] px-1.5 py-0.5 text-[10.5px] text-[#B42318]">Suspended</span>}
                      </p>
                      <p className="mt-1.5 text-[24px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[28px]">{d.name}.{subjects.length > 0 && <><br /><span className="text-[#FFFFFF]">{subjects.slice(0, 2).join(' and ')}.</span></>}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Link href={`/admin/messages?to=${d.id}`} className="inline-flex h-8 items-center rounded-md bg-[#FFFFFF] px-3 text-[13px] font-bold text-[#2F57C9]">Message</Link>
                        <Link href={`/admin/teachers/${d.id}`} className="inline-flex h-8 items-center rounded-md bg-[#072061] px-3 text-[13px] font-bold text-[#FFFFFF]">See their profile as students do</Link>
                      </div>
                    </div>
                  </>}
                </div>
                <div role="tablist" aria-label="Teacher" className="no-scrollbar flex flex-shrink-0 gap-1 overflow-x-auto border-b border-line px-4 sm:px-5">
                  {tabs.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={clsx('-mb-px h-11 whitespace-nowrap border-b-2 px-2.5 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-extrabold' : 'border-transparent font-medium hover:text-azure-strong')}>{l}</button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  {!d ? <div className="h-64 animate-pulse rounded-md bg-subtle" /> : (
                    <div className="flex flex-col gap-5">
                      {d.status === 'SUSPENDED' && <p className="rounded-md border border-[#F3C4C4] bg-[#FFF5F5] px-3.5 py-2.5 text-[13px] text-ink2"><strong className="text-[#B42318]">Suspended.</strong> They can’t sign in, and students can’t see or book them. Their courses stay up.</p>}

                      {tab === 'overview' && <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Tile l="Courses" v={d.courses.filter(c => c.status !== 'ARCHIVED').length} />
                          <Tile l="Students" v={students} />
                          <Tile l="Rating" v={d.rating ? `${d.rating} ★` : '—'} d={d.ratings ? `${d.ratings} rating${d.ratings === 1 ? '' : 's'}` : 'none yet'} />
                          <Tile l="Earned · 30 days" v={money(d.earned30d)} />
                        </div>
                        <Sec title={`Profile checklist · ${done} of 4`}>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {check(d.profile.photo, 'Photo', !d.profile.photo && <button type="button" className={fixBtn} onClick={() => nudge('photo')}>ask for one</button>)}
                            {check(d.profile.bio, 'Bio', !d.profile.bio && <Link className={fixBtn} href={`/admin/messages?to=${d.id}`}>ask for one</Link>)}
                            {check(d.profile.video, 'Intro video', !d.profile.video && <button type="button" className={fixBtn} onClick={() => document.getElementById('tv-video')?.focus()}>add a link</button>)}
                            {check(!!d.agreement, d.agreement ? `Agreement, ${new Date(d.agreement.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Agreement',
                              d.agreement
                                ? <button type="button" className={fixBtn} onClick={() => downloadFromApi(`/auth/admin/users/${d.id}/tutor-agreement.pdf`, 'tutor-agreement.pdf').catch(() => notify.error('Could not make the PDF'))}>PDF</button>
                                : <button type="button" className={fixBtn} onClick={() => nudge('agreement')}>send a reminder</button>)}
                          </div>
                          <div className="mt-1 flex gap-2">
                            <input id="tv-video" value={video} onChange={e => setVideo(e.target.value)} type="url" aria-label="Intro video link" placeholder="Intro video: YouTube, Vimeo or a video link" className="input-base h-9 text-[13px]" />
                            <Button size="sm" variant="secondary" onClick={saveVideo}>Save</Button>
                          </div>
                        </Sec>
                        <Sec title="Last seen">
                          <p className="text-[13px] text-ink2">{d.lastActive ? new Date(d.lastActive).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : <span className="font-bold text-[#B42318]">Never signed in</span>}{d.lastDevice ? ` · ${d.lastDevice}` : ''}</p>
                          <PersonPlaces userId={d.id} />
                        </Sec>
                      </>}

                      {tab === 'courses' && (
                        <Sec title={`Courses · ${d.courses.length}`}>
                          {!d.courses.length ? <p className="text-[13px] text-ink2">No courses yet.</p> : d.courses.map(c => (
                            <Link key={c.id} href={`/admin/courses/${c.id}/builder`} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-[13px] hover:bg-subtle">
                              <span className="min-w-0"><strong className="block truncate font-semibold text-navy">{c.title}</strong><span className="text-xs text-muted">{c.students} student{c.students === 1 ? '' : 's'}{c.commissionPct != null ? ` · teacher’s share ${c.commissionPct}%` : ''}</span></span>
                              <span className={clsx('whitespace-nowrap rounded px-2 py-0.5 text-[11.5px] font-bold', c.status === 'PUBLISHED' ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-subtle text-ink2')}>{COURSE_STATUS[c.status] ?? c.status}</span>
                            </Link>
                          ))}
                          <p className="text-xs text-muted">Change a course’s share in Courses, in the course drawer.</p>
                        </Sec>
                      )}

                      {tab === 'teaching' && <>
                        <Sec title="Classes">
                          {!d.cohorts.length ? <p className="text-[13px] text-ink2">No classes.</p> : d.cohorts.map(c => (
                            <div key={c.id} className="rounded-md border border-line px-3 py-2.5 text-[13px]">
                              <strong className="text-navy">{c.name}</strong>
                              <p className="text-ink2">{c.students} students · {c.classesHeld} classes held{c.attendancePct != null ? ` · ${c.attendancePct}% attendance` : ''}{c.missingRecordings ? <span className="font-bold text-[#B42318]"> · {c.missingRecordings} recording{c.missingRecordings === 1 ? '' : 's'} missing</span> : ''}</p>
                            </div>
                          ))}
                        </Sec>
                        <Sec title="Mentorship">
                          <div className="grid grid-cols-3 gap-2">
                            <Tile l="Free times" v={d.mentorship.freeSlots} />
                            <Tile l="Booked" v={d.mentorship.booked} />
                            <Tile l="Mentoring rating" v={d.mentorship.rating ? `${d.mentorship.rating} ★` : '—'} d={d.mentorship.ratings ? `${d.mentorship.ratings}` : undefined} />
                          </div>
                          <p className="text-xs text-muted">{d.profile.video && d.status === 'APPROVED' ? 'Students can book them for mentoring.' : 'Students can’t book them for mentoring until they have an intro video.'}</p>
                        </Sec>
                      </>}

                      {tab === 'application' && (!d.application ? <p className="text-[13px] text-ink2">No application on file: they came from the website.</p> : <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Tile l="Applied" v={day(d.application.submittedAt)} />
                          <Tile l="Experience" v={d.application.yearsExperience != null ? `${d.application.yearsExperience} yrs` : '—'} />
                          <Tile l="Qualification" v={d.application.qualification ? QUAL[d.application.qualification] ?? d.application.qualification : '—'} />
                          <Tile l="Teaches" v={d.application.modality ? MODE[d.application.modality] ?? d.application.modality : '—'} />
                        </div>
                        <Sec title="Subjects"><p className="text-[13.5px] text-navy">{subjects.join(', ') || '—'}</p></Sec>
                        {d.application.bio && <Sec title="About"><p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink2">{d.application.bio}</p></Sec>}
                        <Sec title="Contact and links">
                          <p className="text-[13px] text-ink2">{d.email}{d.application.phone ? ` · ${d.application.phone}` : ''}</p>
                          <div className="flex flex-wrap gap-2">
                            {d.application.cv && <a href={d.application.cv} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-bold text-navy hover:bg-subtle">Open CV ↗</a>}
                            {d.application.linkedin && <a href={d.application.linkedin} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-bold text-navy hover:bg-subtle">LinkedIn ↗</a>}
                            {d.application.website && <a href={d.application.website} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-bold text-navy hover:bg-subtle">Website ↗</a>}
                          </div>
                        </Sec>
                      </>)}

                      {tab === 'money' && <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Tile l="Earned this month" v={money(d.money.thisMonth)} />
                          <Tile l="Last month" v={money(d.money.lastMonth)} />
                          <Tile l="In their wallet" v={money(d.money.balance)} />
                          <Tile l="Waiting to be paid" v={money(d.money.pending)} />
                          <Tile l="Last paid" v={d.money.lastPaid ? money(d.money.lastPaid) : '—'} d={d.money.lastPaid?.at ? day(d.money.lastPaid.at) : 'never'} />
                          <Tile l="Paid to" v={d.money.account?.label ?? 'Not set'} d={d.money.account ? (d.money.account.verified ? 'checked' : 'not checked yet') : 'they add it in Wallet'} />
                        </div>
                        <Link href="/admin/payouts" className="text-[13px] font-bold text-azure-strong hover:underline">Open Payouts →</Link>
                      </>}

                      {tab === 'activity' && <ActivityHistory targetType="UserProfile" targetId={d.id} limit={20} />}
                    </div>
                  )}
                </div>
                {d && (d.status === 'APPROVED' || d.status === 'SUSPENDED') && (
                  <div className="flex flex-shrink-0 justify-end gap-2 border-t border-line px-5 py-3 sm:px-6">
                    {d.status === 'SUSPENDED'
                      ? <Button size="sm" loading={busy} onClick={() => suspend(false)}>Reinstate</Button>
                      : <Button size="sm" variant="danger" onClick={() => setSuspending(true)}>Suspend…</Button>}
                  </div>
                )}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </Drawer>

      <Dialog open={suspending} onOpenChange={o => { if (!o) setSuspending(false); }}>
        {suspending && d && (
          <DialogContent title={`Suspend ${d.name}?`} description="They can’t sign in, and students can’t see or book them. Their courses stay up. You can reinstate them at any time.">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-navy">Why? <span className="font-normal text-muted">(kept in the Activity log, not sent to them)</span></span>
              <textarea rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: students reported missed classes three weeks running"
                className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
            </label>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setSuspending(false)}>Cancel</Button>
              <Button size="sm" variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => suspend(true)}>Suspend</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
