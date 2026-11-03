import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ExamKind, ExamStatus, Prisma, QuestionDifficulty, QuestionType, TestMode, TestStatus, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MockExamService, Section } from './mock-exam.service';
import { TestCentreService } from './test-centre.service';

/**
 * Computer-adaptive readiness tests, NCLEX style.
 *
 * Model: one-parameter logistic (Rasch). P(right) = 1 / (1 + e^-(θ - b)), θ the student's ability, b the question's difficulty.
 * Ability is estimated after every answer as the mean of the posterior (EAP) with a standard normal prior, which behaves
 * well from the first answer. Each next question is the unanswered one nearest θ, inside the area furthest below its share.
 * The test stops, after the minimum, once θ is 95% clearly above or below the passing standard; otherwise at the maximum or
 * when time runs out. This is a practice estimate; questions are calibrated from labels until enough students answer them.
 */

const AUTO: QuestionType[] = [QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK, QuestionType.MATCHING];
const LABEL_B: Record<QuestionDifficulty, number> = { EASY: -1, MEDIUM: 0, HARD: 1 };
const Z95 = 1.96;
const CALIBRATE_MIN = 30;
const GRID = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);

type Item = { id: string; b: number; area: string };
type Served = { id: string; area: string; b: number; correct: boolean | null };
export type Band = 'NEEDS_WORK' | 'GETTING_THERE' | 'NEAR_READY' | 'READY';
export interface CatResult {
  decision: 'ABOVE' | 'BELOW' | 'UNDECIDED'; reason: 'CONFIDENCE' | 'MAX' | 'TIME' | 'ENDED';
  probability: number; band: Band; theta: number; se: number; items: number;
  byArea: { area: string; items: number; right: number; standing: 'ABOVE' | 'NEAR' | 'BELOW' }[];
}
interface CatState {
  theta: number; se: number; standard: number; min: number; max: number;
  areas: { name: string; weight: number }[]; pool: Item[]; served: Served[]; current: string | null; result?: CatResult;
}

