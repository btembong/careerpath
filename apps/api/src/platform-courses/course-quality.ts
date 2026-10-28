/** Course readiness rules shared by the builder panel, the reviewer view and submit-for-review. */

export interface ChecklistLesson {
  title: string;
  type: string;
  videoUrl: string | null;
  content: string | null;
  chapters: unknown;
  questionCount: number;
}
export interface ChecklistCourse {
  coverUrl: string | null;
  shortDescription: string | null;
  modules: { title: string; lessons: ChecklistLesson[] }[];
}
export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  /** Required items block submit-for-review; the rest are recommendations. */
  required: boolean;
  detail?: string;
}

export const MIN_QUIZ_QUESTIONS = 3;
const MIN_SHORT_DESCRIPTION = 40;

const stripHtml = (s: string | null) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function courseChecklist(course: ChecklistCourse): ChecklistItem[] {
  const lessons = course.modules.flatMap(m => m.lessons);
  const videos = lessons.filter(l => l.type === 'VIDEO');
  const texts = lessons.filter(l => l.type === 'TEXT');
  const quizzes = lessons.filter(l => l.type === 'QUIZ');

  const emptyModules = course.modules.filter(m => m.lessons.length === 0);
  const videosWithout = videos.filter(l => !l.videoUrl?.trim());
  const textsWithout = texts.filter(l => stripHtml(l.content).length < 20);
  const realQuizzes = quizzes.filter(q => q.questionCount >= MIN_QUIZ_QUESTIONS);
  const modulesWithoutQuiz = course.modules.filter(m => m.lessons.length && !m.lessons.some(l => l.type === 'QUIZ'));
  const videosWithoutChapters = videos.filter(l => !Array.isArray(l.chapters) || !l.chapters.length);
  const shortDesc = (course.shortDescription ?? '').trim();

  const names = (ls: { title: string }[]) => ls.slice(0, 3).map(l => `"${l.title}"`).join(', ') + (ls.length > 3 ? '…' : '');

  return [
    { key: 'cover', label: 'Cover image', required: true, ok: !!course.coverUrl },
    {
      key: 'short-description', label: `Short description (at least ${MIN_SHORT_DESCRIPTION} characters)`, required: true,
      ok: shortDesc.length >= MIN_SHORT_DESCRIPTION,
      detail: shortDesc.length ? `${shortDesc.length} characters so far` : undefined,
    },
    {
      key: 'modules', label: 'At least 2 modules', required: true, ok: course.modules.length >= 2,
      detail: plural(course.modules.length, 'module'),
    },
    {
      key: 'no-empty-modules', label: 'Every module has a lesson', required: true,
      ok: course.modules.length > 0 && emptyModules.length === 0,
      detail: emptyModules.length ? `Empty: ${names(emptyModules)}` : undefined,
    },
    {
      key: 'videos-have-video', label: 'Every video lesson has a video', required: true, ok: videosWithout.length === 0,
      detail: videosWithout.length ? `Missing: ${names(videosWithout)}` : undefined,
    },
    {
      key: 'texts-have-content', label: 'Every text lesson has content', required: true, ok: textsWithout.length === 0,
      detail: textsWithout.length ? `Empty or very short: ${names(textsWithout)}` : undefined,
    },
    {
      key: 'has-quiz', label: `At least one quiz with ${MIN_QUIZ_QUESTIONS}+ questions`, required: true, ok: realQuizzes.length > 0,
      detail: quizzes.length && !realQuizzes.length ? `Quizzes need at least ${MIN_QUIZ_QUESTIONS} questions` : undefined,
    },
    {
      key: 'quiz-per-module', label: 'A quiz in every module', required: false, ok: course.modules.length > 0 && modulesWithoutQuiz.length === 0,
      detail: modulesWithoutQuiz.length ? `No quiz: ${names(modulesWithoutQuiz)}` : undefined,
    },
    {
      key: 'video-chapters', label: 'Chapters on video lessons', required: false, ok: videos.length > 0 && videosWithoutChapters.length === 0,
      detail: videosWithoutChapters.length ? `${plural(videosWithoutChapters.length, 'video')} without chapters` : undefined,
    },
    { key: 'summary', label: 'A summary or revision lesson', required: false, ok: lessons.some(l => /summary|recap|revision|review/i.test(l.title)) },
  ];
}

/** Starter structure for an empty course. Lesson content is left blank for the teacher to fill in. */
export const COURSE_TEMPLATE: { title: string; lessons: { title: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' }[] }[] = [
  {
    title: 'Module 1 · Introduction',
    lessons: [
      { title: 'Welcome & how this course works', type: 'VIDEO' },
      { title: 'Course overview and exam requirements', type: 'TEXT' },
      { title: 'Check your starting level', type: 'QUIZ' },
    ],
  },
  {
    title: 'Module 2 · Core content',
    lessons: [
      { title: 'Key concepts', type: 'VIDEO' },
      { title: 'Worked examples', type: 'VIDEO' },
      { title: 'Summary', type: 'TEXT' },
      { title: 'Module check', type: 'QUIZ' },
    ],
  },
  {
    title: 'Module 3 · Exam practice',
    lessons: [
      { title: 'Exam technique', type: 'VIDEO' },
      { title: 'Revision summary', type: 'TEXT' },
      { title: 'Practice test', type: 'QUIZ' },
    ],
  },
];
