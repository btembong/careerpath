import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Get('decks')
  listDecks(@Query('courseId') courseId?: string) {
    return this.flashcardsService.listDecks(courseId);
  }

  @Get('decks/:deckId/cards')
  getDeckCards(@Param('deckId') deckId: string, @Req() req: any) {
    return this.flashcardsService.getDeckCards(deckId, req.user.id);
  }

  @Post('decks')
  createDeck(@Body() body: any) {
    return this.flashcardsService.createDeck(body.courseId, body);
  }

  @Post('decks/:deckId/review')
  submitReview(@Param('deckId') deckId: string, @Req() req: any, @Body() body: { cardId: string; difficulty: number }) {
    return this.flashcardsService.submitReview(deckId, req.user.id, body.cardId, body.difficulty);
  }

  @Post('decks/ai-generate')
  aiGenerate(@Body() body: { courseId: string; lessonId: string }) {
    return this.flashcardsService.aiGenerateDeck(body.courseId, body.lessonId);
  }
}