const p = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));
/** Standard normal CDF (Abramowitz and Stegun 7.1.26) */
function phi(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
/** Posterior mean and SD of ability given answers, prior N(0, 1) */
export function estimate(answers: { b: number; correct: boolean }[]) {
  const w = GRID.map(t => {
    let l = Math.exp(-(t * t) / 2);
    for (const a of answers) { const pr = p(t, a.b); l *= a.correct ? pr : 1 - pr; }
    return l;
  });
  const sum = w.reduce((n, x) => n + x, 0) || 1;
  const theta = GRID.reduce((n, t, i) => n + t * w[i], 0) / sum;
  const se = Math.sqrt(GRID.reduce((n, t, i) => n + (t - theta) ** 2 * w[i], 0) / sum);
  return { theta, se };
}
export function band(probability: number): Band {
  return probability >= 0.8 ? 'READY' : probability >= 0.5 ? 'NEAR_READY' : probability >= 0.2 ? 'GETTING_THERE' : 'NEEDS_WORK';
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

@Injectable()
export class CatService implements OnModuleInit {
  constructor(private prisma: PrismaService, private exams: MockExamService, private tests: TestCentreService) {}

  /** Ending a CAT through the Test Centre (submit, or time running out) comes back here for the decision */
  onModuleInit() { this.tests.catFinish = (id, reason) => this.finish(id, reason); }

  async isCat(examId: string) {
    return (await this.prisma.mockExam.findUnique({ where: { id: examId }, select: { kind: true } }))?.kind === ExamKind.CAT;
  }

  private state(s: { cat: Prisma.JsonValue }) {
    if (!s.cat) throw new BadRequestException('This isn’t an adaptive test.');
    return s.cat as unknown as CatState;
  }

  private async save(id: string, st: CatState, extra: Prisma.TestSessionUpdateInput = {}) {
    await this.prisma.testSession.update({ where: { id }, data: { cat: st as unknown as Prisma.InputJsonValue, ...extra } });
  }

  // ── Start ────────────────────────────────────────────────
  async start(studentId: string, examId: string) {
    const e = await this.prisma.mockExam.findUnique({ where: { id: examId } });
    if (!e || e.kind !== ExamKind.CAT || e.status !== ExamStatus.PUBLISHED) throw new NotFoundException('This exam isn’t available.');
    if (!(await this.exams.canTake(studentId, e))) throw new ForbiddenException('Buy one of the courses or packages this exam belongs to first.');
    const running = await this.prisma.testSession.findFirst({ where: { studentId, mockExamId: e.id, mode: TestMode.CAT, status: TestStatus.IN_PROGRESS } });
    if (running && (!running.expiresAt || running.expiresAt.getTime() > Date.now())) return { id: running.id, resumed: true };
    if (e.attemptsAllowed) {
      const used = await this.prisma.testSession.count({ where: { studentId, mockExamId: e.id, mode: TestMode.CAT } });
      if (used >= e.attemptsAllowed) throw new BadRequestException(`You’ve used all ${e.attemptsAllowed} attempts at this exam.`);
    }

    // The pool: every live, automatically marked question in each area
    const sections = (e.sections ?? []) as unknown as Section[];
    const seenIds = new Set<string>();
    const pool: Item[] = [];
    for (const sec of sections) {
      const rows = await this.exams.sectionPool({ ...sec, types: AUTO });
      const qs = await this.prisma.questionBank.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, difficulty: true, irtB: true } });
      for (const q of qs) if (!seenIds.has(q.id)) { seenIds.add(q.id); pool.push({ id: q.id, b: q.irtB ?? LABEL_B[q.difficulty], area: sec.title }); }
    }
    const max = e.catMax ?? 60;
    if (pool.length < (e.catMin ?? 10)) throw new BadRequestException('This exam doesn’t have enough questions yet. Tell your teacher.');
    // Questions from earlier attempts go to the back of the queue, when there are enough others
    const before = await this.prisma.testSession.findMany({ where: { studentId, mockExamId: e.id, mode: TestMode.CAT }, select: { questionIds: true } });
    const old = new Set(before.flatMap(b => b.questionIds));
    const fresh = pool.filter(i => !old.has(i.id));
    const usable = fresh.length >= max ? fresh : pool;

    const totalWeight = sections.reduce((n, s) => n + Math.max(Number(s.count) || 1, 1), 0);
    const st: CatState = {
      theta: 0, se: 1, standard: e.catStandard ?? 0, min: e.catMin ?? 30, max,
      areas: sections.map(s => ({ name: s.title, weight: Math.max(Number(s.count) || 1, 1) / totalWeight })),
      pool: usable, served: [], current: null,
    };
    st.current = this.pick(st);
    const created = await this.tests.createSession(studentId, { mode: TestMode.CAT, title: e.title, ids: [st.current!], limitSecs: e.timeLimitSecs, mockExamId: e.id });
    await this.save(created.id, st, { maxScore: st.max });
    return created;
  }

  /** Next question: the area furthest below its share, then the unanswered question nearest the ability estimate */
  private pick(st: CatState): string | null {
    const servedIds = new Set(st.served.map(s => s.id));
    const left = st.pool.filter(i => !servedIds.has(i.id));
    if (!left.length) return null;
    const n = st.served.length + 1;
    const gap = (a: string) => (st.areas.find(x => x.name === a)?.weight ?? 0) - st.served.filter(s => s.area === a).length / n;
    const areas = [...new Set(left.map(i => i.area))].sort((x, y) => gap(y) - gap(x));
    const inArea = left.filter(i => i.area === areas[0]);
    // A little randomness among the five closest, so two students don't see the same sequence
    const nearest = [...inArea].sort((a, b) => Math.abs(a.b - st.theta) - Math.abs(b.b - st.theta)).slice(0, 5);
    return shuffled(nearest)[0].id;
  }

  // ── During the test ──────────────────────────────────────
  private async owned(studentId: string, id: string) {
    const s = await this.prisma.testSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Test not found');
    if (s.studentId !== studentId) throw new ForbiddenException('Not your test');
    if (s.mode !== TestMode.CAT) throw new BadRequestException('This isn’t an adaptive test.');
    return s;
  }

  async view(studentId: string, id: string) {
    let s = await this.owned(studentId, id);
    if (s.status === TestStatus.IN_PROGRESS && s.expiresAt && s.expiresAt.getTime() <= Date.now()) { await this.finish(id, 'TIME'); s = await this.owned(studentId, id); }
    const st = this.state(s);
    const q = st.current && s.status === TestStatus.IN_PROGRESS ? await this.prisma.questionBank.findUnique({ where: { id: st.current } }) : null;
    return {
      id: s.id, title: s.title, status: s.status, number: st.served.length + 1, min: st.min, max: st.max,
      remainingSecs: s.expiresAt && s.status === TestStatus.IN_PROGRESS ? Math.max(0, Math.round((s.expiresAt.getTime() - Date.now()) / 1000)) : null,
      // Only the question being asked; never anything that hints at the answer or the estimate
      question: q ? {
        id: q.id, type: q.type, text: q.questionText, imageUrl: q.imageUrl, marks: 1,
        options: q.type === QuestionType.TRUE_FALSE ? null : Array.isArray(q.options) ? (q.options as { id: string; text: string }[]).map(o => ({ id: o.id, text: o.text })) : null,
        choices: q.type === QuestionType.MATCHING && Array.isArray(q.options) ? shuffled([...new Set((q.options as { match: string }[]).map(o => o.match))]) : undefined,
      } : null,
    };
  }

  async answer(studentId: string, id: string, dto: { questionId: string; answer: unknown; timeSecs?: number }) {
    const s = await this.owned(studentId, id);
    if (s.status !== TestStatus.IN_PROGRESS) throw new BadRequestException('This test is already finished.');
    if (s.expiresAt && s.expiresAt.getTime() <= Date.now()) { await this.finish(id, 'TIME'); throw new BadRequestException('Time is up. Your test has ended.'); }
    const st = this.state(s);
    if (dto.questionId !== st.current) throw new BadRequestException('That isn’t the current question. You can’t go back in an adaptive test.');
    if (dto.answer == null || dto.answer === '') throw new BadRequestException('Answer the question to go on; there’s no skipping.');
    const q = await this.prisma.questionBank.findUnique({ where: { id: dto.questionId } });
    if (!q) throw new NotFoundException('Question not found');
    const mark = this.tests.mark(q, dto.answer);
    const correct = mark.isCorrect;
    await this.prisma.testAnswer.create({ data: { sessionId: id, questionId: q.id, answer: dto.answer as Prisma.InputJsonValue, isCorrect: correct, score: correct ? 1 : 0, timeSecs: Math.min(Math.max(Math.round(Number(dto.timeSecs) || 0), 0), 3600) } });
    await this.tests.recordProgressFor(studentId, q.id, correct);

    const item = st.pool.find(i => i.id === q.id);
    st.served.push({ id: q.id, area: item?.area ?? '', b: item?.b ?? 0, correct });
    const est = estimate(st.served.map(x => ({ b: x.b, correct: !!x.correct })));
    st.theta = est.theta; st.se = est.se;

    const n = st.served.length;
    const clear = Math.abs(st.theta - st.standard) > Z95 * st.se;
    // Reaching the maximum is reported as such, even if it became sure on the last answer
    if ((n >= st.min && clear) || n >= st.max) return this.finish(id, n >= st.max ? 'MAX' : 'CONFIDENCE', st);
    st.current = this.pick(st);
    if (!st.current) return this.finish(id, 'MAX', st);
    await this.save(id, st, { questionIds: { push: st.current } });
    return { done: false, number: n + 1 };
  }

  /** Decide and close. Ending early or running out of time before the minimum leaves no decision. */
  async finish(id: string, reason: CatResult['reason'], known?: CatState) {
    const s = await this.prisma.testSession.findUnique({ where: { id } });
    if (!s || s.status === TestStatus.SUBMITTED) return { done: true };
    const st = known ?? this.state(s);
    const answered = st.served.filter(x => x.correct != null);
    const probability = phi((st.theta - st.standard) / Math.max(st.se, 0.01));
    const enough = answered.length >= st.min;
    const decision: CatResult['decision'] = !enough ? 'UNDECIDED' : st.theta >= st.standard ? 'ABOVE' : 'BELOW';
    const byArea = st.areas.map(a => {
      const r = answered.filter(x => x.area === a.name);
      const e = estimate(r.map(x => ({ b: x.b, correct: !!x.correct })));
      return { area: a.name, items: r.length, right: r.filter(x => x.correct).length, standing: (e.theta - st.standard > e.se ? 'ABOVE' : st.standard - e.theta > e.se ? 'BELOW' : 'NEAR') as 'ABOVE' | 'NEAR' | 'BELOW' };
    }).filter(a => a.items > 0);
    st.result = {
      decision, reason: enough ? reason : reason === 'TIME' ? 'TIME' : 'ENDED',
      probability: Math.round(probability * 1000) / 1000, band: enough ? band(probability) : 'NEEDS_WORK',
      theta: Math.round(st.theta * 100) / 100, se: Math.round(st.se * 100) / 100, items: answered.length, byArea,
    };
    st.current = null;
    // The question being shown when it ended was never answered: it's not part of the attempt
    const asked = answered.map(x => x.id);
    await this.save(id, st, { status: TestStatus.SUBMITTED, submittedAt: new Date(), score: answered.filter(x => x.correct).length, maxScore: answered.length, questionIds: asked });
    return { done: true, result: st.result };
  }

  // ── Calibration (admin) ──────────────────────────────────
  /** Questions answered 30+ times in the Test Centre get a difficulty from how often students got them right */
  async calibrate(u: UserProfile) {
    if (u.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    const stats = await this.prisma.testAnswer.groupBy({ by: ['questionId', 'isCorrect'], where: { isCorrect: { not: null }, question: { type: { in: AUTO } } }, _count: true });
    const by = new Map<string, { n: number; right: number }>();
    for (const r of stats) { const x = by.get(r.questionId) ?? { n: 0, right: 0 }; x.n += r._count; if (r.isCorrect) x.right += r._count; by.set(r.questionId, x); }
    let updated = 0;
    for (const [id, x] of by) {
      if (x.n < CALIBRATE_MIN) continue;
      const pr = Math.min(Math.max(x.right / x.n, 0.02), 0.98);
      const b = Math.round(Math.log((1 - pr) / pr) * 100) / 100;
      await this.prisma.questionBank.update({ where: { id }, data: { irtB: Math.min(Math.max(b, -3), 3), irtN: x.n } });
      updated++;
    }
    return { updated, waiting: [...by.values()].filter(x => x.n < CALIBRATE_MIN).length, minAnswers: CALIBRATE_MIN };
  }

  async poolSize(sections: Section[]) {
    const ids = new Set<string>();
    for (const sec of sections) for (const r of await this.exams.sectionPool({ ...sec, types: AUTO })) ids.add(r.id);
    return ids.size;
  }
}

