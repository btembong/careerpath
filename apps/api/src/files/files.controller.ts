import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_TYPES = /^(application\/pdf|image\/(jpeg|png|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Roles(UserRole.TEACHER, UserRole.STUDENT, UserRole.ADMIN, UserRole.COUNTRY_REP, UserRole.SUBJECT_REVIEWER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF, DOCX, JPG, and PNG files are allowed'), false);
        }
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload a file (teacher credentials or assignment submission). Returns a URL.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiQuery({
    name: 'folder',
    enum: ['teacher-docs', 'submissions', 'avatars', 'messages'],
    required: true,
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: 'teacher-docs' | 'submissions' | 'avatars' | 'messages',
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!['teacher-docs', 'submissions', 'avatars', 'messages'].includes(folder)) {
      throw new BadRequestException('folder must be teacher-docs, submissions, avatars or messages');
    }
    return this.filesService.upload(file, folder);
  }

  @Post('video-upload-url')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get a pre-signed URL to PUT a video straight to R2. ' +
      'Teachers → intro-videos (100 MB); admins → onboarding-videos (500 MB, or 1 MB .vtt captions).',
  })
  async videoUploadUrl(
    @CurrentUser() user: UserProfile,
    @Body('contentType') contentType: string,
    @Body('size') size: number,
    @Body('purpose') purpose?: string,
  ) {
    const isAdmin = user.role === UserRole.ADMIN;
    const isLesson = purpose === 'lesson';
    // Admins may also upload WebVTT captions for the orientation video
    const isCaptions = isAdmin && !isLesson && contentType === 'text/vtt';
    if (!VIDEO_TYPES.includes(contentType) && !isCaptions) {
      throw new BadRequestException('Only MP4, MOV and WebM videos are allowed');
    }
    const maxBytes = (isCaptions ? 1 : isLesson || isAdmin ? 500 : 100) * 1024 * 1024;
    if (!Number.isInteger(size) || size <= 0 || size > maxBytes) {
      throw new BadRequestException(`Video must be at most ${maxBytes / 1024 / 1024} MB`);
    }
    const folder = isLesson ? 'lesson-videos' : isAdmin ? 'onboarding-videos' : 'intro-videos';
    return this.filesService.presignedVideoUpload(folder, contentType, size);
  }
}
