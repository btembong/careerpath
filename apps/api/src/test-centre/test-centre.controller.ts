import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TestCentreService, TestFilters, StartTest } from './test-centre.service';
import { QuestionBankService, QuestionInput } from './question-bank.service';
import { QuestionAiService } from './question-ai.service';
import { MockExamService, ExamInput, Section } from './mock-exam.service';
import { CatService } from './cat.service';
import { ProgressService } from './progress.service';
import { ExamKind, ExamStatus } from '@prisma/client';
import { QuestionDifficulty, QuestionType } from '@prisma/client';

@ApiTags('test centre')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('test-centre')
export class TestCentreController {
  constructor(private readonly tests: TestCentreService, private readonly qai: QuestionAiService, private readonly exams: MockExamService, private readonly cat: CatService, private readonly progress: ProgressService) {}

  @Get('exams')
  @ApiOperation({ summary: 'Mock exams or past papers, with which ones this student can take' })
  examList(@CurrentUser() user: UserProfile, @Query('kind') kind?: string) {
    return this.exams.forStudent(user.id, kind === 'PAST_PAPER' ? ExamKind.PAST_PAPER : kind === 'CAT' ? ExamKind.CAT : ExamKind.MOCK);
  }

  @Post('exams/:id/start')
  @ApiOperation({ summary: 'Start (or resume) an attempt; past papers can also be practised untimed' })
  async examStart(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { practice?: boolean }) {
    return (await this.cat.isCat(id)) ? this.cat.start(user.id, id) : this.exams.start(user.id, id, body ?? {});
  }

  @Get('cat/:id')
  @ApiOperation({ summary: 'The adaptive test as it stands: only the current question' })
  catView(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.cat.view(user.id, id); }

  @Post('cat/:id/answer')
  @ApiOperation({ summary: 'Answer the current question; the next one depends on it. No going back.' })
  catAnswer(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { questionId: string; answer: unknown; timeSecs?: number }) {
    return this.cat.answer(user.id, id, body ?? ({} as { questionId: string; answer: unknown }));
  }

  @Get('progress')
  @ApiOperation({ summary: 'Mock and CAT results over time, a five-week study calendar and headline tiles' })
  progressView(@CurrentUser() user: UserProfile) { return this.progress.forStudent(user.id); }

  @Get('overview')
  @ApiOperation({ summary: 'Test Centre home: counts, weak topics, recent tests' })
  overview(@CurrentUser() user: UserProfile) { return this.tests.overview(user.id); }

  @Get('catalog')
  @ApiOperation({ summary: 'Everything this student can test on: courses, modules, lessons, pools' })
  catalog(@CurrentUser() user: UserProfile) { return this.tests.catalog(user.id); }

  @Post('match')
  @ApiOperation({ summary: 'How many questions match these filters' })
  match(@CurrentUser() user: UserProfile, @Body() body: TestFilters) { return this.tests.countMatches(user.id, body ?? {}); }

  @Get('sessions')
  history(@CurrentUser() user: UserProfile) { return this.tests.history(user.id); }

  @Post('sessions')
  @ApiOperation({ summary: 'Start a test' })
  start(@CurrentUser() user: UserProfile, @Body() body: StartTest) { return this.tests.start(user.id, body ?? ({} as StartTest)); }

  @Get('sessions/:id')
  session(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.tests.session(user.id, id); }

  @Post('sessions/:id/answer')
  answer(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { questionId: string; answer?: unknown; flagged?: boolean; timeSecs?: number }) {
    return this.tests.answer(user.id, id, body ?? ({} as { questionId: string }));
  }

  @Post('sessions/:id/self-mark')
  @ApiOperation({ summary: 'Mark your own written answer against the marking scheme' })
  selfMark(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { questionId: string; score: number }) {
    return this.tests.selfMark(user.id, id, body ?? ({} as { questionId: string; score: number }));
  }

  @Post('sessions/:id/ai-mark')
  @ApiOperation({ summary: 'Mark a written answer with AI: a suggested mark and feedback the student can change' })
  aiMark(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { questionId: string }) { return this.qai.markAnswer(user.id, id, body?.questionId); }

  @Post('sessions/:id/submit')
  submit(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.tests.submit(user.id, id); }

  @Get('sessions/:id/result')
  result(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.tests.result(user.id, id); }
}

