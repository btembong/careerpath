import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClassToolsService } from './class-tools.service';

/** Poll, quick quiz, questions and groups beside the video, and the page after class */
@ApiTags('live class tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
@Controller('live/classes/:id')
export class ClassToolsController {
  constructor(private readonly tools: ClassToolsService) {}

  @Get('tools')
  @ApiOperation({ summary: 'What the side panel shows now: poll, quiz, questions, groups' })
  state(@CurrentUser() u: UserProfile, @Param('id') id: string) { return this.tools.state(u, id); }

  @Post('polls')
  @ApiOperation({ summary: '[Teacher] Start a poll (closes the one before)' })
  createPoll(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() body: { question: string; options: string[] }) { return this.tools.createPoll(u, id, body); }

  @Post('polls/:pollId/vote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: '[Student] Answer the poll (can change while it is open)' })
  vote(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('pollId') pollId: string, @Body() body: { option: number }) { return this.tools.vote(u, id, pollId, body?.option); }

  @Patch('polls/:pollId')
  @ApiOperation({ summary: '[Teacher] Show the results to the class, or close the poll' })
  setPoll(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('pollId') pollId: string, @Body() body: { status: string }) { return this.tools.setPoll(u, id, pollId, body?.status); }

  @Post('questions')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: '[Student] Ask a question, by name or anonymously' })
  ask(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() body: { body: string; anonymous?: boolean }) { return this.tools.ask(u, id, body); }

  @Post('questions/:qid/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vote a question up, or take the vote back' })
  voteQuestion(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('qid') qid: string) { return this.tools.voteQuestion(u, id, qid); }

  @Patch('questions/:qid')
  @ApiOperation({ summary: '[Teacher] Answered live, answer later, or write the answer' })
  answer(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('qid') qid: string, @Body() body: { state: string; answer?: string }) { return this.tools.answer(u, id, qid, body); }

  @Get('quiz/courses')
  @ApiOperation({ summary: '[Teacher] Courses with questions to quiz from' })
  quizCourses(@CurrentUser() u: UserProfile, @Param('id') id: string) { return this.tools.quizCourses(u, id); }

  @Post('quiz')
  @ApiOperation({ summary: '[Teacher] Start a quick quiz from the question bank' })
  startQuiz(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() body: { courseId: string; count?: number; secondsEach?: number }) { return this.tools.startQuiz(u, id, body); }

  @Post('quiz/:quizId/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Open the quiz: a timed Test Centre practice session' })
  joinQuiz(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('quizId') quizId: string) { return this.tools.joinQuiz(u, id, quizId); }

  @Post('groups')
  @ApiOperation({ summary: '[Teacher] Split the students in the room into groups, each with its own video room' })
  startGroups(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() body: { size?: number; minutes?: number }) { return this.tools.startGroups(u, id, body); }

  @Delete('groups')
  @ApiOperation({ summary: '[Teacher] Bring everyone back from their groups' })
  endGroups(@CurrentUser() u: UserProfile, @Param('id') id: string) { return this.tools.endGroups(u, id); }

  @Post('groups/:gid/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A video token for a group room (its members, or the teacher dropping in)' })
  groupToken(@CurrentUser() u: UserProfile, @Param('id') id: string, @Param('gid') gid: string) { return this.tools.groupToken(u, id, gid); }

  @Get('after')
  @ApiOperation({ summary: 'After class: the board as it was left, questions and answers, polls and quiz results' })
  after(@CurrentUser() u: UserProfile, @Param('id') id: string) { return this.tools.after(u, id); }

  @Get('calendar.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="careerpath-class.ics"')
  @ApiOperation({ summary: 'Add the class to your calendar (.ics)' })
  calendar(@CurrentUser() u: UserProfile, @Param('id') id: string) { return this.tools.calendar(u, id); }
}
