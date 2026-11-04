'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Drawer, DrawerContent } from '@/components/ui/Dialog';
import { CourseCover } from '@/components/courses/CourseCover';
import { ProfileHero, StatTiles, heroPrimary, heroSecondary } from '@/components/profile/ProfileHero';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Profile { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null; avatarUrl: string | null; bio: string | null; createdAt: string; country: { name: string } | null }
interface Course { id: string; title: string; progress?: number; thumbnailUrl?: string }
interface Programme { id: string; name: string; shortName: string | null; levels?: { id: string; name: string }[] }

const BADGES: Record<string, [string, string]> = {
  FIRST_LESSON: ['1', 'First lesson'], FIVE_LESSONS: ['5', '5 lessons'], TWENTY_LESSONS: ['20', '20 lessons'], FIRST_QUIZ_PASS: ['✓', 'First quiz passed'],
  QUIZ_PERFECT: ['★', 'Perfect quiz'], STREAK_7: ['7', '7-day streak'], STREAK_30: ['30', '30-day streak'], TOP_SCORER: ['▲', 'Top scorer'],
  COURSE_COMPLETE: ['■', 'Course finished'], FIRST_COURSE_COMPLETE: ['■', 'First course finished'], CERTIFICATE_FIRST: ['C', 'First certificate'],
};
const input = 'h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-navy outline-none focus:border-azure';

/** A student's profile: hero with photo and what they're working towards, real numbers, courses and badges */
export default function StudentProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [aim, setAim] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [certs, setCerts] = useState(0);
  const [streak, setStreak] = useState<{ now: number } | null>(null);
  const [best, setBest] = useState<{ value: number; since: number | null } | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get('/auth/me/profile').then(r => setP(r.data)).catch(() => notify.error('Could not load your profile'));
    Promise.all([api.get('/auth/me'), api.get('/catalogue/programmes')]).then(([me, pr]) => {
      const ids: string[] = me.data?.programmeInterestIds ?? [];
      const progs = (pr.data ?? []) as Programme[];
      const names = progs.filter(x => ids.includes(x.id)).map(x => x.shortName || x.name);
      const level = progs.flatMap(x => x.levels ?? []).find(l => l.id === me.data?.levelId)?.name;
      setAim(names.length ? `${names.join(', ')}${level ? ` · ${level}` : ''}` : null);
    }).catch(() => {});
    api.get('/portals/student/enrollments').then(r => setCourses(r.data ?? [])).catch(() => {});
    api.get('/certificates').then(r => setCerts((r.data ?? []).length)).catch(() => {});
    api.get('/portals/student/stats').then(r => setStreak({ now: r.data?.streak ?? 0 })).catch(() => {});
    api.get('/test-centre/progress').then(r => setBest(r.data?.tiles?.bestMock ?? null)).catch(() => {});
    api.get('/gamification/me').then(r => setBadges((r.data?.badges ?? []).map((b: { badge: string }) => b.badge))).catch(() => {});
  }, []);

  async function photo(f: File) {
    if (f.size > 5 * 1024 * 1024) { notify.error('Use a photo under 5 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const { data } = await api.post('/files/upload?folder=avatars', fd);
      const url = data?.url ?? data?.fileUrl;
      if (!url) throw new Error();
      await api.patch('/auth/me', { avatarUrl: url });
      setP(x => x ? { ...x, avatarUrl: url } : x); notify.success('Photo updated');
    } catch { notify.error('Could not upload the photo'); } finally { setUploading(false); }
  }


  const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || p.email : '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const going = courses.filter(c => (c.progress ?? 0) > 0 && (c.progress ?? 0) < 100).length;
  const joined = p ? new Date(p.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My profile" subtitle="What you’re working towards, and how far you’ve come" backHref="/student/dashboard" backLabel="Dashboard" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        {!p ? <div className="h-[230px] animate-pulse rounded-[14px] bg-[#3F6FE8]/70" /> : (
          <ProfileHero photo={p.avatarUrl} initials={initials} onPhoto={photo} uploading={uploading}
            kicker={['Student', p.country?.name, `joined ${joined}`].filter(Boolean).join(' · ')}
            l1={`${name}.`} l2={aim ? `${aim}.` : 'Learning on CareerPath.'}
            bio={p.bio} chips={aim ? aim.split(' · ')[0].split(', ') : []}
            actions={<>
              <button type="button" onClick={() => setEditing(true)} className={heroPrimary}>Edit profile</button>
              <Link href="/student/certificates" className={heroSecondary}>See my certificates</Link>
            </>} />
        )}

        <StatTiles tiles={[
          { l: 'Courses', v: String(courses.length), d: going ? `${going} in progress` : undefined },
          { l: 'Best mock score', v: best ? `${best.value}%` : '—', d: best?.since ? `${best.since > 0 ? '↑' : '↓'} ${Math.abs(best.since)} points` : best ? undefined : 'Take a mock exam' },
          { l: 'Study streak', v: streak ? `${streak.now} day${streak.now === 1 ? '' : 's'}` : '—', d: streak?.now ? 'Keep it going' : undefined },
          { l: 'Certificates', v: String(certs), d: certs ? 'Anyone can check them' : undefined },
        ]} />

        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="flex flex-col gap-1 rounded-[10px] border border-line bg-white p-[18px]">
            <div className="mb-1 flex items-center justify-between"><strong className="text-[15px] text-navy">Courses</strong><Link href="/student/courses" className="text-[13px] font-semibold text-azure-strong hover:underline">All my courses</Link></div>
            {!courses.length && <p className="py-4 text-[13.5px] text-ink2">No courses yet. <Link href="/student/catalogue" className="font-semibold text-azure-strong hover:underline">Browse the catalogue</Link></p>}
            {courses.slice(0, 6).map(c => (
              <Link key={c.id} href={`/student/courses/${c.id}`} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0 hover:bg-subtle">
                <CourseCover variant="tile" size="sm" course={{ title: c.title, coverUrl: c.thumbnailUrl }} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <strong className="truncate text-sm text-navy">{c.title}</strong>
                  <span className="h-1.5 rounded bg-subtle"><span className="block h-1.5 rounded bg-[#3F6FE8]" style={{ width: `${c.progress ?? 0}%` }} /></span>
                </span>
                <span className="w-[80px] text-right text-[12.5px] text-muted">{(c.progress ?? 0) >= 100 ? 'Finished' : `${c.progress ?? 0}% done`}</span>
              </Link>
            ))}
          </section>
          <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-[18px]">
            <strong className="text-[15px] text-navy">Badges</strong>
            {!badges.length && <p className="text-[13.5px] text-ink2">Finish a lesson to earn your first badge.</p>}
            <div className="flex flex-wrap gap-2">
              {badges.map((b, i) => {
                const [icon, label] = BADGES[b] ?? ['★', b.toLowerCase().replace(/_/g, ' ')];
                return <span key={b + i} className="inline-flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2 text-[13px] font-semibold text-navy"><span className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#3F6FE8] text-xs font-extrabold text-white">{icon}</span>{label}</span>;
              })}
            </div>
            <span className="text-[12.5px] text-muted">Only you, your teachers and your school see this page.</span>
          </section>
        </div>
      </div>

      {p && <EditProfile open={editing} onClose={() => setEditing(false)} p={p} onSaved={x => setP(prev => prev ? { ...prev, ...x } : prev)} />}
    </div>
  );
}

