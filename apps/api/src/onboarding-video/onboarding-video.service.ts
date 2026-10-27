import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserProfile } from '@prisma/client';
import { parseVideoUrl, UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { ReportProgressDto, UpsertOnboardingVideoDto } from './onboarding-video.dto';

const AUDIENCE = 'TEACHER';
/** Progress may only advance at roughly real-time speed between reports. */
const MAX_CREDIT_PER_REPORT_SEC = 30;
const SPEED_SLACK = 1.25;
const JITTER_SEC = 2;
/** Treat the last couple of seconds as watched — players often stop just short of the end. */
const END_TOLERANCE_SEC = 2;

@Injectable()
export class OnboardingVideoService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
    private config: ConfigService,
  ) {}

  /** True when the teacher still has to watch the active orientation video. */
  async isPending(userId: string, role: string): Promise<boolean> {
    if (role !== UserRole.TEACHER) return false;
    const video = await this.prisma.onboardingVideo.findUnique({ where: { audience: AUDIENCE } });
    if (!video?.isActive) return false;
    const view = await this.prisma.onboardingVideoView.findUnique({
      where: { userId_videoId_version: { userId, videoId: video.id, version: video.version } },
      select: { completedAt: true },
    });
    return !view?.completedAt;
  }

  async getForUser(user: UserProfile) {
    const video = await this.prisma.onboardingVideo.findUnique({ where: { audience: AUDIENCE } });
    if (user.role !== UserRole.TEACHER || !video?.isActive) return { required: false, video: null, progress: null };

    const view = await this.prisma.onboardingVideoView.findUnique({
      where: { userId_videoId_version: { userId: user.id, videoId: video.id, version: video.version } },
    });
    return {
      required: !view?.completedAt,
      video: {
        id: video.id,
        title: video.title,
        version: video.version,
        durationSec: video.durationSec,
        videoUrl: await this.files.signUrl(video.videoUrl),
        captionsUrl: video.captionsUrl ? await this.files.signUrl(video.captionsUrl) : null,
      },
      progress: { maxWatchedSec: view?.maxWatchedSec ?? 0, completed: !!view?.completedAt },
    };
  }

  async reportProgress(user: UserProfile, dto: ReportProgressDto) {
    const video = await this.prisma.onboardingVideo.findUnique({ where: { audience: AUDIENCE } });
    if (!video?.isActive || video.id !== dto.videoId) throw new NotFoundException('No active onboarding video');

    const key = { userId: user.id, videoId: video.id, version: video.version };
    const now = new Date();
    const view = await this.prisma.onboardingVideoView.upsert({
      where: { userId_videoId_version: key },
      create: { ...key, lastReportAt: now, durationSec: video.durationSec ?? dto.durationSec },
      update: {},
    });
    if (view.completedAt) return { maxWatchedSec: view.maxWatchedSec, completed: true };

    // Only credit as much new progress as wall-clock time allows, so a tampered
    // client can't jump to the end — it has to keep reporting for the real duration.
    const elapsed = Math.min((now.getTime() - view.lastReportAt.getTime()) / 1000, MAX_CREDIT_PER_REPORT_SEC);
    const ceiling = view.maxWatchedSec + elapsed * SPEED_SLACK + JITTER_SEC;
    const duration = video.durationSec ?? view.durationSec ?? dto.durationSec;
    const maxWatchedSec = Math.min(Math.max(view.maxWatchedSec, Math.min(dto.positionSec, ceiling)), duration);
    const completed = maxWatchedSec >= duration - END_TOLERANCE_SEC;

    await this.prisma.onboardingVideoView.update({
      where: { userId_videoId_version: key },
      data: { maxWatchedSec, lastReportAt: now, ...(completed && { completedAt: now }) },
    });
    return { maxWatchedSec, completed };
  }

  // ── Admin ────────────────────────────────────────────────

  async getAdmin() {
    const video = await this.prisma.onboardingVideo.findUnique({ where: { audience: AUDIENCE } });
    const [teachers, completed] = await Promise.all([
      this.prisma.userProfile.count({ where: { role: UserRole.TEACHER, approvalStatus: 'APPROVED' } }),
      video
        ? this.prisma.onboardingVideoView.count({
            where: { videoId: video.id, version: video.version, completedAt: { not: null } },
          })
        : 0,
    ]);
    return {
      video: video && {
        ...video,
        previewUrl: await this.files.signUrl(video.videoUrl),
      },
      stats: { teachers, completed },
    };
  }

  async upsert(dto: UpsertOnboardingVideoDto) {
    this.assertOwnFile(dto.videoUrl, 'Video');
    if (dto.captionsUrl) this.assertOwnFile(dto.captionsUrl, 'Captions');

    const existing = await this.prisma.onboardingVideo.findUnique({ where: { audience: AUDIENCE } });
    const data = {
      title: dto.title.trim(),
      videoUrl: dto.videoUrl,
      captionsUrl: dto.captionsUrl || null,
      durationSec: dto.durationSec ?? null,
      isActive: dto.isActive,
    };
    if (!existing) {
      return this.prisma.onboardingVideo.create({ data: { audience: AUDIENCE, ...data } });
    }
    return this.prisma.onboardingVideo.update({
      where: { audience: AUDIENCE },
      data: { ...data, ...(dto.requireRewatch && { version: existing.version + 1 }) },
    });
  }

  /** No-skip playback needs a file we serve ourselves; YouTube/Vimeo controls can't be locked down. */
  private assertOwnFile(url: string, label: string) {
    const parsed = parseVideoUrl(url);
    const r2Base = this.config.get<string>('R2_PUBLIC_URL', '');
    if (parsed?.kind !== 'file' || !r2Base || !parsed.src.startsWith(r2Base)) {
      throw new BadRequestException(`${label} must be a file uploaded to CareerPath storage, not a YouTube/Vimeo link.`);
    }
  }
}
