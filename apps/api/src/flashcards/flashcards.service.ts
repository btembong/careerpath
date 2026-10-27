import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class FlashcardsService {
  private ai: Anthropic;
  constructor(private prisma: PrismaService) {
    this.ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async listDecks(courseId?: string) {
    return this.prisma.flashcardDeck.findMany({
      where: courseId ? { courseId } : {},
      include: { _count: { select: { cards: true } }, course: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeckCards(deckId: string, studentId: string) {
    const deck = await this.prisma.flashcardDeck.findUnique({ where: { id: deckId }, include: { cards: { orderBy: { order: 'asc' } } } });
    if (!deck) throw new NotFoundException('Deck not found');

    // Attach next review date per card for this student
    const reviews = await this.prisma.flashcardReview.findMany({
      where: { deckId, studentId },
      orderBy: { reviewedAt: 'desc' },
    });
    const reviewMap = new Map(reviews.map(r => [r.cardId, r]));

    return deck.cards.map(c => ({
      ...c,
      nextReviewAt: reviewMap.get(c.id)?.nextReviewAt ?? null,
      lastDifficulty: reviewMap.get(c.id)?.difficulty ?? null,
    }));
  }

  async submitReview(deckId: string, studentId: string, cardId: string, difficulty: number) {
    // Spaced repetition intervals: easy=3d, hard=1d, again=10min
    const intervals: Record<number, number> = { 1: 3 * 24 * 60, 2: 24 * 60, 3: 10 };
    const mins = intervals[difficulty] ?? 1440;
    const nextReviewAt = new Date(Date.now() + mins * 60 * 1000);

    return this.prisma.flashcardReview.create({
      data: { deckId, studentId, cardId, difficulty, nextReviewAt },
    });
  }

  async createDeck(courseId: string, dto: { title: string; lessonId?: string; cards: { front: string; back: string }[] }) {
    return this.prisma.flashcardDeck.create({
      data: {
        courseId, lessonId: dto.lessonId, title: dto.title,
        cards: { create: dto.cards.map((c, i) => ({ front: c.front, back: c.back, order: i })) },
      },
      include: { cards: true },
    });
  }

  async aiGenerateDeck(courseId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true, content: true } });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const msg = await this.ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Generate 10 flashcards from this lesson. Return JSON array: [{"front":"question","back":"answer"}]\n\nLesson: ${lesson.title}\n\n${lesson.content ?? ''}`,
      }],
    });

    const raw = (msg.content[0] as any).text as string;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI did not return valid JSON');
    const cards: { front: string; back: string }[] = JSON.parse(jsonMatch[0]);

    return this.prisma.flashcardDeck.create({
      data: {
        courseId, lessonId, title: `${lesson.title} — Flashcards`, aiGenerated: true,
        cards: { create: cards.map((c, i) => ({ front: c.front, back: c.back, order: i })) },
      },
      include: { cards: true },
    });
  }
}
