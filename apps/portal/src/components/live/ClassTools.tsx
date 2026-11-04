'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Poll { id: string; question: string; options: string[]; status: 'OPEN' | 'SHOWN'; answered: number; myVote: number | null; counts: number[] | null }
interface QuizResults { takers: number; questions: { n: number; text: string; answered: number; right: number }[] }
interface Quiz { id: string; questions: number; endsAt: string; running: boolean; results?: QuizResults; mySessionId?: string | null }
export interface ClassQuestion { id: string; body: string; answer: string | null; state: 'OPEN' | 'LIVE' | 'LATER' | 'ANSWERED'; who: string; mine: boolean; votes: number; voted: boolean }
interface Group { id: string; name: string; endsAt: string; members: string[] }
export interface ToolsState {
  status: string; leads: boolean; poll: Poll | null; quiz: Quiz | null; questions: ClassQuestion[];
  groups: Group[]; myGroup: { id: string; name: string; endsAt: string } | null;
}

const STATE: Record<ClassQuestion['state'], string> = { OPEN: 'Open', LIVE: 'Answered live', LATER: 'Teacher will answer after class', ANSWERED: 'Answered' };
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const input = 'h-[42px] w-full rounded-lg border border-line bg-white px-3 text-sm text-navy outline-none focus:border-azure';
const primary = 'h-10 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-bold text-white hover:bg-[#2F57C9] disabled:opacity-50';
const secondary = 'h-10 rounded-md border border-line bg-white px-3 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50';

