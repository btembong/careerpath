import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { SubmitStoryDto } from './dto/submit-story.dto';
import { ReviewStoryDto } from './dto/review-story.dto';
import { UserProfile } from '@prisma/client';

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  // ── Course discussion ─────────────────────────────────────

  async getDiscussion(courseId: string) {
    const posts = await this.prisma.courseDiscussionPost.findMany({
      where: { courseId, parentId: null }, // top-level only
      include: {
        author: { select: { email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch replies for each top-level post
    const postIds = posts.map((p) => p.id);
    const replies = await this.prisma.courseDiscussionPost.findMany({
      where: { parentId: { in: postIds } },
      include: { author: { select: { email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const replyMap = new Map<string, typeof replies>();
    for (const r of replies) {
      const existing = replyMap.get(r.parentId!) ?? [];
      existing.push(r);
      replyMap.set(r.parentId!, existing);
    }

    return posts.map((p) => ({
      ...p,
      replies: replyMap.get(p.id) ?? [],
    }));
  }

  async createPost(courseId: string, author: UserProfile, dto: CreatePostDto) {
    if (dto.parentId) {
      const parent = await this.prisma.courseDiscussionPost.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.courseId !== courseId) {
        throw new NotFoundException('Parent post not found in this course');
      }
    }

    return this.prisma.courseDiscussionPost.create({
      data: {
        courseId,
        authorId: author.id,
        parentId: dto.parentId ?? null,
        body: dto.body,
      },
      include: { author: { select: { email: true, role: true } } },
    });
  }

  // ── Success stories ───────────────────────────────────────

  async submitStory(student: UserProfile, dto: SubmitStoryDto) {
    return this.prisma.successStorySubmission.create({
      data: {
        studentId: student.id,
        story: dto.story,
        consentToPublish: dto.consentToPublish,
        status: 'PENDING',
      },
    });
  }

  async getStoryQueue() {
    return this.prisma.successStorySubmission.findMany({
      where: { status: 'PENDING' },
      include: { student: { select: { email: true } } },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async reviewStory(id: string, dto: ReviewStoryDto) {
    const story = await this.prisma.successStorySubmission.findUnique({ where: { id } });
    if (!story) throw new NotFoundException('Story not found');

    return this.prisma.successStorySubmission.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  /** Published stories — public-facing on the marketing site */
  async getPublishedStories() {
    return this.prisma.successStorySubmission.findMany({
      where: { status: 'APPROVED', consentToPublish: true },
      include: { student: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
