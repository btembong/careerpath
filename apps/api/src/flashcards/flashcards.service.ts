import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { studentCourseIds } from '../prisma/student-courses';
import { GamificationService } from '../gamification/gamification.service';

const MIN = 60_000;
const DAY = 86_400_000;
/** 1 = easy, 2 = hard, 3 = again */
const GRADES = [1, 2, 3];

@Injectable()
export class FlashcardsService {
  private ai: Anthropic;
  constructor(private prisma: PrismaService, private gamification: GamificationService) {
    this.ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  /** Students see decks for courses they can open; teachers their own courses; admins everything. */
  private async visibleCourseIds(user: UserProfile): Promise<string[] | null> {
    const role = user.role as UserRole;
    if (role === UserRole.ADMIN) return null;
    if (role === UserRole.STUDENT) return studentCourseIds(this.prisma, user.id);
    const own = await this.prisma.platformCourse.findMany({ where: { teacherId: user.id }, select: { id: true } });
    return own.map(c => c.id);
  }

  private async deckFor(user: UserProfile, deckId: string) {
    const deck = await this.prisma.flashcardDeck.findUnique({ where: { id: deckId }, include: { cards: { orderBy: { order: 'asc' } }, course: { select: { title: true } } } });
    if (!deck) throw new NotFoundException('Deck not found');
    const ids = await this.visibleCourseIds(user);
    if (ids && !ids.includes(deck.courseId)) throw new ForbiddenException('This deck is in a course you don’t have');
    return deck;
  }

  /** Latest review per card for this student */
  private async latest(studentId: string, deckIds: string[]) {
    const reviews = await this.prisma.flashcardReview.findMany({ where: { studentId, deckId: { in: deckIds } }, orderBy: { reviewedAt: 'desc' } });
    const map = new Map<string, (typeof reviews)[number]>();
    for (const r of reviews) if (!map.has(r.cardId)) map.set(r.cardId, r);
    return { map, reviews };
  }

  async listDecks(user: UserProfile, courseId?: string) {
    const ids = await this.visibleCourseIds(user);
    return this.prisma.flashcardDeck.findMany({
      where: { ...(ids && { courseId: { in: ids } }), ...(courseId && { courseId }) },
      include: { _count: { select: { cards: true } }, course: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The Flashcards page: each deck with how much is known and due, today's total, and the review streak. */
  async overview(user: UserProfile) {
    const ids = await this.visibleCourseIds(user);
    const decks = await this.prisma.flashcardDeck.findMany({
      where: ids ? { courseId: { in: ids } } : {},
      include: { cards: { select: { id: true } }, course: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const { map, reviews } = await this.latest(user.id, decks.map(d => d.id));
    const now = Date.now();
    const rows = decks.map(d => {
      const states = d.cards.map(c => map.get(c.id));
      const seen = states.filter(Boolean).length;
      const known = states.filter(r => r && r.difficulty === 1).length;
      const due = states.filter(r => !r || r.nextReviewAt.getTime() <= now).length;
      return {
        id: d.id, title: d.title, aiGenerated: d.aiGenerated, course: d.course,
        cards: d.cards.length, seen, known, due, knownPct: d.cards.length ? Math.round((known / d.cards.length) * 100) : 0,
        isNew: seen === 0,
      };
    }).sort((a, b) => Number(a.isNew) - Number(b.isNew) || b.due - a.due);

    // Days in a row (ending today or yesterday) with at least one review
    const days = new Set(reviews.map(r => new Date(r.reviewedAt).toDateString()));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toDateString())) { streak++; cursor.setDate(cursor.getDate() - 1); }

    const dueStarted = rows.filter(r => !r.isNew).reduce((n, r) => n + r.due, 0);
    return {
      dueToday: dueStarted, dueDecks: rows.filter(r => !r.isNew && r.due > 0).length,
      minutes: Math.max(1, Math.round(dueStarted * 20 / 60)), streak, reviewedToday: reviews.filter(r => now - r.reviewedAt.getTime() < DAY && new Date(r.reviewedAt).toDateString() === new Date().toDateString()).length,
      decks: rows,
    };
  }

  /** Cards to study: one deck (all its due cards, or all cards if none due), or due cards across every started deck. */
  async session(user: UserProfile, deckId?: string) {
    if (deckId) {
      const deck = await this.deckFor(user, deckId);
      const { map } = await this.latest(user.id, [deck.id]);
      const now = Date.now();
      const due = deck.cards.filter(c => { const r = map.get(c.id); return !r || r.nextReviewAt.getTime() <= now; });
      const cards = (due.length ? due : deck.cards).map(c => ({ id: c.id, deckId: deck.id, front: c.front, back: c.back, deck: deck.title }));
      return { title: deck.title, course: deck.course.title, cards };
    }
    const ov = await this.overview(user);
    const started = ov.decks.filter(d => !d.isNew && d.due > 0).map(d => d.id);
    const decks = await this.prisma.flashcardDeck.findMany({ where: { id: { in: started } }, include: { cards: { orderBy: { order: 'asc' } } } });
    const { map } = await this.latest(user.id, started);
    const now = Date.now();
    const cards = decks.flatMap(d => d.cards.filter(c => { const r = map.get(c.id); return !r || r.nextReviewAt.getTime() <= now; })
      .map(c => ({ id: c.id, deckId: d.id, front: c.front, back: c.back, deck: d.title }))).slice(0, 60);
    return { title: 'Today’s review', course: `${started.length} deck${started.length === 1 ? '' : 's'}`, cards };
  }

  async getDeckCards(user: UserProfile, deckId: string) {
    const deck = await this.deckFor(user, deckId);
    const { map } = await this.latest(user.id, [deck.id]);
    return deck.cards.map(c => ({ ...c, nextReviewAt: map.get(c.id)?.nextReviewAt ?? null, lastDifficulty: map.get(c.id)?.difficulty ?? null }));
  }

  /** again = 10 min, hard = 1 day, easy = 3 days and then double each time it stays easy */
  async submitReview(user: UserProfile, deckId: string, cardId: string, difficulty: number) {
    if (!GRADES.includes(difficulty)) throw new BadRequestException('difficulty must be 1 (easy), 2 (hard) or 3 (again)');
    const deck = await this.deckFor(user, deckId);
    if (!deck.cards.some(c => c.id === cardId)) throw new NotFoundException('Card not in this deck');
    const prev = await this.prisma.flashcardReview.findFirst({ where: { studentId: user.id, cardId }, orderBy: { reviewedAt: 'desc' } });
    let ms = difficulty === 3 ? 10 * MIN : difficulty === 2 ? DAY : 3 * DAY;
    if (difficulty === 1 && prev?.difficulty === 1) {
      const lastGap = prev.nextReviewAt.getTime() - prev.reviewedAt.getTime();
      ms = Math.min(60 * DAY, Math.max(ms, lastGap * 2));
    }
    const review = await this.prisma.flashcardReview.create({ data: { deckId, studentId: user.id, cardId, difficulty, nextReviewAt: new Date(Date.now() + ms) } });
    // Points once per card per day, so a session can't be farmed
    await this.gamification.awardOnce(user.id, 'FLASHCARD_REVIEW', `card:${cardId}:${new Date().toDateString()}`);
    return { nextReviewAt: review.nextReviewAt, inMinutes: Math.round(ms / MIN) };
  }

  private async assertCourseStaff(user: UserProfile, courseId: string) {
    if ((user.role as UserRole) === UserRole.ADMIN) return;
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId !== user.id) throw new ForbiddenException('Only the course’s teacher can add decks');
  }

  async createDeck(user: UserProfile, courseId: string, dto: { title: string; lessonId?: string; cards: { front: string; back: string }[] }) {
    await this.assertCourseStaff(user, courseId);
    const cards = (dto.cards ?? []).filter(c => c.front?.trim() && c.back?.trim());
    if (!dto.title?.trim() || !cards.length) throw new BadRequestException('A deck needs a title and at least one card');
    return this.prisma.flashcardDeck.create({
      data: {
        courseId, lessonId: dto.lessonId, title: dto.title.trim(),
        cards: { create: cards.map((c, i) => ({ front: c.front.trim(), back: c.back.trim(), order: i })) },
      },
      include: { cards: true },
    });
  }

  async aiGenerateDeck(user: UserProfile, courseId: string, lessonId: string) {
    await this.assertCourseStaff(user, courseId);
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { courseId } }, select: { title: true, content: true } });
    if (!lesson) throw new NotFoundException('Lesson not found in this course');

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