function useCountdown(iso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!iso) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [iso]);
  if (!iso) return '';
  const s = Math.max(0, Math.round((+new Date(iso) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The panel beside the video: poll, quick quiz, questions and groups. The teacher runs them; students
 * answer. It refreshes every few seconds; `onState` lets the page react (a student's group room).
 */
export function ClassTools({ classId, onState }: { classId: string; onState?: (s: ToolsState) => void }) {
  const [s, setS] = useState<ToolsState | null>(null);
  const load = useCallback(() => {
    api.get<ToolsState>(`/live/classes/${classId}/tools`).then(r => { setS(r.data); onState?.(r.data); }).catch(() => {});
  }, [classId, onState]);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  if (!s) return <div className="h-64 animate-pulse rounded-[10px] bg-subtle" />;
  return s.leads ? <TeacherTools s={s} classId={classId} reload={load} /> : <StudentTools s={s} classId={classId} reload={load} />;
}

// ── Teacher ─────────────────────────────────────────────────

function TeacherTools({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const [tab, setTab] = useState<'poll' | 'quiz' | 'qa' | 'groups'>('poll');
  const open = s.questions.filter(q => q.state === 'OPEN').length;
  const tabs: [typeof tab, string][] = [['poll', 'Poll'], ['quiz', 'Quick quiz'], ['qa', `Q&A${open ? ` (${open})` : ''}`], ['groups', 'Groups']];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex flex-shrink-0 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={clsx('h-11 flex-1 border-b-2 text-[13px]', tab === k ? 'border-[#3F6FE8] font-bold text-navy' : 'border-transparent text-ink2')}>{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'poll' && <TeacherPoll s={s} classId={classId} reload={reload} />}
        {tab === 'quiz' && <TeacherQuiz s={s} classId={classId} reload={reload} />}
        {tab === 'qa' && <Questions s={s} classId={classId} reload={reload} />}
        {tab === 'groups' && <TeacherGroups s={s} classId={classId} reload={reload} />}
      </div>
    </div>
  );
}

function Bars({ options, counts, mine }: { options: string[]; counts: number[]; mine?: number | null }) {
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  return (
    <div className="flex flex-col gap-2">
      {options.map((o, i) => (
        <div key={i} className="flex flex-col gap-1 text-[13px] text-navy">
          <div className="flex justify-between"><span>{o}{mine === i ? ' · your answer' : ''}</span><strong>{counts[i] ?? 0}</strong></div>
          <span className="h-2 rounded bg-subtle"><span className="block h-2 rounded bg-[#3F6FE8]" style={{ width: `${Math.round(((counts[i] ?? 0) / total) * 100)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

function TeacherPoll({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try { await api.post(`/live/classes/${classId}/polls`, { question: q, options: opts.filter(o => o.trim()) }); setQ(''); setOpts(['', '']); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start the poll'); } finally { setBusy(false); }
  }
  async function set(status: string) {
    try { await api.patch(`/live/classes/${classId}/polls/${s.poll!.id}`, { status }); reload(); } catch { notify.error('Could not change the poll'); }
  }
  return (
    <div className="flex flex-col gap-3.5">
      {s.poll && (
        <section className="flex flex-col gap-2.5 rounded-lg border border-line p-3.5">
          <div className="flex items-start justify-between gap-2"><strong className="text-sm text-navy">{s.poll.question}</strong><span className="text-xs text-muted">{s.poll.answered} answered</span></div>
          <Bars options={s.poll.options} counts={s.poll.counts ?? []} />
          <div className="flex gap-2">
            {s.poll.status === 'OPEN' ? <button onClick={() => set('SHOWN')} className={primary}>Show results to class</button> : <span className="self-center text-xs font-semibold text-azure-strong">Results shown</span>}
            <button onClick={() => set('CLOSED')} className={secondary}>Close</button>
          </div>
          <span className="text-xs text-muted">Students don’t see each other’s answers. You can see who answered what afterwards.</span>
        </section>
      )}
      <section className="flex flex-col gap-2.5">
        <strong className="text-[13.5px] text-navy">{s.poll ? 'New poll (closes this one)' : 'New poll'}</strong>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Question<input value={q} onChange={e => setQ(e.target.value)} maxLength={300} className={input} placeholder="Which average fits this data best?" /></label>
        {opts.map((o, i) => (
          <label key={i} className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink2">Answer {i + 1}
            <input value={o} maxLength={120} onChange={e => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} className={input} /></label>
        ))}
        {opts.length < 6 && <button onClick={() => setOpts([...opts, ''])} className="self-start text-[13px] font-semibold text-azure-strong">+ Add an answer</button>}
        <button onClick={start} disabled={busy || !q.trim() || opts.filter(o => o.trim()).length < 2 || s.status !== 'ACTIVE'} className={primary}>Start poll</button>
      </section>
    </div>
  );
}

function TeacherQuiz({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const [courses, setCourses] = useState<{ id: string; title: string; questions: number }[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(60);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(s.quiz?.running ? s.quiz.endsAt : undefined);
  useEffect(() => { api.get(`/live/classes/${classId}/quiz/courses`).then(r => { setCourses(r.data); if (r.data[0]) setCourseId(r.data[0].id); }).catch(() => setCourses([])); }, [classId]);
  async function start() {
    setBusy(true);
    try { await api.post(`/live/classes/${classId}/quiz`, { courseId, count, secondsEach: secs }); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start the quiz'); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3.5">
      {s.quiz?.results && (
        <section className="flex flex-col gap-2 rounded-lg border border-line p-3.5">
          <div className="flex justify-between text-sm"><strong className="text-navy">{s.quiz.running ? `Quiz running · ${left} left` : 'Last quiz'}</strong><span className="text-muted">{s.quiz.results.takers} taking it</span></div>
          {s.quiz.results.questions.map(q => (
            <div key={q.n} className="flex gap-2.5 rounded-md border border-line px-3 py-2 text-[13px]">
              <strong className="text-azure-strong">{q.n}</strong><span className="min-w-0 flex-1 truncate text-navy" title={q.text}>{q.text}</span>
              <strong className="text-navy">{q.answered ? `${q.right}/${q.answered} right` : '—'}</strong>
            </div>
          ))}
          <span className="text-xs text-muted">Scores go into each student’s Test Centre history as practice.</span>
        </section>
      )}
      {!s.quiz?.running && (
        <section className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink2">A few multiple-choice questions from your question bank, answered by everyone at once.</span>
          {courses && !courses.length && <p className="rounded-md bg-subtle px-3 py-2 text-[13px] text-ink2">None of your courses has live multiple-choice questions yet.</p>}
          {!!courses?.length && <>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">From
              <select value={courseId} onChange={e => setCourseId(e.target.value)} className={input}>{courses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.questions})</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Questions<select value={count} onChange={e => setCount(+e.target.value)} className={input}>{[3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Each<select value={secs} onChange={e => setSecs(+e.target.value)} className={input}>{[30, 60, 90, 120].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label>
            </div>
            <button onClick={start} disabled={busy || !courseId || s.status !== 'ACTIVE'} className={primary}>Start the quiz</button>
          </>}
        </section>
      )}
    </div>
  );
}

function TeacherGroups({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const [size, setSize] = useState(4);
  const [mins, setMins] = useState(10);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(s.groups[0]?.endsAt);
  async function start() {
    setBusy(true);
    try { await api.post(`/live/classes/${classId}/groups`, { size, minutes: mins }); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not make groups'); } finally { setBusy(false); }
  }
  async function end() { try { await api.delete(`/live/classes/${classId}/groups`); reload(); } catch { notify.error('Could not end the groups'); } }
  async function dropIn(id: string) {
    try { const r = await api.post(`/live/classes/${classId}/groups/${id}/token`); window.open(`${r.data.roomUrl}?t=${r.data.token}`, '_blank', 'noopener'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not open the group'); }
  }
  if (s.groups.length) return (
    <div className="flex flex-col gap-2.5">
      <strong className="text-sm text-navy">{s.groups.length} groups · back in {left}</strong>
      {s.groups.map(g => (
        <div key={g.id} className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2.5">
          <span className="min-w-0 flex-1"><strong className="block text-[13.5px] text-navy">{g.name}</strong><span className="text-[12.5px] text-ink2">{g.members.join(', ')}</span></span>
          <button onClick={() => dropIn(g.id)} className="h-8 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-semibold text-navy">Drop in</button>
        </div>
      ))}
      <button onClick={end} className={secondary}>Bring everyone back now</button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] text-ink2">Students in the room now are split at random. Each group gets its own video room, and everyone comes back when time is up.</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Groups of<select value={size} onChange={e => setSize(+e.target.value)} className={input}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} students</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">For<select value={mins} onChange={e => setMins(+e.target.value)} className={input}>{[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
      </div>
      <button onClick={start} disabled={busy || s.status !== 'ACTIVE'} className={primary}>Send everyone to their group</button>
    </div>
  );
}

// ── Questions (both) ────────────────────────────────────────

export function Questions({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  async function ask() {
    try { await api.post(`/live/classes/${classId}/questions`, { body: text, anonymous: anon }); setText(''); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send your question'); }
  }
  async function vote(id: string) { try { await api.post(`/live/classes/${classId}/questions/${id}/vote`); reload(); } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not vote'); } }
  async function mark(id: string, state: string, a?: string) {
    try { await api.patch(`/live/classes/${classId}/questions/${id}`, { state, ...(a != null ? { answer: a } : {}) }); setWriting(null); setAnswer(''); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
  }
  return (
    <div className="flex flex-col gap-2.5">
      {!s.questions.length && <p className="text-[13px] text-muted">{s.leads ? 'Questions from students show here, most votes first.' : 'No questions yet. Ask one; others can vote it up.'}</p>}
      {s.questions.map(q => (
        <div key={q.id} className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{q.who}{q.mine ? ' (you)' : ''}</span>
            <button onClick={() => vote(q.id)} disabled={q.mine} aria-pressed={q.voted} aria-label={q.voted ? 'Take back your vote' : 'Vote this question up'}
              className={clsx('rounded px-1.5 py-0.5 font-bold', q.voted ? 'bg-accent-soft text-azure-strong' : 'text-ink2 hover:bg-subtle', q.mine && 'cursor-default opacity-60')}>▲ {q.votes}</button>
          </div>
          <p className="text-[13.5px] text-navy">{q.body}</p>
          {q.answer && <p className="rounded-md bg-subtle px-2.5 py-1.5 text-[13px] text-ink2">{q.answer}</p>}
          {q.state !== 'OPEN' && <span className="text-xs font-bold text-azure-strong">{STATE[q.state]}</span>}
          {s.leads && writing !== q.id && (
            <div className="flex flex-wrap gap-1.5">
              {q.state !== 'LIVE' && <button onClick={() => mark(q.id, 'LIVE')} className="h-8 rounded-md border border-line px-2.5 text-[12.5px] font-semibold text-navy hover:bg-subtle">Answered live</button>}
              {q.state === 'OPEN' && <button onClick={() => mark(q.id, 'LATER')} className="h-8 rounded-md border border-line px-2.5 text-[12.5px] font-semibold text-navy hover:bg-subtle">Answer after class</button>}
              <button onClick={() => { setWriting(q.id); setAnswer(q.answer ?? ''); }} className="h-8 rounded-md border border-line px-2.5 text-[12.5px] font-semibold text-navy hover:bg-subtle">{q.answer ? 'Edit answer' : 'Write an answer'}</button>
            </div>
          )}
          {s.leads && writing === q.id && (
            <div className="flex flex-col gap-1.5">
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={3} maxLength={2000} aria-label="Your answer" className="rounded-lg border border-line px-3 py-2 text-[13.5px] text-navy outline-none focus:border-azure" />
              <div className="flex gap-1.5"><button onClick={() => mark(q.id, 'ANSWERED', answer)} disabled={!answer.trim()} className="h-8 rounded-md bg-[#3F6FE8] px-3 text-[12.5px] font-bold text-white disabled:opacity-50">Save answer</button><button onClick={() => setWriting(null)} className="h-8 rounded-md border border-line px-3 text-[12.5px] text-navy">Cancel</button></div>
            </div>
          )}
        </div>
      ))}
      {!s.leads && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Ask a question
            <input value={text} onChange={e => setText(e.target.value)} maxLength={500} onKeyDown={e => { if (e.key === 'Enter' && text.trim().length >= 3) ask(); }} className={input} placeholder="Others can vote it up" /></label>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink2"><input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="h-4 w-4 accent-[#3F6FE8]" />Ask anonymously</label>
            <button onClick={ask} disabled={text.trim().length < 3} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-bold text-white disabled:opacity-50">Ask</button>
          </div>
          <span className="text-xs text-muted">Questions and answers stay on the class page afterwards.</span>
        </div>
      )}
    </div>
  );
}

// ── Student ─────────────────────────────────────────────────

function StudentTools({ s, classId, reload }: { s: ToolsState; classId: string; reload: () => void }) {
  const left = useCountdown(s.quiz?.running ? s.quiz.endsAt : undefined);
  async function vote(i: number) {
    try { await api.post(`/live/classes/${classId}/polls/${s.poll!.id}/vote`, { option: i }); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send your answer'); }
  }
  async function quiz() {
    try { const r = await api.post(`/live/classes/${classId}/quiz/${s.quiz!.id}/join`); window.open(`/student/tests/${r.data.id}`, '_blank', 'noopener'); reload(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not open the quiz'); }
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      {s.poll && (
        <section className="flex flex-col gap-2.5 rounded-lg border border-[#5889FA] bg-[#F5F8FF] p-3.5">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-azure-strong">Poll from your teacher</span>
          <strong className="text-[15px] text-navy">{s.poll.question}</strong>
          {s.poll.counts ? <Bars options={s.poll.options} counts={s.poll.counts} mine={s.poll.myVote} /> : (
            <div className="grid gap-2">
              {s.poll.options.map((o, i) => (
                <button key={i} onClick={() => vote(i)} aria-pressed={s.poll!.myVote === i}
                  className={clsx('min-h-[44px] rounded-lg px-3 text-left text-sm', s.poll!.myVote === i ? 'border-2 border-[#3F6FE8] bg-white font-bold text-navy' : 'border border-line bg-white text-navy hover:border-[#5889FA]')}>
                  {o}{s.poll!.myVote === i ? ' ✓' : ''}
                </button>
              ))}
              {s.poll.myVote !== null && <span className="text-xs text-muted">You can change your answer until the teacher shows the results.</span>}
            </div>
          )}
        </section>
      )}
      {s.quiz?.running && (
        <section className="flex items-center gap-3 rounded-lg border border-[#5889FA] bg-[#F5F8FF] p-3.5">
          <span className="min-w-0 flex-1"><strong className="block text-sm text-navy">Quick quiz · {s.quiz.questions} questions</strong><span className="text-[12.5px] text-ink2">{left} left · opens in a new tab</span></span>
          <button onClick={quiz} className={primary}>{s.quiz.mySessionId ? 'Back to the quiz' : 'Start'}</button>
        </section>
      )}
      <section className="flex min-h-0 flex-col gap-2">
        <strong className="text-[14px] text-navy">Questions</strong>
        <Questions s={s} classId={classId} reload={reload} />
      </section>
    </div>
  );
}
