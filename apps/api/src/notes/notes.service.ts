import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService) {}

  // ── Notes ─────────────────────────────────────────────────
  async listNotes(studentId: string, lessonId: string) {
    return this.prisma.lessonNote.findMany({
      where: { studentId, lessonId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async createNote(studentId: string, dto: { lessonId: string; timestamp?: number; body: string }) {
    return this.prisma.lessonNote.create({
      data: { studentId, lessonId: dto.lessonId, timestamp: dto.timestamp, body: dto.body },
    });
  }

  async updateNote(id: string, studentId: string, body: string) {
    return this.prisma.lessonNote.updateMany({ where: { id, studentId }, data: { body } });
  }

  async deleteNote(id: string, studentId: string) {
    await this.prisma.lessonNote.deleteMany({ where: { id, studentId } });
    return { deleted: true };
  }

  async exportNotesPdf(studentId: string, courseId: string) {
    // Returns raw text — front-end renders to PDF using jsPDF or similar
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      include: { lessons: { include: { notes: { where: { studentId }, orderBy: { timestamp: 'asc' } } } } },
      orderBy: { sortOrder: 'asc' },
    });
    const lines: string[] = [];
    for (const mod of modules) {
      lines.push(`## ${mod.title}`);
      for (const lesson of mod.lessons) {
        if (lesson.notes.length) {
          lines.push(`### ${lesson.title}`);
          for (const n of lesson.notes) {
            const ts = n.timestamp != null ? `[${this.formatTs(n.timestamp)}] ` : '';
            lines.push(`${ts}${n.body}`);
          }
        }
      }
    }
    return { text: lines.join('\n') };
  }

  // ── Bookmarks ─────────────────────────────────────────────
  async listBookmarks(studentId: string, lessonId?: string) {
    return this.prisma.lessonBookmark.findMany({
      where: { studentId, ...(lessonId ? { lessonId } : {}) },
      orderBy: { timestamp: 'asc' },
      include: { lesson: { select: { title: true, module: { select: { course: { select: { title: true } } } } } } },
    });
  }

  async addBookmark(studentId: string, dto: { lessonId: string; timestamp: number; label?: string }) {
    return this.prisma.lessonBookmark.upsert({
      where: { studentId_lessonId_timestamp: { studentId, lessonId: dto.lessonId, timestamp: dto.timestamp } },
      create: { studentId, lessonId: dto.lessonId, timestamp: dto.timestamp, label: dto.label },
      update: { label: dto.label },
    });
  }

  async deleteBookmark(id: string, studentId: string) {
    await this.prisma.lessonBookmark.deleteMany({ where: { id, studentId } });
    return { deleted: true };
  }

  private formatTs(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
