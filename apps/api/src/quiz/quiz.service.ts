import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  // ── Question Bank ──────────────────────────────────────────

  /** Only the course's teacher and admins may see answers or change questions. */
  private async assertCourseStaff(user: { id: string; role: string }, courseId: string) {
    if (user.role === 'ADMIN') return;
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId !== user.id) throw new ForbiddenException('Not your course');
  }

  private async questionCourse(id: string) {
    const q = await this.prisma.questionBank.findUnique({ where: { id }, select: { courseId: true } });
    if (!q) throw new NotFoundException('Question not found');
    return q.courseId;
  }

  async listQuestions(user: { id: string; role: string }, courseId: string, lessonId?: string) {
    await this.assertCourseStaff(user, courseId);
    return this.prisma.questionBank.findMany({
      where: { courseId, ...(lessonId ? { lessonId } : {}) },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, questionText: true, type: true, difficulty: true, tags: true, imageUrl: true, options: true, points: true, sortOrder: true, createdAt: true },
    });
  }

  async createQuestion(user: { id: string; role: string }, courseId: string, dto: {
    questionText: string; type: string; lessonId?: string; difficulty?: string;
    tags?: string[]; imageUrl?: string; options?: any; correctAnswer: string;
    explanation?: string; points?: number;
  }) {
    await this.assertCourseStaff(user, courseId);
    return this.prisma.questionBank.create({
      data: {
        courseId, lessonId: dto.lessonId, questionText: dto.questionText,
        type: dto.type as any, difficulty: (dto.difficulty ?? 'MEDIUM') as any,
        tags: dto.tags ?? [], imageUrl: dto.imageUrl, options: dto.options,
        correctAnswer: dto.correctAnswer, explanation: dto.explanation, points: dto.points ?? 1,
      },
    });
  }

  async updateQuestion(user: { id: string; role: string }, id: string, dto: Partial<{
    questionText: string; type: string; difficulty: string; tags: string[];
    imageUrl: string; options: any; correctAnswer: string; explanation: string; points: number;
  }>) {
    await this.assertCourseStaff(user, await this.questionCourse(id));
    const { questionText, type, difficulty, tags, imageUrl, options, correctAnswer, explanation, points } = dto;
    return this.prisma.questionBank.update({ where: { id }, data: { questionText, type, difficulty, tags, imageUrl, options, correctAnswer, explanation, points } as any });
  }

  async deleteQuestion(user: { id: string; role: string }, id: string) {
    await this.assertCourseStaff(user, await this.questionCourse(id));
    await this.prisma.questionBank.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Quiz Attempt ──────────────────────────────────────────

  async startAttempt(studentId: string, courseId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.type !== 'QUIZ') throw new NotFoundException('Quiz lesson not found');

    // Check max attempts
    if (lesson.maxAttempts > 0) {
      const count = await this.prisma.quizAttempt.count({ where: { studentId, lessonId } });
      if (count >= lesson.maxAttempts) throw new ForbiddenException('Max attempts reached');
    }

    // Fetch questions (strip correctAnswer)
    let questions = await this.prisma.questionBank.findMany({
      where: { lessonId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, questionText: true, type: true, imageUrl: true, options: true, points: true },
    });
    if (lesson.shuffleQuestions) questions = this.shuffle(questions);

    return { lessonId, questions, timeLimitSecs: lesson.timeLimitSecs };
  }

  async submitAttempt(studentId: string, dto: {
    courseId: string; lessonId: string; answers: Record<string, any>; timeTakenSecs?: number;
  }) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: dto.lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const questions = await this.prisma.questionBank.findMany({ where: { lessonId: dto.lessonId } });
    const maxScore = questions.reduce((s, q) => s + q.points, 0);

    let autoScore = 0;
    const answerRows: { questionId: string; answer: any; isCorrect: boolean; score: number }[] = [];

    for (const q of questions) {
      const given = dto.answers[q.id];
      const isCorrect = this.checkAnswer(q.type, given, q.correctAnswer, q.options as any);
      const score = isCorrect ? q.points : 0;
      autoScore += score;
      answerRows.push({ questionId: q.id, answer: given, isCorrect, score });
    }

    const finalScore = autoScore;
    const passed = lesson.passMark ? (finalScore / maxScore) * 100 >= lesson.passMark : true;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        studentId, courseId: dto.courseId, lessonId: dto.lessonId,
        autoScore, finalScore, maxScore, passed,
        isFullyGraded: !questions.some(q => q.type === 'SHORT_ANSWER' || q.type === 'WRITTEN'),
        answersJson: dto.answers, timeTakenSecs: dto.timeTakenSecs,
        answers: { create: answerRows.map(a => ({ questionId: a.questionId, answer: a.answer, isCorrect: a.isCorrect, score: a.score })) },
      },
      include: { answers: true },
    });

    // Return with explanations revealed
    const withExplanations = attempt.answers.map(a => {
      const q = questions.find(q => q.id === a.questionId)!;
      return { ...a, explanation: q.explanation, correctAnswer: q.correctAnswer };
    });

    return { ...attempt, answers: withExplanations, percentage: Math.round((finalScore / maxScore) * 100) };
  }

  async getAttemptHistory(studentId: string, lessonId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { studentId, lessonId },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, finalScore: true, maxScore: true, passed: true, submittedAt: true, timeTakenSecs: true },
    });
  }

  async getQuizAnalytics(lessonId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { lessonId },
      include: { answers: true },
    });
    if (!attempts.length) return { total: 0, passRate: 0, avgScore: 0, questionStats: [] };

    const total = attempts.length;
    const passed = attempts.filter(a => a.passed).length;
    const avgScore = attempts.reduce((s, a) => s + (a.maxScore > 0 ? a.finalScore / a.maxScore : 0), 0) / total;

    const qMap = new Map<string, { total: number; correct: number }>();
    for (const att of attempts) {
      for (const ans of att.answers) {
        const e = qMap.get(ans.questionId) ?? { total: 0, correct: 0 };
        e.total++;
        if (ans.isCorrect) e.correct++;
        qMap.set(ans.questionId, e);
      }
    }

    const questionStats = Array.from(qMap.entries()).map(([qId, s]) => ({
      questionId: qId, total: s.total, correctRate: Math.round((s.correct / s.total) * 100),
    }));

    return { total, passRate: Math.round((passed / total) * 100), avgScore: Math.round(avgScore * 100), questionStats };
  }

  private checkAnswer(type: string, given: any, correct: string, options: any[]): boolean {
    if (!given) return false;
    if (type === 'MCQ' || type === 'TRUE_FALSE') return String(given).trim().toLowerCase() === correct.trim().toLowerCase();
    if (type === 'FILL_BLANK') return String(given).trim().toLowerCase() === correct.trim().toLowerCase();
    if (type === 'SHORT_ANSWER' || type === 'WRITTEN') return false; // requires manual/AI grading
    return false;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
