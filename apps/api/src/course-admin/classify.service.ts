import { BadRequestException, Injectable } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export type Confidence = 'high' | 'medium';
export interface Suggestion { id: string; name: string; confidence: Confidence; why: string }

/** Exam (programme) rules, checked in order: the first that matches wins. Matched against the programme's short name. */
const EXAM_RULES: [RegExp, string][] = [
  [/\bnclex\b/i, 'NCLEX'],
  [/\bielts\b/i, 'IELTS'],
  [/\btoefl\b/i, 'TOEFL'],
  [/\bwassce\b|\bwaec\b/i, 'WASSCE'],
  [/\bbepc\b/i, 'BEPC'],
  [/\bigcse\b/i, 'IGCSE'],
  [/\b(form\s*(five|5|four|4)|o[\s'’-]?level|ordinary level)\b/i, 'GCE O-Level'],
  // Cameroon's A-Level when the title says GCE, Cameroon or sixth form; otherwise Cambridge
  [/\b(upper|lower)\s*sixth\b|\b(gce|cameroon)\b.*\ba[\s'’-]?level\b/i, 'GCE A-Level'],
  [/\ba[\s'’-]?level\b|\badvanced level\b/i, 'A-Level'],
  [/\bbac(calaur[ée]at)?\b.*\bcameroun\b|\bterminale\b/i, 'BAC Cameroun'],
  [/\b(nurs(e|es|ing)|midwi(fe|ves|fery))\b.*\b(council|board|licens)/i, 'Nursing Licensing'],
  [/\b(medical|dental|practitioners)\b.*\b(council|association|board)\b|\bmedical licens/i, 'Medical Licensing'],
  [/\bpmp\b|project management professional/i, 'PMP'],
  [/\bacca\b/i, 'ACCA'],
  [/\bmentorship\b|\bcareer\b/i, 'Career & Mentorship'],
];

/** Subject rules, most specific first. Matched against the subject's name. */
const SUBJECT_RULES: [RegExp, string][] = [
  [/\bfurther\s*math/i, 'Further Mathematics'],
  [/\bcore\s*math|\bmathematics\b|\bmaths?\b/i, 'Core Mathematics'],
  [/\b(human\s*)?biology\b/i, 'Biology'],
  [/\bchemistry\b/i, 'Chemistry'],
  [/\bphysics\b/i, 'Physics'],
  [/\bliterature\b/i, 'Literature in English'],
  [/\benglish\s*language\b|\bgrammar\b|\bediting\b/i, 'English Language'],
  [/\bielts\b.*\b(writing|speaking|task|academic)\b|\b(writing|speaking)\b.*\bielts\b|\bielts\b/i, 'IELTS Academic'],
  [/\btoefl\b.*\blistening\b/i, 'TOEFL Listening'],
  [/\btoefl\b.*\breading\b/i, 'TOEFL Reading'],
  [/\btoefl\b.*\bwriting\b/i, 'TOEFL Writing'],
  [/\btoefl\b.*\bspeaking\b/i, 'TOEFL Speaking'],
  [/\b(nurs(e|es|ing)|midwi(fe|ves|fery))\b/i, 'Nursing'],
  [/\b(medicine|medical|dental|dentistry|pharmacy)\b/i, 'Medicine'],
  [/\beconomics\b/i, 'Economics'],
  [/\bhistory\b/i, 'History'],
  [/\b(ict|computer\s*science|computer\s*studies)\b/i, 'ICT / Computer Studies'],
  [/\b(react|web\s*development)\b/i, 'Web Development'],
  [/\bagile\b|\bscrum\b/i, 'Agile & Hybrid PM'],
  [/\bbusiness\s*management\b/i, 'Business Management'],
  [/\bmarketing\b|\bmanagers?\b|\bleadership\b|\bleaders\b/i, 'Business Management'],
  [/\bmentorship\b|\bcareer\b/i, 'Career Development'],
];

const plain = (html: string | null) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/**
 * Suggests an exam and a subject for courses that have none, from their title (high confidence),
 * or their description and module names (medium). An admin reviews and applies them in one go.
 */
@Injectable()
export class ClassifyService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async suggestions() {
    const [programmes, subjects, courses] = await Promise.all([
      this.prisma.programme.findMany({ select: { id: true, name: true, shortName: true }, orderBy: { name: 'asc' } }),
      this.prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.platformCourse.findMany({
        where: { status: { not: 'ARCHIVED' }, OR: [{ programmeId: null }, { subjectId: null }] },
        orderBy: { title: 'asc' },
        select: {
          id: true, title: true, status: true, description: true, shortDescription: true, programmeId: true, subjectId: true,
          programme: { select: { id: true, shortName: true, name: true } }, subject: { select: { id: true, name: true } },
          teacher: { select: { name: true, firstName: true, lastName: true } },
          modules: { select: { title: true }, take: 8 },
          _count: { select: { enrollments: true, modules: true } },
        },
      }),
    ]);
    const progByShort = new Map(programmes.map(p => [p.shortName ?? p.name, p]));
    const subByName = new Map(subjects.map(s => [s.name, s]));

    const find = <T extends { id: string }>(rules: [RegExp, string][], lookup: Map<string, T & { name: string }>, title: string, rest: string): Suggestion | null => {
      for (const [re, key] of rules) {
        const target = lookup.get(key);
        if (!target) continue;
        if (re.test(title)) return { id: target.id, name: target.name, confidence: 'high', why: 'the title' };
      }
      for (const [re, key] of rules) {
        const target = lookup.get(key);
        if (target && re.test(rest)) return { id: target.id, name: target.name, confidence: 'medium', why: 'the description or modules' };
      }
      return null;
    };

    const rows = courses.map(c => {
      const rest = [plain(c.shortDescription), plain(c.description).slice(0, 600), c.modules.map(m => m.title).join(' · ')].filter(Boolean).join(' · ');
      const exam = c.programmeId ? null : find(EXAM_RULES, progByShort as Map<string, { id: string; name: string }>, c.title, rest);
      const subject = c.subjectId ? null : find(SUBJECT_RULES, subByName, c.title, rest);
      const teacher = c.teacher ? c.teacher.name || [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') : null;
      return {
        id: c.id, title: c.title, status: c.status, teacher, students: c._count.enrollments, modules: c._count.modules,
        hint: rest.slice(0, 160),
        current: { exam: c.programme ? { id: c.programme.id, name: c.programme.shortName ?? c.programme.name } : null, subject: c.subject },
        exam, subject,
        // Placeholder titles from imports ("Cameroon", "New Course") say nothing about the course
        placeholder: /^(cameroon|new course)$/i.test(c.title.trim()),
      };
    });
    return {
      programmes: programmes.map(p => ({ id: p.id, name: p.shortName ?? p.name, full: p.name })),
      subjects,
      courses: rows,
      stats: { total: rows.length, withExam: rows.filter(r => r.exam).length, withSubject: rows.filter(r => r.subject).length, placeholders: rows.filter(r => r.placeholder).length },
    };
  }

  /** Save the chosen exam and subject for each course. Only fills what's sent; null leaves a field as it is. */
  async apply(admin: UserProfile, items: { courseId: string; programmeId?: string | null; subjectId?: string | null }[]) {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Choose at least one course');
    if (items.length > 500) throw new BadRequestException('Up to 500 courses at a time');
    const [progIds, subIds] = await Promise.all([
      this.prisma.programme.findMany({ select: { id: true } }).then(r => new Set(r.map(x => x.id))),
      this.prisma.subject.findMany({ select: { id: true } }).then(r => new Set(r.map(x => x.id))),
    ]);
    let updated = 0;
    for (const it of items) {
      const data: { programmeId?: string; subjectId?: string } = {};
      if (it.programmeId && progIds.has(it.programmeId)) data.programmeId = it.programmeId;
      if (it.subjectId && subIds.has(it.subjectId)) data.subjectId = it.subjectId;
      if (!Object.keys(data).length) continue;
      const r = await this.prisma.platformCourse.updateMany({ where: { id: it.courseId }, data });
      updated += r.count;
    }
    this.audit.log(admin.id, 'courses.classify', 'PlatformCourse', undefined, undefined, { updated, sent: items.length });
    return { updated };
  }
}
