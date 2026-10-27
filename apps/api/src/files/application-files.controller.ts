import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { RedisService } from '../redis/redis.service';
import { verifiedKey } from '../auth/auth.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOC_TYPES = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

/**
 * Unauthenticated upload for teacher applicants, who have no account until approval.
 * Gated on a recently OTP-verified email so this isn't an open anonymous upload.
 */
@ApiTags('files')
@Controller('files')
export class ApplicationFilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly redis: RedisService,
  ) {}

  @Post('application-doc')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (DOC_TYPES.test(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only PDF and Word documents are allowed'), false);
      },
    }),
  )
  @ApiOperation({ summary: 'Teacher applicant CV upload (requires an OTP-verified email in the last hour)' })
  @ApiConsumes('multipart/form-data')
  async uploadApplicationDoc(
    @UploadedFile() file: Express.Multer.File,
    @Body('email') email: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!email || (await this.redis.get(verifiedKey(email))) !== '1') {
      throw new ForbiddenException('Verify your email address before uploading documents.');
    }
    return this.filesService.upload(file, 'teacher-docs');
  }
}
