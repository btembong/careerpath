import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Shapes returned by Tutor LMS 4.2 (only the fields the import uses) */
export interface TutorItem { ID: number; post_title: string; post_content: string; post_type: string; menu_order: number }
export interface TutorTopic { id: number; title: string; summary: string; contents: TutorItem[] }
export interface TutorLesson { ID: number; post_title: string; post_content: string; topic_id: number; attachments: any; thumbnail: any; video: any }
export interface TutorAnswer { answer_id: string; answer_title: string; is_correct: string; image_id: string; answer_two_gap_match: string; answer_view_format: string; answer_order: string }
export interface TutorQuestion { question_id: string; question_title: string; question_description: string; question_type: string; question_mark: string; question_settings: string; question_answers: TutorAnswer[] }
export interface TutorQuiz { ID: number; post_title: string; post_content: string; quiz_settings: Record<string, any>[]; quiz_questions: TutorQuestion[] }

/**
 * Read-only client for the Tutor LMS REST API on the WordPress site.
 * The API key and secret go in Tutor-Api-Key / Tutor-Api-Secret headers (a Basic header is taken by
 * WordPress's Application Passwords first). Quizzes also need a user token from auth/login.
 */
@Injectable()
export class TutorClient {
  private readonly logger = new Logger(TutorClient.name);
  private token: { access: string; refresh: string; until: number } | null = null;

  constructor(private config: ConfigService) {}

  get configured() {
    return !!(this.config.get('WP_BASE_URL') && this.config.get('TUTOR_API_KEY') && this.config.get('TUTOR_API_SECRET'));
  }
  get canReadQuizzes() {
    return this.configured && !!(this.config.get('TUTOR_WP_USERNAME') && this.config.get('TUTOR_WP_PASSWORD'));
  }

  private get base() { return `${this.config.get<string>('WP_BASE_URL')!.replace(/\/$/, '')}/wp-json/tutor/v1`; }
  private get keyHeaders() {
    return { 'Tutor-Api-Key': this.config.get<string>('TUTOR_API_KEY')!, 'Tutor-Api-Secret': this.config.get<string>('TUTOR_API_SECRET')!, Accept: 'application/json' };
  }

  /** The site can be slow: allow a long wait, and retry network errors and 5xx twice */
  private async call<T>(path: string, init: RequestInit = {}, needsUser = false, emptyOn404?: T): Promise<T> {
    // With the WordPress login available, always send the user token too: without it Tutor answers
    // "not allowed" for some courses instead of saying what's wrong
    const withUser = needsUser || this.canReadQuizzes;
    if (!this.configured) throw new ServiceUnavailableException('Tutor LMS is not connected (TUTOR_API_KEY and TUTOR_API_SECRET)');
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const headers: Record<string, string> = { ...this.keyHeaders, ...(init.headers as Record<string, string> | undefined) };
        if (withUser) headers['Tutor-User-Token'] = await this.userToken();
        const res = await fetch(this.base + path, { ...init, headers, signal: AbortSignal.timeout(180_000) });
        const body: any = await res.json().catch(() => null);
        if (res.status === 401 && withUser && attempt === 0) { this.token = null; continue; }
        if (res.status === 404 && emptyOn404 !== undefined && body?.code?.startsWith('tutor_')) return emptyOn404;
        if (res.status >= 500) { lastErr = new Error(`Tutor ${res.status} on ${path}`); continue; }
        if (!res.ok) throw new ServiceUnavailableException(`Tutor said ${res.status}${body?.message ? `: ${body.message}` : ''} (${path.split('?')[0]})`);
        return (body?.data ?? body) as T;
      } catch (e) {
        if (e instanceof ServiceUnavailableException) throw e;
        lastErr = e;
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
    throw new ServiceUnavailableException(`Could not reach Tutor LMS: ${(lastErr as Error)?.message ?? 'no answer'}`);
  }

  /** A user token for quizzes, refreshed before it runs out (they last 24 hours) */
  private async userToken(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 5 * 60_000) return this.token.access;
    if (!this.canReadQuizzes) throw new ServiceUnavailableException('Reading quizzes needs TUTOR_WP_USERNAME and TUTOR_WP_PASSWORD');
    const post = async (path: string, body: object) => {
      const res = await fetch(this.base + path, { method: 'POST', headers: { ...this.keyHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      const j: any = await res.json().catch(() => null);
      return res.ok && j?.data?.access_token ? j.data : null;
    };
    const d = (this.token && await post('/auth/refresh', { refresh_token: this.token.refresh }))
      || await post('/auth/login', { username: this.config.get('TUTOR_WP_USERNAME'), password: this.config.get('TUTOR_WP_PASSWORD') });
    if (!d) throw new ServiceUnavailableException('Tutor LMS refused the WordPress login used to read quizzes');
    this.token = { access: d.access_token, refresh: d.refresh_token, until: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
    this.logger.log('Signed in to Tutor LMS to read quizzes');
    return this.token.access;
  }

  /** An empty list when the course has no topics in Tutor yet */
  courseContents(wpCourseId: number) { return this.call<TutorTopic[]>(`/course-contents/${wpCourseId}`, {}, false, []); }
  course(wpCourseId: number) { return this.call<Record<string, any>>(`/courses/${wpCourseId}`); }
  lessons(topicId: number) { return this.call<TutorLesson[]>(`/lessons?topic_id=${topicId}`, {}, false, []); }
  quiz(quizId: number) { return this.call<TutorQuiz>(`/quizzes/${quizId}`, {}, true); }
}
