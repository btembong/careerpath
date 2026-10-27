import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(@Req() req: any, @Query('lessonId') lessonId: string) {
    return this.notesService.listNotes(req.user.id, lessonId);
  }

  @Post()
  create(@Req() req: any, @Body() body: { lessonId: string; timestamp?: number; body: string }) {
    return this.notesService.createNote(req.user.id, body);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: { body: string }) {
    return this.notesService.updateNote(id, req.user.id, body.body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.notesService.deleteNote(id, req.user.id);
  }

  @Get('export/:courseId')
  export(@Req() req: any, @Param('courseId') courseId: string) {
    return this.notesService.exportNotesPdf(req.user.id, courseId);
  }

  // Bookmarks
  @Get('bookmarks')
  bookmarks(@Req() req: any, @Query('lessonId') lessonId?: string) {
    return this.notesService.listBookmarks(req.user.id, lessonId);
  }

  @Post('bookmarks')
  addBookmark(@Req() req: any, @Body() body: { lessonId: string; timestamp: number; label?: string }) {
    return this.notesService.addBookmark(req.user.id, body);
  }

  @Delete('bookmarks/:id')
  deleteBookmark(@Req() req: any, @Param('id') id: string) {
    return this.notesService.deleteBookmark(id, req.user.id);
  }
}
