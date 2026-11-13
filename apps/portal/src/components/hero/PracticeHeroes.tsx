'use client';
import Link from 'next/link';
import { clsx } from 'clsx';
import { PageHero, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';

/* ── Flashcards ───────────────────────────────────────────── */

interface Deck { id: string; title: string; course: { title: string }; cards: number; due: number; knownPct: number; isNew: boolean }

/** What to review today and how long it takes; decks with how well each is known */
export function FlashcardsHero({ d, onStart }: { d: { dueToday: number; dueDecks: number; minutes: number; streak: number; reviewedToday: number; decks: Deck[] }; onStart: (deckId?: string) => void }) {
  const fresh = d.decks.find(k => k.isNew);
  const decks = [...d.decks].sort((a, b) => b.due - a.due || a.knownPct - b.knownPct).slice(0, 4);
  return (
    <PageHero
      kicker={`Flashcards${d.streak ? ` · ${d.streak}-day review streak` : ''}${d.reviewedToday ? ` · ${d.reviewedToday} reviewed today` : ''}`}
      l1={d.dueToday ? <><span className="text-[#FFFFFF]">{d.dueToday} card{d.dueToday === 1 ? '' : 's'}</span></> : d.reviewedToday ? 'All done' : 'Nothing due'}
      l2={d.dueToday ? undefined : 'for today.'}
      sub={d.dueToday ? <>to review today, across {d.dueDecks} deck{d.dueDecks === 1 ? '' : 's'}: about {d.minutes} minute{d.minutes === 1 ? '' : 's'}. A few minutes a day is what makes it stick.</>
        : !d.decks.length ? 'Your courses don’t have flashcards yet. Teachers add them to lessons, and they show up here.'
        : fresh ? `Start a new deck, or come back tomorrow when cards are due again.` : 'Everything is up to date. Come back tomorrow.'}
      chips={d.dueToday ? [{ t: `About ${d.minutes} min`, strong: true }] : []}
      actions={<>
        {d.dueToday > 0 && <button type="button" onClick={() => onStart()} className={heroBtnDark}>Start today’s review</button>}
        {fresh && <button type="button" onClick={() => onStart(fresh.id)} className={d.dueToday ? heroBtnLine : heroBtn}>Start {fresh.title.length > 24 ? 'a new deck' : fresh.title}</button>}
      </>}
      aside={decks.length ? <>
        <p className={asideLabel}>Your decks</p>
        {decks.map(k => (
          <button key={k.id} type="button" onClick={() => onStart(k.id)} className="block text-left">
            <p className="flex justify-between gap-2 text-[13px] font-bold"><span className="truncate">{k.title}</span><span className={clsx('whitespace-nowrap', k.due ? 'text-[#8A5A0B]' : 'text-ink2')}>{k.isNew ? 'New' : k.due ? `${k.due} due` : `${k.knownPct}% known`}</span></p>
            <span className="mt-1 block h-1.5 rounded-[3px] bg-accent-soft"><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${k.knownPct}%` }} /></span>
            <span className="text-[11.5px] text-muted">{k.course.title.split(' · ')[0]} · {k.cards} card{k.cards === 1 ? '' : 's'}</span>
          </button>
        ))}
      </> : <>
        <p className={asideLabel}>How flashcards work</p>
        {[['A question on the front', 'Think of the answer, then turn it over'], ['Say how well you knew it', 'Cards you find hard come back sooner'], ['A few minutes a day', 'Short reviews keep it in your memory']].map(([t, s], i) => (
          <div key={t} className="flex items-start gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
            <span><span className="block text-[13.5px] font-bold">{t}</span><span className="block text-xs text-muted">{s}</span></span>
          </div>
        ))}
      </>}
    />
  );
}

/* ── Quiz history ─────────────────────────────────────────── */

interface Weak { questionId: string; text: string; misses: number; courseId: string | null; lessonId: string | null }

/** Your average and how it's moving, what's passed and being marked, and the questions you miss most */
export function QuizHistoryHero({ d }: { d: { stats: { taken: number; thisWeek: number; average: number | null; averageChange: number | null; passed: number; marking: number }; weak: Weak[]; trend: number[] } }) {
  const s = d.stats, w = d.weak[0];
  const practise = w?.courseId ? (w.lessonId ? `/student/learn/${w.courseId}/lesson/${w.lessonId}` : `/student/courses/${w.courseId}`) : '/student/tests';
  const t = d.trend.filter(n => n != null);
  const max = Math.max(100, ...t), min = Math.min(0, ...t);
  const pts = t.map((v, i) => `${Math.round((i * 200) / Math.max(1, t.length - 1))},${Math.round(56 - ((v - min) / (max - min || 1)) * 50)}`).join(' ');
  return (
    <PageHero
      kicker={`Quiz history · ${s.taken} quiz${s.taken === 1 ? '' : 'zes'} taken${s.thisWeek ? ` · ${s.thisWeek} this week` : ''}`}
      l1={s.average != null ? 'You’re averaging' : s.taken ? 'Your quizzes' : 'No quizzes'} l2={s.average != null ? `${s.average}% on quizzes.` : s.taken ? 'are being marked.' : 'yet.'}
      sub={s.taken ? <>You passed {s.passed} of {s.taken}{s.marking ? `, and ${s.marking} ${s.marking === 1 ? 'is' : 'are'} waiting for your teacher to mark` : ''}.{w ? ' The questions you miss most are on the right: practise those first.' : ''}</> : 'Quizzes at the end of lessons show up here with your score, so you can see what to practise next.'}
      chips={[...(s.averageChange != null && s.averageChange !== 0 ? [{ t: `${s.averageChange > 0 ? 'Up' : 'Down'} ${Math.abs(s.averageChange)}% this month`, strong: true }] : []), ...(s.marking ? [{ t: `${s.marking} being marked` }] : [])]}
      actions={<>
        {w ? <Link href={practise} className={heroBtnDark}>Practise what you missed</Link> : <Link href="/student/courses" className={heroBtn}>My courses</Link>}
        <Link href="/student/tests" className={heroBtnLine}>Test Centre</Link>
      </>}
      aside={t.length > 1 || d.weak.length ? <>
        {t.length > 1 && <>
          <p className={asideLabel}>Your scores, oldest to newest</p>
          <svg viewBox="0 0 200 60" preserveAspectRatio="none" role="img" aria-label={`Quiz scores from ${t[0]}% to ${t[t.length - 1]}%`} className="block h-[60px] w-full">
            <path d={`M0,60 L${pts.split(' ').join(' L')} L200,60 Z`} className="fill-accent-soft" />
            <polyline points={pts} fill="none" stroke="#3F6FE8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        </>}
        {d.weak.length > 0 && (
          <div className={clsx(t.length > 1 && 'border-t border-line pt-2.5')}>
            <p className={asideLabel}>Missed most</p>
            {d.weak.slice(0, 2).map(q => (
              <p key={q.questionId} className="mt-1.5 text-[13px] leading-snug"><span className="font-bold">“{q.text.length > 90 ? q.text.slice(0, 88) + '…' : q.text}”</span> <span className="text-xs text-muted">· missed {q.misses}×</span></p>
            ))}
          </div>
        )}
      </> : <>
        <p className={asideLabel}>How quizzes help</p>
        {[['A short quiz after each module', 'Usually 5 to 10 questions'], ['See what you got wrong', 'With the right answer and why'], ['Practise what you missed', 'Questions you miss come back here']].map(([t, s], i) => (
          <div key={t} className="flex items-start gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
            <span><span className="block text-[13.5px] font-bold">{t}</span><span className="block text-xs text-muted">{s}</span></span>
          </div>
        ))}
      </>}
    />
  );
}

/* ── Refer a friend ───────────────────────────────────────── */

/** Your link and code to share, and who has joined with it */
export function ReferralsHero({ code, link, joined, learning, friends, onCopy, whatsapp }: {
  code: string | null; link: string; joined: number; learning: number; friends: { name: string }[]; onCopy: () => void; whatsapp: string | undefined;
}) {
  return (
    <PageHero
      kicker={`Refer a friend${joined ? ` · ${joined} joined with your link` : ''}`}
      l1="Study with" l2="your friends."
      sub="Send your link to classmates preparing for the same exam. When they join, they’re linked to you: you can message each other and compete on the leaderboard."
      chips={joined ? [{ t: `${joined} joined`, strong: true }, { t: `${learning} now learning` }] : []}
      actions={<>
        <button type="button" onClick={onCopy} disabled={!code} className={clsx(heroBtn, 'disabled:opacity-60')}>Copy my link</button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={heroBtnLine}>Share on WhatsApp</a>
      </>}
      aside={<>
        <p className={asideLabel}>Your link</p>
        <input readOnly value={link || 'Loading your link…'} aria-label="Your link" onFocus={e => e.currentTarget.select()}
          className="h-10 w-full rounded-md border border-line bg-subtle px-3 text-[13px] text-navy outline-none" />
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 py-2.5">
          <span className="text-[12.5px] text-ink2">Or tell them your code</span>
          <strong className="text-lg tracking-[0.08em] text-navy">{code ?? '…'}</strong>
        </div>
        {friends.length > 0 && <p className="border-t border-line pt-2.5 text-xs text-muted">Latest: {friends.slice(0, 3).map(f => f.name.split(' ')[0]).join(', ')}{friends.length > 3 ? ` and ${friends.length - 3} more` : ''}</p>}
      </>}
    />
  );
}
