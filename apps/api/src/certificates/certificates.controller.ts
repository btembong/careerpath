import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "[Student] List the student's own issued certificates" })
  getMyCertificates(@CurrentUser() user: UserProfile) {
    return this.certificatesService.getMyCertificates(user.id);
  }

  @Get('verify/:verifyCode')
  @ApiOperation({ summary: 'Public — verify a certificate is genuine. No auth required.' })
  verifyCertificate(@Param('verifyCode') code: string) {
    return this.certificatesService.verifyCertificate(code);
  }

  @Get(':verifyCode/pdf')
  @ApiOperation({ summary: 'Public — download a certificate PDF by its verification code (generated on request).' })
  async downloadPdf(@Param('verifyCode') code: string, @Res() res: Response) {
    const { buffer, filename } = await this.certificatesService.getPdf(code);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(buffer);
  }

  // ── Admin endpoints ───────────────────────────────────────

  @Post('admin/issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Manually issue a certificate to a student' })
  adminIssue(@Body() body: { studentId: string; courseId: string }) {
    return this.certificatesService.adminIssueCertificate(body.studentId, body.courseId);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Revoke (delete) a certificate by ID' })
  adminRevoke(@Param('id') id: string) {
    return this.certificatesService.adminRevokeCertificate(id);
  }
}
