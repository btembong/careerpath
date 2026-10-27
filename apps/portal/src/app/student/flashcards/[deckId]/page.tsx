'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { notify } from '@/lib/notify';

interface Card {
  id: string;
  front: string;
  back: string;
  nextReviewAt?: string;
}

type Phase = 'loading' | 'study' | 'done';

export default function FlashcardPlayerPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/flashcards/decks/${deckId}/cards`)
      .then(r => {
        const due = (r.data ?? []).filter((c: Card) => !c.nextReviewAt || new Date(c.nextReviewAt) <= new Date());
        setCards(due.length ? due : r.data ?? []);
        setPhase('study');
      })
      .catch(() => { notify.error('Could not load deck'); router.back(); });
  }, [deckId]);

  async function rate(difficulty: 1 | 2 | 3) {
    if (submitting) return;
    const card = cards[index];
    setSubmitting(true);
    try {
      await api.post(`/flashcards/decks/${deckId}/review`, { cardId: card.id, difficulty });
    } catch {}
    finally { setSubmitting(false); }

    if (index + 1 >= cards.length) {
      setPhase('done');
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-cloud p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-navy mb-2">Session complete!</h2>
          <p className="text-sm text-muted mb-6">You reviewed {cards.length} card{cards.length !== 1 ? 's' : ''}. Come back tomorrow for your next session.</p>
          <button onClick={() => router.back()}
            className="w-full py-3 rounded-xl bg-azure text-white font-semibold text-sm hover:bg-royal transition">
            Back to Decks
          </button>
        </div>
      </div>
    );
  }

  const card = cards[index];
  const progress = ((index) / cards.length) * 100;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-cloud">
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-navy transition">← Exit</button>
        <span className="text-sm font-semibold text-muted">{index + 1} / {cards.length}</span>
        <div className="w-16 h-1.5 bg-cloud rounded-full overflow-hidden">
          <div className="h-full bg-azure rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div
          className="w-full max-w-md bg-white rounded-3xl border-2 border-cloud shadow-sm cursor-pointer select-none"
          style={{ minHeight: 240, perspective: 1000 }}
          onClick={() => setFlipped(f => !f)}
        >
          <div className="flex flex-col items-center justify-center h-full p-8 min-h-[240px]">
            {!flipped ? (
              <>
                <span className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Question</span>
                <p className="text-lg font-semibold text-navy text-center leading-relaxed">{card.front}</p>
                <p className="text-xs text-muted mt-6">Tap to reveal answer</p>
              </>
            ) : (
              <>
                <span className="text-[10px] font-bold uppercase tracking-widest text-green-500 mb-4">Answer</span>
                <p className="text-lg font-semibold text-navy text-center leading-relaxed">{card.back}</p>
              </>
            )}
          </div>
        </div>

        {/* Rating buttons — only show after flip */}
        {flipped && (
          <div className="flex gap-3 mt-8 w-full max-w-md">
            <button onClick={() => rate(3)} disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-red-100 text-red-600 font-semibold text-sm hover:bg-red-200 transition disabled:opacity-50">
              Again
            </button>
            <button onClick={() => rate(2)} disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-amber-100 text-amber-700 font-semibold text-sm hover:bg-amber-200 transition disabled:opacity-50">
              Hard
            </button>
            <button onClick={() => rate(1)} disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-green-100 text-green-700 font-semibold text-sm hover:bg-green-200 transition disabled:opacity-50">
              Easy
            </button>
          </div>
        )}

        {!flipped && (
          <p className="text-xs text-muted mt-6">Rate your confidence after seeing the answer</p>
        )}
      </div>
    </div>
  );
}
