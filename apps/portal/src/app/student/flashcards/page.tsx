'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { FlashcardsHero } from '@/components/hero/PracticeHeroes';

interface Deck { id: string; title: string; course: { id: string; title: string }; cards: number; known: number; due: number; knownPct: number; isNew: boolean }
interface Overview { dueToday: number; dueDecks: number; minutes: number; streak: number; reviewedToday: number; decks: Deck[] }
interface Card { id: string; deckId: string; front: string; back: string; deck: string }
interface Session { title: string; course: string; cards: Card[] }

const GRADES: { d: number; label: string; next: string; key: string }[] = [
  { d: 3, label: 'Again', next: 'in 10 min', key: '1' },
  { d: 2, label: 'Hard', next: 'tomorrow', key: '2' },
  { d: 1, label: 'Easy', next: 'in 3 days or more', key: '3' },
];

export default function FlashcardsPage() {
  const params = useSearchParams();
  const [d, setD] = useState<Overview | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [tally, setTally] = useState({ easy: 0, hard: 0, again: 0 });

  const load = useCallback(() => api.get('/flashcards/overview').then(r => setD(r.data)).catch(() => notify.error('Could not load your flashcards')), []);
  useEffect(() => { load(); }, [load]);

  async function start(deckId?: string) {
    try {
      const r = await api.get('/flashcards/session', { params: { deckId } });
      if (!r.data.cards.length) { notify.success('Nothing due — come back tomorrow'); return; }
      setSession(r.data); setI(0); setShown(false); setTally({ easy: 0, hard: 0, again: 0 });
    } catch { notify.error('Could not start the review'); }
  }
  useEffect(() => { const deck = params.get('deck'); if (deck) start(deck); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const card = session?.cards[i] ?? null;
  const finished = !!session && i >= session.cards.length;

  const grade = useCallback(async (difficulty: number) => {
    if (!card) return;
    setTally(t => ({ easy: t.easy + (difficulty === 1 ? 1 : 0), hard: t.hard + (difficulty === 2 ? 1 : 0), again: t.again + (difficulty === 3 ? 1 : 0) }));
    setI(x => x + 1); setShown(false);
    try { await api.post(`/flashcards/decks/${card.deckId}/review`, { cardId: card.id, difficulty }); }
    catch { notify.error('That answer wasn’t saved'); }
  }, [card]);

  useEffect(() => {
    if (!session) return;
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'Escape') { setSession(null); load(); }
      else if (e.key === ' ' && card && !shown) { e.preventDefault(); setShown(true); }
      else if (shown && ['1', '2', '3'].includes(e.key)) grade(GRADES[Number(e.key) - 1].d);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, card, shown, grade, load]);

  function stop() { setSession(null); load(); }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Flashcards" subtitle="Short daily reviews so what you learn sticks" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="w-full">{d ? <FlashcardsHero d={d} onStart={start} /> : <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />}</div>
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {!d ? [0, 1, 2].map(k => <div key={k} className="h-32 rounded-lg bg-subtle animate-pulse" />) : !d.decks.length ? (
              <p className="col-span-full rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">Your courses don’t have flashcards yet. Teachers add them to lessons.</p>
            ) : d.decks.map(k => (
              <button key={k.id} onClick={() => start(k.id)} className={clsx('flex flex-col gap-2 rounded-lg border bg-white p-4 text-left hover:border-azure', session?.title === k.title ? 'border-azure' : 'border-line')}>
                <p className="text-[14.5px] font-bold text-navy">{k.title}</p>
                <p className="text-[12.5px] text-muted">{k.course.title} · {k.cards} card{k.cards === 1 ? '' : 's'}</p>
                <span className="h-1.5 rounded-full bg-subtle"><span className="block h-1.5 rounded-full bg-azure" style={{ width: `${k.knownPct}%` }} /></span>
                <p className="flex justify-between text-[12.5px]"><span className="text-muted">{k.isNew ? 'New' : `${k.knownPct}% known`}</span><strong className="text-navy">{k.isNew ? 'Start' : k.due ? `${k.due} due` : 'Up to date'}</strong></p>
              </button>
            ))}
          </div>
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          {!session ? (
            <div className="flex flex-col gap-2 py-6 text-center">
              <p className="text-[15px] font-semibold text-navy">Pick a deck to study</p>
              <p className="text-[13px] text-ink2">See the question, say the answer to yourself, then check. Cards you find hard come back sooner.</p>
            </div>
          ) : finished ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-lg font-extrabold text-navy">Done — {session.cards.length} card{session.cards.length === 1 ? '' : 's'}</p>
              <p className="text-[13px] text-ink2">{tally.easy} easy · {tally.hard} hard · {tally.again} to see again</p>
              <div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" onClick={stop}>Back to decks</Button></div>
            </div>
          ) : card && <>
            <p className="flex justify-between text-[12.5px] text-muted"><span>{card.deck} · card {i + 1} of {session.cards.length}</span><button onClick={stop} className="hover:text-navy">Esc to stop</button></p>
            <button onClick={() => setShown(true)} className="grid min-h-[170px] place-items-center rounded-lg border border-line bg-subtle p-5 text-center" aria-live="polite">
              <div>
                <p className="whitespace-pre-wrap text-[19px] font-bold text-navy">{card.front}</p>
                {shown ? <p className="mt-3.5 whitespace-pre-wrap text-sm text-ink2">{card.back}</p> : <p className="mt-3.5 text-[12.5px] text-muted">Tap or press Space to see the answer</p>}
              </div>
            </button>
            {shown && <>
              <p className="text-[13px] font-semibold text-navy">How well did you know it?</p>
              <div className="grid grid-cols-3 gap-2">
                {GRADES.map(g => (
                  <button key={g.d} onClick={() => grade(g.d)} className={clsx('flex flex-col items-center gap-0.5 rounded-md border p-2.5 text-[13.5px] text-navy hover:bg-subtle', g.d === 1 ? 'border-azure bg-accent-soft' : 'border-line')}>
                    <strong>{g.label}</strong><span className="text-[11.5px] text-muted">{g.next} · {g.key}</span>
                  </button>
                ))}
              </div>
            </>}
          </>}
        </aside>
      </div>
    </div>
  );
}
