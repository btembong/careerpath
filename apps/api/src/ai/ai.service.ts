import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiService {
  private ai: Anthropic;
  constructor(private prisma: PrismaService) {
    this.ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── Study Assistant ───────────────────────────────────────
  async studyAssistant(courseId: string, lessonId: string | undefined, question: string) {
    // Build context from lesson content
    let context = '';
    if (lessonId) {
      const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true, content: true } });
      if (lesson) context = `Lesson: "${lesson.title}"\n\n${lesson.content ?? ''}`;
    } else {
      const course = await this.prisma.platformCourse.findUnique({
        where: { id: courseId },
        select: { title: true, description: true, shortDescription: true },
      });
      if (course) context = `Course: "${course.title}"\n${course.description ?? ''}`;
    }

    const msg = await this.ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are a helpful study assistant for an e-learning platform. You ONLY answer questions about the provided course/lesson content. If a question is unrelated, politely redirect the student to the lesson material. Keep answers clear and educational.\n\n${context}`,
      messages: [{ role: 'user', content: question }],
    });

    return { answer: (msg.content[0] as any).text as string };
  }

  // ── AI Quiz Generation ───────────────────────────────────
  async generateQuizQuestions(lessonId: string, count = 10) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true, content: true, moduleId: true } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module_ = await this.prisma.courseModule.findUnique({ where: { id: lesson.moduleId }, select: { courseId: true } });

    const msg = await this.ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Generate ${count} multiple-choice quiz questions for this lesson. Return a JSON array only:\n[\n  {\n    "questionText": "...",\n    "options": [{"id":"a","text":"...","isCorrect":true}, {"id":"b","text":"..."}, {"id":"c","text":"..."}, {"id":"d","text":"..."}],\n    "correctAnswer": "a",\n    "explanation": "...",\n    "difficulty": "EASY|MEDIUM|HARD"\n  }\n]\n\nLesson: ${lesson.title}\n\n${lesson.content ?? ''}`,
      }],
    });

    const raw = (msg.content[0] as any).text as string;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI returned invalid format');
    const questions: any[] = JSON.parse(jsonMatch[0]);

    // Save to question bank
    const saved = await this.prisma.$transaction(
      questions.map((q, i) =>
        this.prisma.questionBank.create({
          data: {
            courseId: module_!.courseId, lessonId, questionText: q.questionText,
            type: 'MCQ', difficulty: q.difficulty ?? 'MEDIUM',
            options: q.options, correctAnswer: q.correctAnswer,
            explanation: q.explanation, sortOrder: i,
          },
        })
      )
    );

    return { generated: saved.length, questions: saved.map(q => ({ id: q.id, questionText: q.questionText, difficulty: q.difficulty })) };
  }

  // ── AI Writing Feedback ──────────────────────────────────
  async gradeShortAnswer(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: { select: { title: true, description: true, maxPoints: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const msg = await this.ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are grading a student assignment. Provide structured feedback.\n\nAssignment: ${submission.assignment.title}\nInstructions: ${submission.assignment.description}\nMax Points: ${submission.assignment.maxPoints}\n\nStudent submission file URL: ${submission.fileUrl ?? 'No file'}\n\nProvide:\n1. Suggested score (0-${submission.assignment.maxPoints})\n2. Strengths\n3. Areas for improvement\n4. Summary feedback (2-3 sentences)\n\nReturn JSON: {"score": number, "strengths": string, "improvements": string, "feedback": string}`,
      }],
    });

    const raw = (msg.content[0] as any).text as string;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI returned invalid format');
    const result = JSON.parse(jsonMatch[0]);

    // Save AI feedback to submission
    await this.prisma.submission.update({ where: { id: submissionId }, data: { aiFeedback: result.feedback } });

    return result;
  }

  // ── Personalised Learning Path ───────────────────────────
  async getRecommendations(studentId: string) {
    const [enrollments, recentAttempts, certificates] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where: { studentId },
        include: { course: { select: { id: true, title: true, subjectId: true, programmeId: true } } },
      }),
      this.prisma.quizAttempt.findMany({ where: { studentId }, orderBy: { submittedAt: 'desc' }, take: 10 }),
      this.prisma.certificate.findMany({ where: { studentId }, select: { courseId: true } }),
    ]);

    const completedCourseIds = new Set(certificates.map(c => c.courseId));
    const enrolledIds = new Set(enrollments.map(e => e.courseId));
    const avgScore = recentAttempts.length ? recentAttempts.reduce((s, a) => s + (a.maxScore > 0 ? a.finalScore / a.maxScore : 0), 0) / recentAttempts.length : 0.7;

    // Find similar courses not yet enrolled
    const subjectIds = [...new Set(enrollments.map(e => e.course.subjectId).filter(Boolean))];
    const recommended = await this.prisma.platformCourse.findMany({
      where: {
        status: 'PUBLISHED',
        id: { notIn: [...enrolledIds] },
        subjectId: { in: subjectIds as string[] },
      },
      select: { id: true, title: true, shortDescription: true, coverUrl: true, teacher: { select: { name: true } } },
      take: 6,
    });

    return {
      recommended,
      learningStrength: avgScore > 0.8 ? 'strong' : avgScore > 0.6 ? 'moderate' : 'needs-support',
      completedCount: completedCourseIds.size,
      tip: avgScore < 0.6 ? 'Focus on reviewing your weakest quiz topics — consider using flashcards.' : 'Great pace! Try a more advanced course in your subject area.',
    };
  }
}