function EditProfile({ open, onClose, p, onSaved }: { open: boolean; onClose: () => void; p: Profile; onSaved: (x: Partial<Profile>) => void }) {
  const [f, setF] = useState({ firstName: p.firstName ?? '', lastName: p.lastName ?? '', bio: p.bio ?? '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setF({ firstName: p.firstName ?? '', lastName: p.lastName ?? '', bio: p.bio ?? '' }); }, [open, p]);
  async function save() {
    setSaving(true);
    try {
      const data = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), bio: f.bio.trim() };
      await api.patch('/auth/me', data);
      onSaved(data); notify.success('Profile saved'); onClose();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent title="Edit profile" description="What your teachers and school see"
        footer={<div className="flex gap-2"><button onClick={save} disabled={saving} className="h-10 rounded-md bg-[#3F6FE8] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button><button onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm text-navy">Cancel</button></div>}>
        <div className="flex flex-col gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">First name<input value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} maxLength={60} className={input} /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Last name<input value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} maxLength={60} className={input} /></label>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">About you
            <textarea value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} rows={4} maxLength={500} placeholder="Your school, what you’re aiming for…" className="rounded-lg border border-line px-3 py-2.5 text-sm text-navy outline-none focus:border-azure" /></label>
          <p className="text-xs text-muted">Phone, country and the exam you’re preparing for are in <Link href="/settings#profile" className="font-semibold text-azure-strong hover:underline">Settings</Link>.</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