@ApiTags('question bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
@Controller('question-bank')
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService, private readonly qai: QuestionAiService) {}

  @Post('ai/explanations')
  @ApiOperation({ summary: 'Draft explanations with AI for questions without one; teachers accept or discard each draft' })
  aiExplain(@CurrentUser() user: UserProfile, @Body() body: { ids?: string[]; courseId?: string }) { return this.qai.startExplanations(user, body ?? {}); }

  @Get('ai/jobs/:id')
  aiJob(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.qai.job(user, id); }

  @Post('ai/generate')
  @ApiOperation({ summary: 'Draft new questions with AI from lesson material; they arrive as drafts for review' })
  aiGenerate(@CurrentUser() user: UserProfile, @Body() body: { courseId: string; moduleId?: string; lessonId?: string; count?: number; types?: QuestionType[]; difficulty?: QuestionDifficulty | 'MIXED' }) {
    return this.qai.generate(user, body ?? ({} as { courseId: string }));
  }

  @Post(':id/ai-draft/accept')
  aiAccept(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { explanation?: string; modelAnswer?: string | null }) { return this.qai.acceptDraft(user, id, body ?? {}); }

  @Post(':id/ai-draft/discard')
  aiDiscard(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.qai.discardDraft(user, id); }

  @Get()
  @ApiOperation({ summary: 'Questions this person may see: admin all, teachers and reviewers their courses' })
  list(@CurrentUser() user: UserProfile, @Query() query: Record<string, string>) { return this.bank.list(user, query); }

  @Get('courses')
  courses(@CurrentUser() user: UserProfile) { return this.bank.courses(user); }

  @Get(':id')
  one(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.bank.one(user, id); }

  @Post()
  create(@CurrentUser() user: UserProfile, @Body() body: QuestionInput) { return this.bank.create(user, body ?? ({} as QuestionInput)); }

  @Post('import')
  @ApiOperation({ summary: 'Add questions from a spreadsheet; each row is checked on its own' })
  import(@CurrentUser() user: UserProfile, @Body() body: { courseId: string; rows: Record<string, string>[] }) { return this.bank.importRows(user, body ?? ({} as { courseId: string; rows: [] })); }

  @Patch(':id')
  update(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: Partial<QuestionInput>) { return this.bank.update(user, id, body ?? {}); }

  @Delete(':id')
  remove(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.bank.remove(user, id); }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Send a draft for review' })
  send(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.bank.submitForReview(user, id); }

  @Post(':id/decide')
  @Roles(UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a question, or send it back with a note' })
  decide(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { approve: boolean; note?: string }) { return this.bank.decide(user, id, body ?? ({} as { approve: boolean })); }
}

@ApiTags('mock exams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@Controller('mock-exams')
export class MockExamController {
  constructor(private readonly exams: MockExamService, private readonly cat: CatService) {}

  @Post('calibrate')
  @ApiOperation({ summary: '[Admin] Set question difficulty for adaptive tests from how often students got each right' })
  calibrate(@CurrentUser() user: UserProfile) { return this.cat.calibrate(user); }

  @Get()
  list(@CurrentUser() user: UserProfile, @Query('kind') kind?: string) {
    return this.exams.list(user, kind === 'PAST_PAPER' ? ExamKind.PAST_PAPER : kind === 'MOCK' ? ExamKind.MOCK : kind === 'CAT' ? ExamKind.CAT : undefined);
  }

  @Post('availability')
  @ApiOperation({ summary: 'How many live questions each section can draw on' })
  availability(@Body() body: { sections?: Section[] }) { return this.exams.availability((body?.sections ?? []).filter(s => s?.courseIds?.length)); }

  @Get('marking')
  @ApiOperation({ summary: 'Finished attempts with written answers waiting for a mark' })
  marking(@CurrentUser() user: UserProfile) { return this.exams.markingQueue(user); }

  @Get('attempts/:sessionId')
  attempt(@CurrentUser() user: UserProfile, @Param('sessionId') sessionId: string) { return this.exams.attemptForMarking(user, sessionId); }

  @Post('attempts/:sessionId/mark')
  mark(@CurrentUser() user: UserProfile, @Param('sessionId') sessionId: string, @Body() body: { questionId: string; score: number; feedback?: string }) {
    return this.exams.mark(user, sessionId, body ?? ({} as { questionId: string; score: number }));
  }

  @Get(':id')
  one(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.exams.get(user, id); }

  @Post()
  create(@CurrentUser() user: UserProfile, @Body() body: ExamInput) { return this.exams.create(user, body ?? {}); }

  @Patch(':id')
  update(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: ExamInput) { return this.exams.update(user, id, body ?? {}); }

  @Post(':id/status')
  status(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { status: ExamStatus }) {
    if (!Object.values(ExamStatus).includes(body?.status)) throw new BadRequestException('Unknown status');
    return this.exams.setStatus(user, id, body.status);
  }

  @Delete(':id')
  remove(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.exams.remove(user, id); }
}
