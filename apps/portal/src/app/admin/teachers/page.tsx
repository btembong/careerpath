'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { PageHero } from '@/components/hero/PageHero';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Flag } from '@/components/ui/Flag';
import { TeacherDrawer, money, initialsOf, type Money } from '@/components/admin-teachers/TeacherDrawer';
import { ApplicationsQueue, type Application } from '@/components/admin-teachers/ApplicationsQueue';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'APPROVED' | 'SUSPENDED';
interface Row {
  id: string; name: string; email: string; status: Status; avatarUrl: string | null; country: { code: string; name: string } | null;
  subjects: string[]; courses: number; published: number; students: number; rating: number | null; ratings: number; earned30d: Money[];
  checks: { photo: boolean; bio: boolean; video: boolean; agreement: boolean }; lastActive: string | null; joinedAt: string;
}
interface Overview {
  stats: {
    active: number; suspended: number; applications: number; students: number; courses: number; avgRating: number | null; ratings: number; paidThisMonth: Money[];
    countries: number; noCountry: number; signed: number; withPhoto: number; withCourses: number; teaching: number; complete: number; unassignedCourses: number;
  };
  teachers: Row[];
}
type Tab = 'APPROVED' | 'PENDING' | 'SUSPENDED' | 'REJECTED';
type Filter = 'all' | 'teaching' | 'courses' | 'nocourse' | 'never' | 'unsigned' | 'nophoto';
type Nudge = 'agreement' | 'welcome' | 'course' | 'photo';
type Sort = 'students' | 'courses' | 'seen' | 'newest' | 'name';

