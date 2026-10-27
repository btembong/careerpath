import {
  Injectable,
  Logger,
  UnauthorizedException,
  Inject,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios, { AxiosInstance } from 'axios';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * All WordPress REST API communication lives here.
 * NestJS is the ONLY layer that ever touches WordPress — never the frontend.
 *
 * Password verification relies on a small mu-plugin installed on the WP site
 * that exposes POST /wp-json/cpa/v1/verify-password (see wordpress/mu-plugins/cpa-bridge.php).
 */
@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;

  // Cache TTLs (ms)
  private readonly USER_TTL = 2 * 60 * 1000;    // 2 min — user data changes rarely
  private readonly COURSE_TTL = 5 * 60 * 1000;  // 5 min — course list changes rarely

  constructor(
    private config: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.baseUrl = config.getOrThrow<string>('WP_BASE_URL');

    const adminUser = config.getOrThrow<string>('WP_ADMIN_USER');
    const adminAppPassword = config.getOrThrow<string>('WP_ADMIN_APP_PASSWORD');
    const basicToken = Buffer.from(`${adminUser}:${adminAppPassword}`).toString('base64');

    this.client = axios.create({
      baseURL: `${this.baseUrl}/wp-json`,
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  /** True when WP credentials are not yet configured — enables local dev/testing. */
  private get devBypass(): boolean {
    const user = this.config.get<string>('WP_ADMIN_USER', '');
    const bypass = user === 'your_wp_admin_username' || user === '';
    // SAFETY: never allow dev bypass in production
    if (bypass && process.env.NODE_ENV === 'production') {
      this.logger.error('WP_ADMIN_USER is not configured — dev bypass blocked in production');
      return false;
    }
    return bypass;
  }

  /**
   * Verify a user's password against WordPress via the CPA mu-plugin.
   * Not cached — passwords must always be verified live.
   *
   * DEV BYPASS: When WP credentials are not configured, accepts any password
   * for known local test accounts and returns a mock WpUser.
   */
  /** Stable numeric ID derived from email — avoids wpUserId unique-constraint collisions in dev. */
  private devWpId(email: string): number {
    let h = 5381;
    for (let i = 0; i < email.length; i++) h = ((h << 5) + h) ^ email.charCodeAt(i);
    return Math.abs(h % 900000) + 100000; // 6-digit positive int
  }

  /**
   * Local demo logins from DEMO_ACCOUNTS ("email:password:ROLE,..."), checked before WordPress
   * so presentations work offline. Ignored entirely when NODE_ENV=production.
   */
  private demoAccount(email: string): { password: string; role: 'ADMIN' | 'TEACHER' | 'STUDENT' } | null {
    const raw = this.config.get<string>('DEMO_ACCOUNTS', '');
    if (!raw) return null;
    if (process.env.NODE_ENV === 'production') {
      this.logger.error('DEMO_ACCOUNTS is set but ignored in production');
      return null;
    }
    for (const entry of raw.split(',')) {
      const [e, password, role] = entry.trim().split(':');
      if (e?.toLowerCase() === email.toLowerCase() && password && ['ADMIN', 'TEACHER', 'STUDENT'].includes(role)) {
        return { password, role: role as 'ADMIN' | 'TEACHER' | 'STUDENT' };
      }
    }
    return null;
  }

  async verifyPassword(email: string, password: string): Promise<WpUser> {
    const demo = this.demoAccount(email);
    if (demo) {
      const a = createHash('sha256').update(password).digest();
      const b = createHash('sha256').update(demo.password).digest();
      if (!timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid email or password');
      this.logger.warn(`[DEMO] local demo login for ${email}`);
      const roles = { ADMIN: ['administrator'], TEACHER: ['tutor_instructor'], STUDENT: ['subscriber'] }[demo.role];
      const local = email.split('@')[0];
      return { id: -this.devWpId(email.toLowerCase()), email, name: local, first_name: '', last_name: '', roles };
    }

    if (this.devBypass) {
      this.logger.warn(`[DEV] WP bypass active — skipping real WP auth for ${email}`);
      const id = this.devWpId(email);
      const lc = email.toLowerCase();
      const roles = lc.includes('admin') ? ['administrator']
                  : lc.includes('teacher') || lc.includes('author') ? ['author']
                  : ['subscriber'];
      return { id, email, name: email.split('@')[0], first_name: email.split('@')[0], last_name: 'Test', roles };
    }
    try {
      const res = await this.client.post<WpUser>('/cpa/v1/verify-password', {
        email,
        password,
        secret: this.config.getOrThrow<string>('WP_BRIDGE_SECRET'),
        include_avatar: true,
      });
      return res.data;
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new UnauthorizedException('Invalid email or password');
      }
      this.logger.error('WP password verification failed', err.message);
      throw new UnauthorizedException('Authentication service unavailable');
    }
  }

  /**
   * Create a new WordPress user (student or teacher registration).
   * Not cached — write operation.
   *
   * DEV BYPASS: When WP credentials are not configured, returns a fake WP user ID.
   */
  async createUser(data: CreateWpUserDto): Promise<number> {
    if (this.devBypass) {
      this.logger.warn(`[DEV] WP bypass active — skipping real WP user creation for ${data.email}`);
      return this.devWpId(data.email);
    }
    // WP usernames only allow [a-zA-Z0-9 _.@-] and max 60 chars (sanitize_user strict mode)
    const base = data.username.replace(/[^a-zA-Z0-9 _.@-]/g, '-').slice(0, 60);
    const candidates = [base, `${base.slice(0, 53)}-${Math.random().toString(36).slice(2, 8)}`];

    for (const username of candidates) {
      try {
        const res = await this.client.post<{ id: number }>('/wp/v2/users', {
          username,
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          roles: [data.wpRole],
        }, { timeout: 30_000 });
        return res.data.id;
      } catch (err: any) {
        const wpCode: string | undefined = err.response?.data?.code;
        if (wpCode === 'existing_user_login') continue;
        if (wpCode === 'existing_user_email') {
          throw new ConflictException('An account with this email already exists. Please log in instead.');
        }
        this.logger.error('WP user creation failed', err.response?.data ?? err.message);
        if (err.response?.status === 400) {
          throw new BadRequestException(err.response.data?.message ?? 'Invalid registration details.');
        }
        throw new ServiceUnavailableException('Account service is temporarily unavailable. Please try again.');
      }
    }
    throw new ConflictException('Could not reserve a username for this email. Please contact support.');
  }

  /**
   * Fetch a WP user by ID — cached for 2 minutes.
   * Every authenticated request calls this to sync profile data.
   */
  async getUserById(wpUserId: number): Promise<WpUser> {
    const cacheKey = `wp:user:${wpUserId}`;
    const cached = await this.cache.get<WpUser>(cacheKey);
    if (cached) return cached;

    const res = await this.client.get<WpUser>(`/wp/v2/users/${wpUserId}`);
    await this.cache.set(cacheKey, res.data, this.USER_TTL);
    return res.data;
  }

  /**
   * Invalidate a user's cache entry — call after profile updates.
   */
  async invalidateUserCache(wpUserId: number): Promise<void> {
    await this.cache.del(`wp:user:${wpUserId}`);
  }

  /**
   * Fetch all published WP courses — cached for 5 minutes.
   * Paginated internally; returns all pages merged into one array.
   */
  async getCourses(perPage = 100): Promise<WpCourse[]> {
    const cacheKey = `wp:courses:all`;
    const cached = await this.cache.get<WpCourse[]>(cacheKey);
    if (cached) return cached;

    const res = await this.client.get<WpCourse[]>('/wp/v2/courses', {
      params: { per_page: perPage, status: 'publish', _embed: true },
    });
    await this.cache.set(cacheKey, res.data, this.COURSE_TTL);
    return res.data;
  }

  /**
   * Fetch a single WP course by ID — cached for 5 minutes.
   */
  async getCourseById(courseId: number): Promise<WpCourse> {
    const cacheKey = `wp:course:${courseId}`;
    const cached = await this.cache.get<WpCourse>(cacheKey);
    if (cached) return cached;

    const res = await this.client.get<WpCourse>(`/wp/v2/courses/${courseId}`, {
      params: { _embed: true },
    });
    await this.cache.set(cacheKey, res.data, this.COURSE_TTL);
    return res.data;
  }

  /**
   * Invalidate all course caches — call after a WP course is updated.
   */
  async invalidateCourseCache(courseId?: number): Promise<void> {
    await this.cache.del('wp:courses:all');
    if (courseId) await this.cache.del(`wp:course:${courseId}`);
  }

  /**
   * Fetch ALL WordPress users across all pages — for bulk DB import.
   * Not cached — admin-triggered sync operation.
   */
  async listAllUsers(): Promise<WpUser[]> {
    if (this.devBypass) {
      this.logger.warn('[DEV] WP bypass active — returning empty user list for sync');
      return [];
    }
    const all: WpUser[] = [];
    let page = 1;
    while (true) {
      const res = await this.client.get<WpUser[]>('/wp/v2/users', {
        params: { per_page: 100, page, context: 'edit' },
      });
      const batch: WpUser[] = res.data;
      if (!batch.length) break;
      all.push(...batch);
      const total = Number(res.headers['x-wp-totalpages'] ?? 1);
      if (page >= total) break;
      page++;
    }
    return all;
  }

  /**
   * Enroll a WP user in a WP course via the CPA mu-plugin.
   * Supports LearnDash, LifterLMS, WP Courseware, or a custom action hook.
   * Non-fatal — portal enrollment succeeds even if WP LMS enrollment fails.
   */
  async enrollUserInCourse(wpUserId: number, wpCourseId: number): Promise<void> {
    if (this.devBypass) {
      this.logger.warn(`[DEV] WP bypass — skipping WP enrollment for user ${wpUserId} in course ${wpCourseId}`);
      return;
    }
    try {
      await this.client.post('/cpa/v1/enroll-course', {
        user_id: wpUserId,
        course_id: wpCourseId,
        secret: this.config.getOrThrow<string>('WP_BRIDGE_SECRET'),
      });
    } catch (err: any) {
      this.logger.warn(`WP enrollment failed for user ${wpUserId} in course ${wpCourseId}: ${err.message}`);
    }
  }

  /**
   * Trigger WordPress's built-in password reset email via the CPA mu-plugin.
   */
  async triggerPasswordReset(email: string): Promise<void> {
    try {
      await this.client.post('/cpa/v1/forgot-password', {
        email,
        secret: this.config.getOrThrow<string>('WP_BRIDGE_SECRET'),
      });
    } catch (err: any) {
      // Silently swallow — we never confirm whether an email exists (security)
      this.logger.warn('WP password reset trigger failed', err.message);
    }
  }

  /**
   * Complete WordPress's password reset flow with the key from the email.
   */
  async resetPassword(login: string, key: string, newPassword: string): Promise<void> {
    await this.client.post('/cpa/v1/reset-password', {
      login,
      key,
      password: newPassword,
      secret: this.config.getOrThrow<string>('WP_BRIDGE_SECRET'),
    });
  }
}

// ── Types ─────────────────────────────────────────────────

/** Tutor LMS instructors (`tutor_instructor`) are the live site's teachers; `author` is what portal sign-ups get. */
export function portalRoleFromWp(roles: string[]): 'ADMIN' | 'TEACHER' | 'STUDENT' {
  if (roles.includes('administrator')) return 'ADMIN';
  if (roles.includes('author') || roles.includes('tutor_instructor')) return 'TEACHER';
  return 'STUDENT';
}

export interface WpUser {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  roles: string[];
  avatar_urls?: Record<string, string>;
}

export interface WpCourse {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  status: string;
  link: string;
  featured_media: number;
  author: number;
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
      media_details?: { sizes?: { medium?: { source_url: string }; large?: { source_url: string } } };
    }>;
    author?: Array<{ id: number; name: string; avatar_urls?: Record<string, string> }>;
  };
}

export function wpCourseImageUrl(course: WpCourse): string | null {
  const media = course._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return null;
  return (
    media.media_details?.sizes?.large?.source_url ??
    media.media_details?.sizes?.medium?.source_url ??
    media.source_url
  );
}

export interface CreateWpUserDto {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  wpRole: 'subscriber' | 'author'; // subscriber = student, author = teacher (pre-approval)
}
