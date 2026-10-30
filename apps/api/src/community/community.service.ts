import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@cpa/shared';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { SubmitStoryDto } from './dto/submit-story.dto';
import { ReviewStoryDto } from './dto/review-story.dto';
import { UserProfile } from '@prisma/client';

@Injectable()
export class CommunityService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private notifications: NotificationsService,
  ) {}

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
  // ── Community page (student / teacher) ────────────────────

  /** Courses whose discussion this user may read and post in. */
  private async myCourses(user: UserProfile) {
    const role = user.role as UserRole;
    if (role === UserRole.ADMIN) {
      return this.prisma.platformCourse.findMany({ where: { status: 'PUBLISHED' }, select: { id: true, title: true, teacherId: true }, orderBy: { title: 'asc' }, take: 100 });
    }
    if (role === UserRole.TEACHER) {
      return this.prisma.platformCourse.findMany({ where: { teacherId: user.id }, select: { id: true, title: true, teacherId: true }, orderBy: { title: 'asc' } });
    }
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const [enrolled, bought, packages] = await Promise.all([
      this.prisma.courseEnrollment.findMany({ where: { studentId: user.id }, select: { courseId: true } }),
      this.prisma.coursePurchase.findMany({ where: { studentId: user.id, ...active }, select: { courseId: true } }),
      this.prisma.packagePurchase.findMany({ where: { studentId: user.id, ...active }, select: { package: { select: { courseIds: true } } } }),
    ]);
    const ids = [...new Set([...enrolled.map(e => e.courseId), ...bought.map(b => b.courseId), ...packages.flatMap(p => p.package.courseIds)])];
    return this.prisma.platformCourse.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, select: { id: true, title: true, teacherId: true }, orderBy: { title: 'asc' } });
  }

  private async assertCanPost(courseId: string, user: UserProfile) {
    const courses = await this.myCourses(user);
    const course = courses.find(c => c.id === courseId);
    if (!course) throw new ForbiddenException('You can only post in courses you take or teach');
    return course;
  }

  private nameOf(p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) {
    return p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
  }

  async feed(user: UserProfile, opts: { courseId?: string; show?: string }) {
    const courses = await this.myCourses(user);
    const scope = opts.courseId && courses.some(c => c.id === opts.courseId) ? [opts.courseId] : courses.map(c => c.id);
    const teacherOf = new Map(courses.map(c => [c.id, c.teacherId]));
    const author = { select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true } };

    const posts = await this.prisma.courseDiscussionPost.findMany({
      where: { courseId: { in: scope }, parentId: null },
      include: {
        author,
        replies: { include: { author, upvotes: { where: { userId: user.id }, select: { id: true } } }, orderBy: { createdAt: 'asc' } },
        upvotes: { where: { userId: user.id }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const lessonIds = [...new Set(posts.map(p => p.lessonId).filter((x): x is string => !!x))];
    const lessons = lessonIds.length ? await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } }) : [];
    const lessonTitle = new Map(lessons.map(l => [l.id, l.title]));
    const courseTitle = new Map(courses.map(c => [c.id, c.title]));

    const isStaff = (courseId: string, a: { id: string; role: string }) => a.id === teacherOf.get(courseId) || a.role === 'ADMIN';
    const threads = posts.map(p => {
      const replies = p.replies.map(r => ({
        id: r.id, body: r.body, createdAt: r.createdAt, upvotes: r.upvoteCount, myUpvote: r.upvotes.length > 0,
        author: { id: r.author.id, name: this.nameOf(r.author), avatarUrl: r.author.avatarUrl, isTeacher: isStaff(p.courseId, r.author) },
      }));
      const teacherAnswer = replies.find(r => r.author.isTeacher) ?? null;
      return {
        id: p.id, body: p.body, createdAt: p.createdAt, isPinned: p.isPinned,
        course: { id: p.courseId, title: courseTitle.get(p.courseId) ?? 'Course' },
        lesson: p.lessonId ? { id: p.lessonId, title: lessonTitle.get(p.lessonId) ?? 'Lesson' } : null,
        author: { id: p.author.id, name: this.nameOf(p.author), avatarUrl: p.author.avatarUrl, isTeacher: isStaff(p.courseId, p.author) },
        mine: p.authorId === user.id,
        upvotes: p.upvoteCount, myUpvote: p.upvotes.length > 0,
        // A post by the teacher (an announcement or prompt) needs no answer
        answered: !!teacherAnswer || isStaff(p.courseId, p.author), teacherAnswer, replies,
      };
    });

    const show = ['unanswered', 'recent', 'top', 'mine'].includes(opts.show ?? '') ? opts.show : 'unanswered';
    const list = show === 'mine' ? threads.filter(t => t.mine) : [...threads];
    if (show === 'unanswered') list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || Number(a.answered) - Number(b.answered) || +b.createdAt - +a.createdAt);
    if (show === 'top') list.sort((a, b) => b.upvotes - a.upvotes || +b.createdAt - +a.createdAt);

    const [stories, myStories] = await Promise.all([
      this.prisma.successStorySubmission.findMany({
        where: { status: 'APPROVED', consentToPublish: true },
        include: { student: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { submittedAt: 'desc' }, take: 6,
      }),
      this.prisma.successStorySubmission.findMany({ where: { studentId: user.id }, orderBy: { submittedAt: 'desc' }, take: 3 }),
    ]);

    // Course lessons, so a question can say which lesson it's about
    const courseLessons = opts.courseId && scope.length === 1
      ? await this.prisma.lesson.findMany({ where: { module: { courseId: scope[0] } }, select: { id: true, title: true }, orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }] })
      : [];

    return {
      courses: courses.map(c => ({ id: c.id, title: c.title })),
      courseId: scope.length === 1 ? scope[0] : null,
      show,
      counts: { all: threads.length, unanswered: threads.filter(t => !t.answered).length, mine: threads.filter(t => t.mine).length },
      threads: list,
      lessons: courseLessons,
      stories: stories.map(s => ({ id: s.id, story: s.story, name: (s.student.firstName || this.nameOf(s.student)).split(' ')[0], submittedAt: s.submittedAt })),
      myStories: myStories.map(s => ({ id: s.id, story: s.story, status: s.status, submittedAt: s.submittedAt })),
    };
  }

  async ask(user: UserProfile, dto: { courseId: string; body: string; lessonId?: string; parentId?: string }) {
    const body = String(dto.body ?? '').trim();
    if (body.length < 5 || body.length > 4000) throw new BadRequestException('Write between 5 and 4000 characters');
    const course = await this.assertCanPost(dto.courseId, user);
    let parent: { id: string; authorId: string; courseId: string; parentId: string | null } | null = null;
    if (dto.parentId) {
      parent = await this.prisma.courseDiscussionPost.findUnique({ where: { id: dto.parentId }, select: { id: true, authorId: true, courseId: true, parentId: true } });
      if (!parent || parent.courseId !== course.id) throw new NotFoundException('Question not found in this course');
      if (parent.parentId) throw new BadRequestException('Reply to the question, not to another reply');
    }
    if (dto.lessonId) {
      const ok = await this.prisma.lesson.count({ where: { id: dto.lessonId, module: { courseId: course.id } } });
      if (!ok) throw new NotFoundException('Lesson not found in this course');
    }
    const post = await this.prisma.courseDiscussionPost.create({
      data: { courseId: course.id, authorId: user.id, parentId: parent?.id ?? null, lessonId: parent ? null : dto.lessonId ?? null, body },
    });
    await this.gamification.awardOnce(user.id, 'FORUM_POST', `post:${post.id}`);

    if (parent && parent.authorId !== user.id) {
      this.notifications.notify(parent.authorId, {
        type: 'community', title: user.id === course.teacherId ? 'Your teacher answered your question' : 'New reply to your question',
        body: body.slice(0, 140), href: `/student/community?courseId=${course.id}&thread=${parent.id}`,
      });
    } else if (!parent && course.teacherId !== user.id) {
      this.notifications.notify(course.teacherId, {
        type: 'community', title: `New question in ${course.title}`, body: body.slice(0, 140), href: `/teacher/community?courseId=${course.id}&thread=${post.id}`,
      });
    }
    return post;
  }

  /** Toggle my upvote; the author earns a little XP the first time a given person upvotes. */
  async toggleUpvote(user: UserProfile, postId: string) {
    const post = await this.prisma.courseDiscussionPost.findUnique({ where: { id: postId }, select: { id: true, courseId: true, authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanPost(post.courseId, user);
    if (post.authorId === user.id) throw new BadRequestException("You can't upvote your own post");
    const existing = await this.prisma.discussionUpvote.findUnique({ where: { postId_userId: { postId, userId: user.id } } });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.discussionUpvote.delete({ where: { id: existing.id } }),
        this.prisma.courseDiscussionPost.update({ where: { id: postId }, data: { upvoteCount: { decrement: 1 } } }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.discussionUpvote.create({ data: { postId, userId: user.id } }),
        this.prisma.courseDiscussionPost.update({ where: { id: postId }, data: { upvoteCount: { increment: 1 } } }),
      ]);
      await this.gamification.awardOnce(post.authorId, 'FORUM_UPVOTE_RECEIVED', `upvote:${postId}:${user.id}`);
    }
    const fresh = await this.prisma.courseDiscussionPost.findUnique({ where: { id: postId }, select: { upvoteCount: true } });
    return { upvoted: !existing, upvotes: fresh?.upvoteCount ?? 0 };
  }

  /** Teachers pin a question to the top of their course's discussion. */
  async togglePin(user: UserProfile, postId: string) {
    const post = await this.prisma.courseDiscussionPost.findUnique({ where: { id: postId }, select: { id: true, isPinned: true, parentId: true, courseId: true } });
    if (!post || post.parentId) throw new NotFoundException('Question not found');
    const course = await this.prisma.platformCourse.findUnique({ where: { id: post.courseId }, select: { teacherId: true } });
    if ((user.role as UserRole) !== UserRole.ADMIN && course?.teacherId !== user.id) throw new ForbiddenException('Only the course teacher can pin');
    const updated = await this.prisma.courseDiscussionPost.update({ where: { id: postId }, data: { isPinned: !post.isPinned } });
    return { isPinned: updated.isPinned };
  }
}