const realSubjects = (xs: string[]) => xs.filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));
const FILTERS: Record<Filter, { l: string; f: (r: Row) => boolean }> = {
  all: { l: 'All', f: () => true },
  teaching: { l: 'Teaching students', f: r => r.students > 0 },
  courses: { l: 'Has courses', f: r => r.courses > 0 },
  nocourse: { l: 'No course yet', f: r => r.courses === 0 },
  never: { l: 'Never signed in', f: r => !r.lastActive },
  unsigned: { l: 'Not signed agreement', f: r => !r.checks.agreement },
  nophoto: { l: 'No photo', f: r => !r.checks.photo },
};
const NUDGE: Record<Nudge, { title: string; what: string; button: string }> = {
  agreement: { title: 'Remind them to sign the agreement', what: 'They’re approved but can’t publish courses or take classes until they sign. The email links straight to the agreement.', button: 'Send the reminder' },
  welcome: { title: 'Resend the welcome email', what: 'They have an account from the website but have never opened the portal. The email tells them to sign in with their website email and password.', button: 'Send the welcome email' },
  course: { title: 'Ask them to build a first course', what: 'They’re approved and signed, with nothing built yet. The email opens the course builder.', button: 'Send the email' },
  photo: { title: 'Ask them to add a photo', what: 'Students see their initials. The email opens their profile, and mentions an intro video too.', button: 'Send the email' },
};
const seen = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function Avatar({ r, size = 'h-9 w-9' }: { r: { name: string; avatarUrl: string | null }; size?: string }) {
  return (
    <span className={clsx('flex flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-soft text-[12.5px] font-extrabold text-azure-strong', size)}>
      {r.avatarUrl ? <img src={r.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : initialsOf(r.name)}
    </span>
  );
}
function Checks({ c, only }: { c: Row['checks']; only?: (keyof Row['checks'])[] }) {
  const all: [keyof Row['checks'], string, string][] = [['photo', 'P', 'Photo'], ['bio', 'B', 'Bio'], ['video', 'V', 'Intro video'], ['agreement', 'A', 'Agreement signed']];
  return (
    <span className="flex gap-1">
      {all.filter(([k]) => !only || only.includes(k)).map(([k, l, t]) => (
        <span key={k} title={`${t}: ${c[k] ? 'yes' : 'no'}`} aria-label={`${t}: ${c[k] ? 'yes' : 'no'}`}
          className={clsx('flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-[10px] font-extrabold', c[k] ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-subtle text-[#B0B9CE]')}>{l}</span>
      ))}
    </span>
  );
}

export default function AdminTeachersPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [apps, setApps] = useState<Application[] | null>(null);
  const [tab, setTab] = useState<Tab>('APPROVED');
  const [filter, setFilter] = useState<Filter>('all');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState<Sort>('students');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [nudging, setNudging] = useState<{ kind: Nudge; ids: string[] } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', note: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [o, a] = await Promise.all([
      api.get('/portals/admin/teachers-overview').then(r => r.data as Overview).catch(() => null),
      api.get('/portals/admin/teacher-applications').then(r => r.data as Application[]).catch(() => [] as Application[]),
    ]);
    setOv(o); setApps(a);
  }
  useEffect(() => { load(); }, []);
  // Other pages link here with ?tab=applications or ?open=<id>
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('tab') === 'applications') setTab('PENDING');
    if (p.get('open')) setOpenId(p.get('open'));
  }, []);

  const s = ov?.stats;
  const rows = ov?.teachers ?? [];
  const active = rows.filter(r => r.status === 'APPROVED');
  const pending = (apps ?? []).filter(a => a.status === 'PENDING');
  const turnedDown = (apps ?? []).filter(a => a.status === 'REJECTED');
  const waiting = pending.filter(a => !a.questionAskedAt);
  const oldest = waiting[0] ?? null;

  // What needs a look, as lists you can act on
  const queues = useMemo(() => {
    const unsigned = active.filter(r => !r.checks.agreement);
    const never = active.filter(r => !r.lastActive);
    const noCourse = active.filter(r => r.courses === 0 && r.checks.agreement);
    const noPhoto = active.filter(r => !r.checks.photo);
    return { unsigned, never, noCourse, noPhoto, noVideo: active.filter(r => !r.checks.video).length };
  }, [ov]); // eslint-disable-line react-hooks/exhaustive-deps

  const countries = useMemo(() => [...new Map(rows.filter(r => r.country).map(r => [r.country!.code, r.country!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const match = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());
  const shown = rows.filter(r => r.status === tab && FILTERS[filter].f(r) && (!country || (country === '-' ? !r.country : r.country?.code === country)) && match(`${r.name} ${r.email} ${r.subjects.join(' ')}`))
    .sort((a, b) => sort === 'students' ? b.students - a.students || b.courses - a.courses
      : sort === 'courses' ? b.courses - a.courses
      : sort === 'seen' ? +new Date(b.lastActive ?? 0) - +new Date(a.lastActive ?? 0)
      : sort === 'newest' ? +new Date(b.joinedAt) - +new Date(a.joinedAt)
      : a.name.localeCompare(b.name));
  const appsShown = (tab === 'PENDING' ? pending : turnedDown).filter(a => match(`${a.name} ${a.email} ${a.subjects.join(' ')}`));

  async function sendNudge() {
    if (!nudging) return;
    setBusy(true);
    try {
      const r = await api.post('/portals/admin/teachers-nudge', nudging);
      notify.success(`Sent to ${r.data.sent} teacher${r.data.sent === 1 ? '' : 's'}`, r.data.skipped ? { description: `${r.data.skipped} couldn’t be sent` } : undefined);
      setNudging(null);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send it'); }
    finally { setBusy(false); }
  }
  async function sendInvite() {
    setBusy(true);
    try {
      await api.post('/portals/admin/teachers-invite', invite);
      notify.success('Invitation sent', { description: `${invite.email} gets a link to apply.` });
      setInviting(false); setInvite({ email: '', name: '', note: '' });
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send the invitation'); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    const head = ['Name', 'Email', 'Status', 'Country', 'Subjects', 'Courses', 'Published', 'Students', 'Rating', 'Ratings', 'Earned 30 days', 'Last seen', 'Photo', 'Bio', 'Intro video', 'Agreement'];
    const lines = rows.map(r => [r.name, r.email, r.status === 'APPROVED' ? 'Active' : 'Suspended', r.country?.name ?? '', realSubjects(r.subjects).join('; '), r.courses, r.published, r.students, r.rating ?? '', r.ratings,
      money(r.earned30d), r.lastActive ? new Date(r.lastActive).toISOString().slice(0, 10) : 'never', ...(['photo', 'bio', 'video', 'agreement'] as const).map(k => r.checks[k] ? 'yes' : 'no')].map(csvCell).join(','));
    const blob = new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `teachers-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const queueCard = (n: number, title: string, sub: string, action: string, onAction: () => void, onTitle?: () => void, warm?: boolean) => n > 0 && (
    <div key={title} className={clsx('flex min-w-[200px] flex-1 snap-start flex-col gap-1.5 rounded-lg border p-3.5', warm ? 'border-[#F1D9A6] bg-[#FFFBF0]' : 'border-line bg-white')}>
      <button type="button" onClick={onTitle ?? onAction} className="flex flex-col gap-1 text-left">
        <b className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-navy">{n}</b>
        <span className="text-[13.5px] font-extrabold text-navy">{title}</span>
      </button>
      <span className="text-[12.5px] leading-snug text-muted">{sub}</span>
      <button type="button" onClick={onAction} className="mt-auto pt-1 text-left text-[12.5px] font-extrabold text-azure-strong hover:underline">{action} →</button>
    </div>
  );
  const tabBtn = (k: Tab, l: string, count: React.ReactNode) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
      className={clsx('-mb-px flex h-[46px] items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-extrabold' : 'border-transparent font-semibold')}>{l}{count}</button>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Teachers" subtitle="Applications, active teachers and how they’re doing"
        actions={<>
          <button type="button" onClick={exportCsv} disabled={!ov} className="hidden h-9 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle sm:inline-flex">Export CSV</button>
          <button type="button" onClick={() => setInviting(true)} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Invite a teacher</button>
        </>} />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!s || !apps ? <div className="h-[230px] animate-pulse rounded-[14px] bg-[#3F6FE8]/30" /> : (
          <PageHero
            kicker={`Teachers · ${s.active} active · ${s.countries} ${s.countries === 1 ? 'country' : 'countries'}${s.noCountry ? ` · ${s.noCountry} without one` : ''}`}
            l1={waiting.length ? `${waiting.length} application${waiting.length === 1 ? '' : 's'} waiting.` : `${s.active} teachers on board.`}
            l2={waiting.length ? `${s.active} teachers on board.` : `${s.teaching} teaching students.`}
            sub={`${s.withCourses} have courses, ${s.teaching} ${s.teaching === 1 ? 'is' : 'are'} teaching students. ${s.complete} ${s.complete === 1 ? 'profile is' : 'profiles are'} complete${queues.noVideo > s.active / 2 ? '; most are missing an intro video' : ''}.`}
            chips={[
              { t: `${s.signed} signed the agreement` }, { t: `${s.withPhoto} with a photo` },
              { t: s.ratings ? `${s.ratings} rating${s.ratings === 1 ? '' : 's'} · ${s.avgRating} ★` : 'No ratings yet' },
              { t: s.paidThisMonth.length ? `${money(s.paidThisMonth)} paid this month` : 'Nothing paid this month' },
            ]}
            actions={waiting.length ? <button type="button" onClick={() => setTab('PENDING')} className="inline-flex h-10 items-center rounded-md bg-[#072061] px-4 text-sm font-bold text-[#FFFFFF] lg:hidden">Review applications · {waiting.length}</button> : undefined}
            asideClassName="hidden lg:flex"
            aside={oldest ? <>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">Waiting longest</p>
              <div className="flex items-center gap-3">
                <Avatar r={oldest} size="h-12 w-12 text-[16px]" />
                <span className="min-w-0"><b className="block truncate text-[15px]">{oldest.name}</b><span className="line-clamp-2 text-[12.5px] text-muted">{realSubjects(oldest.subjects).slice(0, 2).join(', ')} · applied {new Date(oldest.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-[5px] bg-[#FFF1D6] px-2 py-0.5 text-[11.5px] font-extrabold text-[#8A5A00]">{oldest.daysWaiting === 0 ? 'Today' : `${oldest.daysWaiting} day${oldest.daysWaiting === 1 ? '' : 's'} waiting`}</span>
                <span className={clsx('rounded-[5px] px-2 py-0.5 text-[11.5px] font-extrabold', oldest.cv ? 'bg-[#E3F5EA] text-[#17703A]' : 'bg-[#FDE8E8] text-[#B42318]')}>{oldest.cv ? 'CV attached' : 'No CV'}</span>
                {oldest.country && <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-[#EAF0FF] px-2 py-0.5 text-[11.5px] font-extrabold text-[#2F57C9]"><Flag code={oldest.country.code} />{oldest.country.name}</span>}
              </div>
              <button type="button" onClick={() => setTab('PENDING')} className="inline-flex h-9 items-center justify-center rounded-md bg-[#2F57C9] text-[13.5px] font-extrabold text-[#FFFFFF]">Review applications · {waiting.length}</button>
            </> : <>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">No applications waiting</p>
              <p className="text-[13.5px] text-ink2">New teacher applications land here. Know someone who should teach?</p>
              <button type="button" onClick={() => setInviting(true)} className="inline-flex h-9 items-center justify-center rounded-md bg-[#2F57C9] text-[13.5px] font-extrabold text-[#FFFFFF]">Invite a teacher</button>
            </>} />
        )}

        {s && apps && (waiting.length + queues.unsigned.length + queues.never.length + queues.noCourse.length + queues.noPhoto.length > 0) && (
          <section className="flex flex-col gap-2.5">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">Needs a look</p>
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
              {queueCard(waiting.length, `Application${waiting.length === 1 ? '' : 's'} waiting`, `Oldest ${oldest?.daysWaiting ?? 0} day${oldest?.daysWaiting === 1 ? '' : 's'}. ${waiting.filter(a => a.cv).length} sent a CV${waiting.some(a => !a.cv) ? `, ${waiting.filter(a => !a.cv).length} didn’t` : ''}.`, 'Review', () => setTab('PENDING'), undefined, true)}
              {queueCard(queues.unsigned.length, 'Haven’t signed the agreement', 'Approved, but can’t publish until they sign.', 'Send a reminder', () => setNudging({ kind: 'agreement', ids: queues.unsigned.map(r => r.id) }), () => { setTab('APPROVED'); setFilter('unsigned'); })}
              {queueCard(queues.never.length, 'Never signed in', 'They have an account but have never opened the portal.', 'Resend the welcome email', () => setNudging({ kind: 'welcome', ids: queues.never.map(r => r.id) }), () => { setTab('APPROVED'); setFilter('never'); })}
              {queueCard(queues.noCourse.length, 'No course yet', 'Approved and signed, nothing built.', 'Message them', () => setNudging({ kind: 'course', ids: queues.noCourse.map(r => r.id) }), () => { setTab('APPROVED'); setFilter('nocourse'); })}
              {queueCard(queues.noPhoto.length, 'No photo', `Students see initials. ${queues.noVideo} have no intro video.`, 'Ask for a photo', () => setNudging({ kind: 'photo', ids: queues.noPhoto.map(r => r.id) }), () => { setTab('APPROVED'); setFilter('nophoto'); })}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-x-2.5 border-b border-line px-4">
            <div role="tablist" aria-label="Teachers" className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
              {tabBtn('APPROVED', 'Active', <span className="font-medium text-muted">{s?.active ?? '…'}</span>)}
              {tabBtn('PENDING', 'Applications', pending.length ? <span className={clsx('rounded-[5px] px-1.5 py-0.5 text-[11px] font-extrabold', waiting.length ? 'bg-[#FFF1D6] text-[#8A5A00]' : 'bg-subtle text-ink2')}>{pending.length}</span> : <span className="font-medium text-muted">0</span>)}
              {tabBtn('SUSPENDED', 'Suspended', <span className="font-medium text-muted">{s?.suspended ?? '…'}</span>)}
              {tabBtn('REJECTED', 'Rejected', <span className="font-medium text-muted">{turnedDown.length}</span>)}
            </div>
            <input type="search" aria-label="Search teachers" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or subject" className="input-base my-2 h-[34px] w-full sm:w-64" />
          </div>

          {tab === 'PENDING' || tab === 'REJECTED' ? (
            !apps ? <div className="m-4 h-60 animate-pulse rounded-md bg-subtle" /> : <ApplicationsQueue key={tab} apps={appsShown} rejected={tab === 'REJECTED'} onChanged={load} />
          ) : <>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
              <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
                {(Object.keys(FILTERS) as Filter[]).map(k => {
                  const n = rows.filter(r => r.status === tab && FILTERS[k].f(r)).length;
                  if (k !== 'all' && !n) return null;
                  return <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                    className={clsx('h-[30px] flex-shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[12.5px] font-bold', filter === k ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line bg-white text-ink2 hover:text-navy')}>{FILTERS[k].l} {n}</button>;
                })}
              </div>
              <span className="flex-1" />
              <select aria-label="Country" value={country} onChange={e => setCountry(e.target.value)} className="h-[30px] rounded-md border border-line bg-white px-2 text-[12.5px] font-bold text-navy">
                <option value="">Country: any</option>
                {countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                {rows.some(r => !r.country) && <option value="-">No country set</option>}
              </select>
              <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className="h-[30px] rounded-md border border-line bg-white px-2 text-[12.5px] font-bold text-navy">
                <option value="students">Sort: most students</option><option value="courses">Sort: most courses</option><option value="seen">Sort: last seen</option><option value="newest">Sort: newest</option><option value="name">Sort: name</option>
              </select>
            </div>
            {!ov ? <div className="m-4 h-60 animate-pulse rounded-md bg-subtle" /> : !shown.length ? (
              <p className="px-4 py-12 text-center text-[13px] text-ink2">{tab === 'SUSPENDED' ? 'No suspended teachers.' : 'No teachers match.'}</p>
            ) : <>
              {/* Phone: rows */}
              <div className="flex flex-col gap-2 p-3 md:hidden">
                {shown.map(r => (
                  <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="flex items-center gap-3 rounded-lg border border-line bg-white p-3 text-left">
                    <Avatar r={r} size="h-12 w-12 text-[15px]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-navy"><span className="truncate">{r.name}</span><Flag code={r.country?.code} title={r.country?.name} /></span>
                      <span className="block truncate text-xs text-muted">{r.courses} course{r.courses === 1 ? '' : 's'} · {r.students} student{r.students === 1 ? '' : 's'}{r.rating ? ` · ${r.rating} ★` : ''}{!r.lastActive && <span className="font-bold text-[#B42318]"> · never signed in</span>}</span>
                    </span>
                    <Checks c={r.checks} only={['photo', 'video']} />
                  </button>
                ))}
              </div>
              {/* Wider: the table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] border-collapse text-[13px]">
                  <thead><tr>{['Teacher', 'Subjects', 'Courses', 'Students', 'Rating', 'Earned · 30 days', 'Last seen', 'Profile'].map((h, k) => <th key={h} className={clsx('whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted', k === 0 && 'pl-4')}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.map(r => {
                      const subj = realSubjects(r.subjects);
                      return (
                        <tr key={r.id} onClick={() => setOpenId(r.id)} className={clsx('cursor-pointer hover:bg-subtle', openId === r.id && 'bg-[#F7F9FF]')}>
                          <td className="border-b border-line py-2.5 pl-4 pr-3">
                            <span className="flex items-center gap-2.5">
                              <Avatar r={r} />
                              <span className="min-w-0"><span className="flex items-center gap-1.5 font-bold text-navy"><span className="truncate">{r.name}</span><Flag code={r.country?.code} title={r.country?.name} /></span><span className="block max-w-[230px] truncate text-xs text-muted">{r.email}</span></span>
                            </span>
                          </td>
                          <td className="max-w-[220px] border-b border-line px-3 py-2.5 text-ink2"><span className="line-clamp-2">{subj.slice(0, 2).join(', ') || '—'}{subj.length > 2 && <span className="text-[#9AA6C2]"> +{subj.length - 2}</span>}</span></td>
                          <td className={clsx('border-b border-line px-3 py-2.5', r.courses ? 'font-bold text-navy' : 'text-[#9AA6C2]')}>{r.published}{r.courses > r.published ? <span className="font-normal text-muted"> (+{r.courses - r.published})</span> : ''}</td>
                          <td className={clsx('border-b border-line px-3 py-2.5', r.students ? 'font-bold text-navy' : 'text-[#9AA6C2]')}>{r.students}</td>
                          <td className="border-b border-line px-3 py-2.5 text-navy">{r.rating ? <>{r.rating} ★ <span className="text-[#9AA6C2]">{r.ratings}</span></> : <span className="text-[#9AA6C2]">—</span>}</td>
                          <td className={clsx('border-b border-line px-3 py-2.5', r.earned30d.length ? 'text-navy' : 'text-[#9AA6C2]')}>{money(r.earned30d)}</td>
                          <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-navy">{seen(r.lastActive) ?? <span className="rounded-[5px] bg-[#FDE8E8] px-1.5 py-0.5 text-[11px] font-extrabold text-[#B42318]">Never</span>}</td>
                          <td className="border-b border-line px-3 py-2.5"><Checks c={r.checks} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>}
            {!!s?.unassignedCourses && tab === 'APPROVED' && (
              <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted"><b className="text-navy">{s.unassignedCourses} course{s.unassignedCourses === 1 ? ' has' : 's have'} no teacher</b> (they sit on the “CareerPath Africa” system account). <Link href="/admin/courses" className="font-extrabold text-azure-strong hover:underline">Assign them in Courses →</Link></p>
            )}
          </>}
        </section>
      </div>

      <TeacherDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />

      <Dialog open={!!nudging} onOpenChange={o => { if (!o) setNudging(null); }}>
        {nudging && (
          <DialogContent title={NUDGE[nudging.kind].title} description={`${nudging.ids.length} teacher${nudging.ids.length === 1 ? '' : 's'}, one email each, from CareerPath Teachers. Replies go to the teachers mailbox.`}>
            <p className="text-[13.5px] text-ink2">{NUDGE[nudging.kind].what}</p>
            <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {rows.filter(r => nudging.ids.includes(r.id)).map(r => <span key={r.id} className="rounded-[5px] bg-subtle px-2 py-0.5 text-xs font-semibold text-navy">{r.name}</span>)}
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setNudging(null)}>Cancel</Button>
              <Button size="sm" loading={busy} onClick={sendNudge}>{NUDGE[nudging.kind].button}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={inviting} onOpenChange={o => { if (!o) setInviting(false); }}>
        {inviting && (
          <DialogContent title="Invite a teacher" description="They get an email with a link to apply. Their application then lands in Applications for you to review.">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Email</span><input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} className="input-base" placeholder="name@example.com" /></label>
              <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Name <span className="font-normal text-muted">(optional)</span></span><input value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} className="input-base" /></label>
              <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">A note from you <span className="font-normal text-muted">(optional)</span></span><textarea rows={3} maxLength={600} value={invite.note} onChange={e => setInvite({ ...invite, note: e.target.value })} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" placeholder="We need a chemistry teacher for WASSCE in Ghana…" /></label>
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setInviting(false)}>Cancel</Button>
              <Button size="sm" loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())} onClick={sendInvite}>Send the invitation</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
