import { redirect } from 'next/navigation';

/** Decks are studied beside the deck list now. */
export default async function OldDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  redirect(`/student/flashcards?deck=${encodeURIComponent(deckId)}`);
}
