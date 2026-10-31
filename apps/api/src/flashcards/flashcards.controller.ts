import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { UserRole } from '@cpa/shared';
import { FlashcardsService } from './flashcards.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('flashcards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Get('overview')
  overview(@Req() req: any) {
    return this.flashcardsService.overview(req.user);
  }

  /** Cards to study now: ?deckId= for one deck, or due cards across every started deck */
  @Get('session')
  session(@Req() req: any, @Query('deckId') deckId?: string) {
    return this.flashcardsService.session(req.user, deckId);
  }

  @Get('decks')
  listDecks(@Req() req: any, @Query('courseId') courseId?: string) {
    return this.flashcardsService.listDecks(req.user, courseId);
  }

  @Get('decks/:deckId/cards')
  getDeckCards(@Param('deckId') deckId: string, @Req() req: any) {
    return this.flashcardsService.getDeckCards(req.user, deckId);
  }

  @Post('decks')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  createDeck(@Req() req: any, @Body() body: any) {
    return this.flashcardsService.createDeck(req.user, body.courseId, body);
  }

  @Post('decks/:deckId/review')
  submitReview(@Param('deckId') deckId: string, @Req() req: any, @Body() body: { cardId: string; difficulty: number }) {
    return this.flashcardsService.submitReview(req.user, deckId, body.cardId, Number(body.difficulty));
  }

  @Post('decks/ai-generate')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  aiGenerate(@Req() req: any, @Body() body: { courseId: string; lessonId: string }) {
    return this.flashcardsService.aiGenerateDeck(req.user, body.courseId, body.lessonId);
  }
}
