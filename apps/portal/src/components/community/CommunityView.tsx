'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { StudentCommunityHero } from '@/components/hero/StudentHeroes';

interface Person { id: string; name: string; avatarUrl: string | null; isTeacher: boolean }
interface Reply { id: string; body: string; createdAt: string; upvotes: number; myUpvote: boolean; author: Person }
interface Thread {
  id: string; body: string; createdAt: string; isPinned: boolean; mine: boolean;
  course: { id: string; title: string }; lesson: { id: string; title: string } | null; author: Person;
  upvotes: number; myUpvote: boolean; answered: boolean; teacherAnswer: Reply | null; replies: Reply[];
}
interface Feed {
  courses: { id: string; title: string }[]; courseId: string | null; show: string;
  counts: { all: number; unanswered: number; mine: number };
  threads: Thread[]; lessons: { id: string; title: string }[];
  stories: { id: string; story: string; name: string; submittedAt: string }[];
  myStories: { id: string; story: string; status: string; submittedAt: string }[];
}

const SHOW: [string, string][] = [['unanswered', 'Unanswered first'], ['recent', 'Newest'], ['top', 'Most votes'], ['mine', 'My questions']];
function ago(iso: string) {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d} day${d > 1 ? 's' : ''} ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const firstName = (n: string) => n.split(' ')[0];
const select = 'h-[34px] rounded-md border border-line bg-white px-2.5 text-[13px] text-navy';

export function CommunityView({ role }: { role: 'student' | 'teacher' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<'discussions' | 'stories'>('discussions');
  const [courseId, setCourseId] = useState(params.get('courseId') ?? '');
  const [show, setShow] = useState(role === 'teacher' ? 'unanswered' : 'unanswered');
  const [d, setD] = useState<Feed | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('thread'));
  const [asking, setAsking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { user } = useAuth();

  async function load() {
    const r = await api.get('/community/feed', { params: { courseId: courseId || undefined, show } });
    setD(r.data);
  }
  useEffect(() => { load().catch(() => notify.error('Could not load Community')); }, [courseId, show]); // eslint-disable-line react-hooks/exhaustive-deps

  async function vote(id: string) {
    try { await api.post(`/community/posts/${id}/upvote`); await load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not vote'); }
  }

  const open = d?.threads.find(t => t.id === openId) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Community" subtitle={role === 'teacher' ? 'Questions from students in your courses' : 'Ask questions about your courses and help each other'}
        actions={role === 'student' && <Button size="sm" onClick={() => setAsking(true)} disabled={!d?.courses.length}>Ask a question</Button>} />

      {role === 'student' && (
        <div className="px-4 pt-4 lg:px-7 lg:pt-6">
          <StudentCommunityHero threads={d?.threads ?? null} me={user?.id} onAsk={() => setAsking(true)} onOpen={setOpenId} />
        </div>
      )}
      <div id="discussions" className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
              {([['discussions', 'Discussions'], ['stories', 'Success stories']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('rounded-md px-3 py-1.5 text-navy', tab === k ? 'bg-accent-soft font-semibold' : 'font-medium hover:bg-subtle')}>{l}</button>
              ))}
            </div>
            <span className="flex-1" />
            {tab === 'discussions' && <>
              <label className={clsx(select, 'flex items-center gap-1')}>Course:
                <select value={courseId} onChange={e => { setCourseId(e.target.value); router.replace(e.target.value ? `?courseId=${e.target.value}` : '?'); }} className="max-w-[220px] bg-transparent font-semibold outline-none">
                  <option value="">All my courses</option>
                  {d?.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label className={clsx(select, 'flex items-center gap-1')}>Show:
                <select value={show} onChange={e => setShow(e.target.value)} className="bg-transparent font-semibold outline-none">
                  {SHOW.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </>}
          </div>

          {!d ? <div className="h-80 rounded-lg bg-subtle animate-pulse" /> : tab === 'stories' ? (
            <StoriesList d={d} role={role} onShare={() => setSharing(true)} />
          ) : !d.courses.length ? (
            <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">{role === 'teacher' ? 'You have no courses yet.' : 'Join a course to take part in its discussion.'}</p>
          ) : !d.threads.length ? (
            <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">No questions here yet.{role === 'student' && ' Be the first to ask.'}</p>
          ) : d.threads.map(t => (
            <article key={t.id} className={clsx('flex gap-3.5 rounded-lg border bg-white p-4', t.answered ? 'border-line' : 'border-azure')}>
              <button onClick={() => !t.mine && vote(t.id)} disabled={t.mine} title={t.mine ? 'Your question' : t.myUpvote ? 'Remove your vote' : 'Vote this up'}
                className={clsx('w-11 shrink-0 rounded-md py-1 text-center', !t.mine && 'hover:bg-subtle', t.myUpvote && 'bg-accent-soft')}>
                <p className="text-base font-extrabold text-navy">{t.upvotes}</p>
                <p className="text-[11px] text-muted">votes</p>
              </button>
              <button onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 text-left">
                <p className="text-[14.5px] font-[650] text-navy">{t.isPinned && <span className="mr-1.5 text-xs font-semibold text-azure-strong">Pinned ·</span>}{t.body.length > 180 ? t.body.slice(0, 180) + '…' : t.body}</p>
                <p className="mt-[3px] text-[12.5px] text-muted">
                  {t.mine ? 'You' : t.author.isTeacher ? `${t.author.name} (teacher)` : firstName(t.author.name)} · {courseId ? (t.lesson?.title ?? 'General') : t.course.title}{!courseId && t.lesson ? ` · ${t.lesson.title}` : ''} · {ago(t.createdAt)} · {t.replies.length} repl{t.replies.length === 1 ? 'y' : 'ies'}
                </p>
                {t.teacherAnswer && (
                  <p className="mt-2 rounded-md bg-subtle px-2.5 py-2 text-[13px] text-ink2"><strong className="text-navy">Teacher answer:</strong> {t.teacherAnswer.body.length > 200 ? t.teacherAnswer.body.slice(0, 200) + '…' : t.teacherAnswer.body}</p>
                )}
              </button>
              <span className={clsx('inline-flex h-6 items-center self-start whitespace-nowrap rounded px-2 text-xs font-semibold', t.answered ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                {t.author.isTeacher ? (t.mine ? 'Your post' : 'From your teacher') : t.answered ? 'Answered' : 'Unanswered'}
              </span>
            </article>
          ))}
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Success stories</h3>
            {(d?.stories ?? []).slice(0, 2).map(s => (
              <p key={s.id} className="text-[13px] text-ink2">“{s.story.length > 120 ? s.story.slice(0, 120) + '…' : s.story}” — {s.name}</p>
            ))}
            {d && !d.stories.length && <p className="text-[13px] text-muted">No stories published yet.</p>}
            {role === 'student'
              ? <button onClick={() => setSharing(true)} className="self-start text-[13px] font-semibold text-azure-strong hover:underline">Share your story</button>
              : <button onClick={() => setTab('stories')} className="self-start text-[13px] font-semibold text-azure-strong hover:underline">Read them all</button>}
          </section>
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">{role === 'teacher' ? 'Answering well' : 'Good questions get good answers'}</h3>
            <ul className="flex list-disc flex-col gap-[5px] pl-[18px] text-[13px] text-ink2">
              {(role === 'teacher'
                ? ['Answer the oldest unanswered first.', 'Point to the lesson or video moment.', 'Pin questions many students ask.']
                : ['Say which lesson or question you’re on.', 'Show what you tried.', 'Be kind — everyone is learning.']).map(x => <li key={x}>{x}</li>)}
            </ul>
          </section>
        </aside>
      </div>

      {open && <ThreadDrawer t={open} role={role} onClose={() => { setOpenId(null); }} onVote={vote} onChanged={load} />}
      {asking && d && <AskDialog d={d} courseId={courseId} onClose={() => setAsking(false)} onAsked={async id => { setAsking(false); setShow('recent'); await load(); setOpenId(id); }} />}
      {sharing && <ShareStoryDialog onClose={() => setSharing(false)} onShared={async () => { setSharing(false); await load(); setTab('stories'); }} />}
    </div>
  );
}

function StoriesList({ d, role, onShare }: { d: Feed; role: string; onShare: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      {role === 'student' && d.myStories.map(s => (
        <article key={s.id} className="rounded-lg border border-line bg-white p-4">
          <p className="text-[13.5px] text-ink2">“{s.story}”</p>
          <p className="mt-1.5 text-xs font-semibold text-muted">Your story · {s.status === 'APPROVED' ? 'Published' : s.status === 'REJECTED' ? 'Not published' : 'Waiting for review'}</p>
        </article>
      ))}
      {d.stories.map(s => (
        <article key={s.id} className="rounded-lg border border-line bg-white p-4">
          <p className="text-[14px] text-navy">“{s.story}”</p>
          <p className="mt-1.5 text-[12.5px] text-muted">— {s.name}</p>
        </article>
      ))}
      {!d.stories.length && !d.myStories.length && <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">No stories published yet.</p>}
      {role === 'student' && <div><Button size="sm" variant="secondary" onClick={onShare}>Share your story</Button></div>}
    </section>
  );
}

function ThreadDrawer({ t, role, onClose, onVote, onChanged }: { t: Thread; role: string; onClose: () => void; onVote: (id: string) => void; onChanged: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  async function reply() {
    if (body.trim().length < 5) { notify.error('Write at least 5 characters'); return; }
    setSending(true);
    try { await api.post('/community/posts', { courseId: t.course.id, parentId: t.id, body }); setBody(''); await onChanged(); notify.success('Reply posted'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not post'); } finally { setSending(false); }
  }
  async function pin() {
    try { await api.post(`/community/posts/${t.id}/pin`); await onChanged(); } catch { notify.error('Could not pin'); }
  }
  return (
    <Drawer open onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title="Question" description={`${t.mine ? 'You' : t.author.name} · ${t.course.title}${t.lesson ? ` · ${t.lesson.title}` : ''} · ${ago(t.createdAt)}`}
        action={role === 'teacher' ? <Button size="sm" variant="secondary" onClick={pin}>{t.isPinned ? 'Unpin' : 'Pin'}</Button> : undefined}
        footer={<>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={4000} placeholder={role === 'teacher' ? 'Write your answer…' : 'Add a reply…'}
            className="min-w-0 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
          <Button size="sm" onClick={reply} loading={sending}>{role === 'teacher' ? 'Answer' : 'Reply'}</Button>
        </>}>
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-navy">{t.body}</p>
        <DrawerSection title="Replies" count={t.replies.length}>
          {!t.replies.length ? <p className="text-[13px] text-muted">No replies yet.</p> : t.replies.map(r => (
            <div key={r.id} className={clsx('rounded-md border px-3 py-2.5', r.author.isTeacher ? 'border-azure bg-accent-soft' : 'border-line')}>
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <strong className="text-navy">{r.author.name}</strong>{r.author.isTeacher && <span className="font-semibold text-azure-strong">Teacher</span>}<span>· {ago(r.createdAt)}</span>
                <span className="flex-1" />
                <button onClick={() => onVote(r.id)} className={clsx('rounded px-1.5 font-semibold', r.myUpvote ? 'text-azure-strong' : 'hover:text-navy')}>▲ {r.upvotes}</button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-ink2">{r.body}</p>
            </div>
          ))}
        </DrawerSection>
      </DrawerContent>
    </Drawer>
  );
}

function AskDialog({ d, courseId, onClose, onAsked }: { d: Feed; courseId: string; onClose: () => void; onAsked: (id: string) => void }) {
  const [course, setCourse] = useState(courseId || d.courses[0]?.id || '');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>(courseId ? d.lessons : []);
  const [lessonId, setLessonId] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!course) return;
    api.get('/community/feed', { params: { courseId: course, show: 'recent' } }).then(r => setLessons(r.data.lessons ?? [])).catch(() => setLessons([]));
    setLessonId('');
  }, [course]);
  async function ask() {
    if (body.trim().length < 5) { notify.error('Write at least 5 characters'); return; }
    setSending(true);
    try { const r = await api.post('/community/posts', { courseId: course, lessonId: lessonId || undefined, body }); notify.success('Question posted', { description: 'Your teacher has been told' }); onAsked(r.data.id); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not post'); } finally { setSending(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Ask a question" description="Classmates and your teacher can answer.">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Course</span>
            <select value={course} onChange={e => setCourse(e.target.value)} className="input-base">{d.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Which lesson? (optional)</span>
            <select value={lessonId} onChange={e => setLessonId(e.target.value)} className="input-base"><option value="">General question</option>{lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Your question</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={4000} placeholder="Say what you’re stuck on and what you tried." className="input-base resize-none py-2" />
          </label>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={ask} loading={sending}>Post question</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareStoryDialog({ onClose, onShared }: { onClose: () => void; onShared: () => void }) {
  const [story, setStory] = useState('');
  const [consent, setConsent] = useState(true);
  const [sending, setSending] = useState(false);
  async function send() {
    if (story.trim().length < 20) { notify.error('Write at least 20 characters'); return; }
    setSending(true);
    try { await api.post('/community/success-stories', { story: story.trim(), consentToPublish: consent }); notify.success('Thank you!', { description: 'We’ll review it before it’s published.' }); onShared(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send'); } finally { setSending(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Share your story" description="How has CareerPath Africa helped you?">
        <textarea value={story} onChange={e => setStory(e.target.value)} rows={5} maxLength={2000} placeholder="I went from a D7 to a B3 in Core Maths…" className="input-base w-full resize-none py-2" />
        <label className="mt-3 flex items-center gap-2 text-[13px] text-navy"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> You may publish it with my first name</label>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={send} loading={sending}>Send story</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
