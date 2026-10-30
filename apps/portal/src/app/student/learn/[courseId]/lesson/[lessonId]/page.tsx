'use client';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { VideoPlayer, type Chapter, type VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import { LessonMediaExtras } from '@/components/learning/LessonMediaExtras';
import { LessonPractice } from '@/components/learning/LessonPractice';
import { parseVideoUrl } from '@cpa/shared';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import _ReactMarkdown from 'react-markdown';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactMarkdown = _ReactMarkdown as any;
import { Scroll } from '@/components/ui/Scroll';

type RightPanel = 'none' | 'notes' | 'ai';

interface Attachment { id: string; name: string; url: string; fileType: string | null; }
interface Lesson {
  id: string; title: string; type: string; videoUrl: string | null;
  content: string | null; sortOrder: number; isFree: boolean; durationSecs: number | null;
  passMark: number | null; timeLimitSecs: number | null; maxAttempts: number; shuffleQuestions: boolean;
  attachments: Attachment[];
  chapters?: Chapter[] | null;
  transcript?: string | null;
  /** A smaller copy exists for Data saver (uploaded videos only) */
  hasDataSaver?: boolean;
  progress: { completed: boolean; watchedSecs: number; positionSecs?: number } | null;
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface ProgressData {
  courseId: string; totalLessons: number; completedLessons: number; percentComplete: number;
  modules: Module[];
}
interface QuizQuestion {
  id: string; questionText: string; type: 'MCQ' | 'SHORT_ANSWER' | 'WRITTEN';
  options: { id: string; text: string }[] | null;
}
interface QuizResult {
  questionId: string; questionText: string; type: string;
  options: { id: string; text: string }[] | null;
  yourAnswer: string | null; correctAnswer: string | null;
  isCorrect: boolean | null; explanation: string | null;
}
interface QuizAttemptSummary {
  id: string; autoScore: number; finalScore: number; maxScore: number;
  passed: boolean; isFullyGraded: boolean; submittedAt: string;
}
interface DiscussionAuthor { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null; }
interface DiscussionReply { id: string; body: string; createdAt: string; author: DiscussionAuthor; }
interface DiscussionPost { id: string; body: string; createdAt: string; author: DiscussionAuthor; replies: DiscussionReply[]; }

// ── Quiz player states ────────────────────────────────────
type QuizState = 'idle' | 'in_progress' | 'submitted';

export default function StudentLessonPlayerPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');

  // Dark / light player theme
  const [playerTheme, setPlayerTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('cpa_player_theme') as 'dark' | 'light') ?? 'dark';
  });
  function toggleTheme() {
    setPlayerTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('cpa_player_theme', next);
      return next;
    });
  }

  // ── Content protection ──────────────────────────────────
  // Ref scopes copy-blocking to the main lesson content area only
  // (notes/AI panels sit outside this ref and remain freely copyable)
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Block save-page (Ctrl+S), view-source (Ctrl+U), print (Ctrl+P)
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (k === 's' || k === 'u' || k === 'p')) e.preventDefault();
      // PrintScreen — browsers vary; this suppresses it in Edge/Chrome where possible
      if (k === 'printscreen') e.preventDefault();
    };

    // 2. Intercept copy events within the lesson content area
    const onCopy = (e: ClipboardEvent) => {
      if (!contentRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const anchor = sel.anchorNode;
      // Only block if the selection starts inside the protected content area
      if (anchor && contentRef.current.contains(anchor as Node)) {
        e.clipboardData?.setData('text/plain', '');
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
    };
  }, []);

  // Quiz state
  const [quizState,    setQuizState]    = useState<QuizState>('idle');
  const [quizQuestions,setQuizQuestions]= useState<QuizQuestion[]>([]);
  const [quizAnswers,  setQuizAnswers]  = useState<Record<string, string>>({});
  const [quizResults,  setQuizResults]  = useState<QuizResult[] | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptSummary[]>([]);
  const [quizScore,    setQuizScore]    = useState<{ percentage: number; passed: boolean } | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [timeLeft,     setTimeLeft]     = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadProgress() {
    const r = await api.get(`/platform-courses/${courseId}/progress`);
    setProgress(r.data);
  }

  useEffect(() => {
    api.post(`/platform-courses/${courseId}/enroll`).catch(() => {})
      .then(() => loadProgress())
      .finally(() => setLoading(false));
  }, [courseId]);

  // When lessonId changes, reset quiz state and load quiz data
  useEffect(() => {
    setQuizState('idle');
    setQuizResults(null);
    setQuizAnswers({});
    setQuizScore(null);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(null);
  }, [lessonId]);

  async function markComplete(lesson: Lesson) {
    try {
      // Study time comes from real playback reports, not the lesson length
      await api.post(`/platform-courses/${courseId}/progress/${lesson.id}/complete`, {});
      await loadProgress();
      // Auto-advance to next lesson
      const allLessons = progress?.modules.flatMap(m => m.lessons) ?? [];
      const idx = allLessons.findIndex(l => l.id === lesson.id);
      if (idx >= 0 && idx < allLessons.length - 1) {
        router.push(`/student/learn/${courseId}/lesson/${allLessons[idx + 1].id}`);
      }
    } catch {}
  }

  // ── Quiz actions ──────────────────────────────────────────
  async function startQuiz(lesson: Lesson) {
    try {
      const [qRes, aRes] = await Promise.all([
        api.get(`/platform-courses/${courseId}/lessons/${lessonId}/questions`),
        api.get(`/platform-courses/${courseId}/lessons/${lessonId}/quiz/attempts`),
      ]);
      let questions: QuizQuestion[] = qRes.data ?? [];
      if (lesson.shuffleQuestions) questions = [...questions].sort(() => Math.random() - 0.5);
      setQuizQuestions(questions);
      setQuizAttempts(aRes.data ?? []);
      setQuizAnswers({});
      setQuizState('in_progress');
      // Start timer if configured
      if (lesson.timeLimitSecs) {
        setTimeLeft(lesson.timeLimitSecs);
        timerRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t === null || t <= 1) {
              clearInterval(timerRef.current!);
              return 0;
            }
            return t - 1;
          });
        }, 1000);
      }
    } catch { }
  }

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && quizState === 'in_progress') {
      const lesson = progress?.modules.flatMap(m => m.lessons).find(l => l.id === lessonId);
      if (lesson) submitQuiz(lesson);
    }
  }, [timeLeft]);

  async function submitQuiz(lesson: Lesson) {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmittingQuiz(true);
    try {
      const res = await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/quiz/submit`, { answers: quizAnswers });
      setQuizResults(res.data.results);
      setQuizScore({ percentage: res.data.percentage, passed: res.data.passed });
      setQuizState('submitted');
      await loadProgress();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Submission failed');
    } finally { setSubmittingQuiz(false); }
  }

  if (loading || !progress) return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      <SkeletonTopbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Video/content area */}
        <div className="flex-1 flex flex-col">
          <div className="aspect-video w-full bg-navy/80 animate-pulse" />
          <div className="p-6 space-y-3 max-w-3xl">
            <div className="h-5 w-64 bg-cloud rounded animate-pulse" />
            <div className="h-3 w-full bg-cloud/60 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-cloud/60 rounded animate-pulse" />
          </div>
        </div>
        {/* Sidebar */}
        <div className="hidden lg:flex w-72 border-l border-cloud flex-col gap-2 p-4">
          {[0,1,2,3,4].map(i => <div key={i} className="h-10 rounded-xl bg-cloud animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  const allLessons = progress.modules.flatMap(m => m.lessons);
  const activeLesson = allLessons.find(l => l.id === lessonId) ?? allLessons[0];

  // Lesson locking: a lesson is locked if it's not free AND the previous non-free lesson isn't completed
  function isLocked(lesson: Lesson): boolean {
    if (lesson.isFree) return false;
    const idx = allLessons.findIndex(l => l.id === lesson.id);
    if (idx === 0) return false;
    // Find previous non-free lesson
    for (let i = idx - 1; i >= 0; i--) {
      if (!allLessons[i].isFree) {
        return !allLessons[i].progress?.completed;
      }
    }
    return false;
  }

  const locked = activeLesson ? isLocked(activeLesson) : false;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--pl-bg-root)]" data-player-theme={playerTheme}>

      {/* Sidebar */}
      <Scroll className={`flex-shrink-0 transition-all duration-300 bg-[var(--pl-bg2)] border-r border-white/5 ${sidebarOpen ? 'w-72' : 'w-0'}`}>
        {sidebarOpen && (
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <Link href={`/student/learn/${courseId}`}
                className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs font-semibold transition">
                <Icon name="arrowLeft" size={13} /> Course overview
              </Link>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Progress</span>
                  <span className="text-xs font-bold text-azure">{progress.percentComplete}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-azure transition-all" style={{ width: `${progress.percentComplete}%` }} />
                </div>
                <p className="text-[11px] text-white/40 mt-1">{progress.completedLessons} / {progress.totalLessons} lessons</p>
              </div>
            </div>

            <div className="space-y-3">
              {progress.modules.map((mod, modIdx) => {
                const done = mod.lessons.filter(l => l.progress?.completed).length;
                return (
                  <div key={mod.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-xs font-black text-white/70">{modIdx + 1}</span>
                      <p className="text-xs font-semibold text-white/80 truncate flex-1">{mod.title}</p>
                      <span className="text-[10px] text-white/40">{done}/{mod.lessons.length}</span>
                    </div>
                    {/* Module progress bar */}
                    <div className="h-0.5 w-full rounded-full bg-white/[0.07] mb-2 overflow-hidden">
                      <div className="h-full rounded-full bg-azure/60 transition-all"
                        style={{ width: mod.lessons.length > 0 ? `${(done / mod.lessons.length) * 100}%` : '0%' }} />
                    </div>
                    <div className="space-y-0.5 pl-7">
                      {mod.lessons.map(lesson => {
                        const isActive = lesson.id === lessonId;
                        const completed = lesson.progress?.completed;
                        const locked = isLocked(lesson);
                        const typeIcon = lesson.type === 'VIDEO' ? 'play' : lesson.type === 'QUIZ' ? 'assignments' : 'file';
                        return (
                          <button key={lesson.id}
                            onClick={() => !locked && router.push(`/student/learn/${courseId}/lesson/${lesson.id}`)}
                            disabled={locked}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                              locked ? 'opacity-40 cursor-not-allowed' :
                              isActive ? 'bg-azure/20 text-white' : 'hover:bg-white/5 text-white/50'
                            }`}>
                            <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                              completed ? 'border-azure bg-azure' : isActive ? 'border-azure' : 'border-white/20'
                            }`}>
                              {locked
                                ? <Icon name="lock" size={10} className="text-white/40" />
                                : completed
                                ? <Icon name="check" size={10} className="text-white" />
                                : <Icon name={typeIcon} size={10} className={isActive ? 'text-azure' : 'text-white/30'} />
                              }
                            </div>
                            <span className="text-xs font-medium truncate flex-1">{lesson.title}</span>
                            {lesson.isFree && !completed && (
                              <span className="text-[10px] font-bold text-azure/70 bg-azure/10 rounded px-1">FREE</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Scroll>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 bg-[var(--pl-bg2)] flex-shrink-0">

          {/* Sidebar toggle */}
          <button onClick={() => setSidebarOpen(s => !s)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] hover:border-white/20 hover:text-white active:scale-95">
            <Icon name={sidebarOpen ? 'chevronRight' : 'list'} size={16} />
          </button>

          {/* Lesson title */}
          <p className="text-sm font-semibold text-white/90 truncate flex-1 min-w-0">{activeLesson?.title ?? 'Lesson'}</p>

          {timeLeft !== null && quizState === 'in_progress' && (
            <TimerBadge seconds={timeLeft} />
          )}

          {/* Right-side actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">

            {/* Notes pill */}
            <button onClick={() => setRightPanel(p => p === 'notes' ? 'none' : 'notes')}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
                rightPanel === 'notes'
                  ? 'bg-azure border border-azure text-white shadow-[0_0_12px_rgba(88,137,250,0.35)]'
                  : 'border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:border-white/20 hover:text-white'
              }`}>
              <Icon name="docLine" size={14} /> Notes
            </button>

            {/* AI pill */}
            <button onClick={() => setRightPanel(p => p === 'ai' ? 'none' : 'ai')}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition active:scale-95 ${
                rightPanel === 'ai'
                  ? 'bg-azure border border-azure text-white shadow-[0_0_12px_rgba(88,137,250,0.35)]'
                  : 'border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:border-white/20 hover:text-white'
              }`}>
              <Icon name="sparkles" size={14} /> AI
            </button>

            {/* Divider */}
            <div className="h-5 w-px bg-white/10 mx-0.5" />

            {/* Theme toggle */}
            <button onClick={toggleTheme}
              title={playerTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] hover:border-white/20 hover:text-white active:scale-95">
              <Icon name={playerTheme === 'dark' ? 'sunLine' : 'moonLine'} size={16} />
            </button>

            {/* Back to course */}
            <Link href={`/student/learn/${courseId}`}
              title="Back to course"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] hover:border-white/20 hover:text-white active:scale-95">
              <Icon name="arrowLeft" size={16} />
            </Link>

          </div>
        </div>

        {/* Content + right panel */}
        <div className="flex flex-1 overflow-hidden">

          {/* Protected content area — copy events and watermark are scoped here */}
          <div ref={contentRef} className="relative flex-1 overflow-hidden">
            <Scroll className="h-full">
              {!activeLesson ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-white/30 text-sm">Lesson not found</p>
                </div>
              ) : locked ? (
                <LockedLesson allLessons={allLessons} lessonId={lessonId} courseId={courseId} />
              ) : activeLesson.type === 'VIDEO' ? (
                <VideoContent lesson={activeLesson} courseId={courseId} allLessons={allLessons} onMarkComplete={markComplete} />
              ) : activeLesson.type === 'TEXT' ? (
                <TextContent lesson={activeLesson} courseId={courseId} allLessons={allLessons} onMarkComplete={markComplete} />
              ) : activeLesson.type === 'QUIZ' ? (
                <QuizContent
                  lesson={activeLesson} courseId={courseId} allLessons={allLessons}
                  quizState={quizState} quizQuestions={quizQuestions}
                  quizAnswers={quizAnswers} setQuizAnswers={setQuizAnswers}
                  quizResults={quizResults} quizScore={quizScore}
                  quizAttempts={quizAttempts}
                  submittingQuiz={submittingQuiz}
                  onStart={() => startQuiz(activeLesson)}
                  onSubmit={() => submitQuiz(activeLesson)}
                  onRetry={() => { setQuizState('idle'); setQuizResults(null); setQuizScore(null); }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-white/30 text-sm">This lesson type is not yet supported.</p>
                </div>
              )}
            </Scroll>
            {/* Floating user watermark — deters screen recording & screenshot sharing */}
            <ContentWatermark />
          </div>

          {/* Right panel — intentionally outside contentRef so notes/AI remain copyable */}
          {rightPanel === 'notes' && (
            <NotesPanel courseId={courseId} lessonId={lessonId} progress={progress} />
          )}
          {rightPanel === 'ai' && (
            <AIAssistantPanel courseId={courseId} lessonId={lessonId} lessonTitle={activeLesson?.title ?? ''} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Locked Lesson ─────────────────────────────────────────
function LockedLesson({ allLessons, lessonId, courseId }: { allLessons: Lesson[]; lessonId: string; courseId: string; }) {
  const idx = allLessons.findIndex(l => l.id === lessonId);
  const prevLesson = idx > 0 ? allLessons[idx - 1] : null;
  return (
    <div className="flex h-full flex-col items-center justify-center text-center p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
        <Icon name="lock" size={28} className="text-white/30" />
      </div>
      <p className="text-white font-bold text-lg mb-2">Lesson locked</p>
      <p className="text-white/40 text-sm max-w-xs">Complete the previous lesson to unlock this one.</p>
      {prevLesson && (
        <Link href={`/student/learn/${courseId}/lesson/${prevLesson.id}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-sm font-bold text-white hover:bg-royal transition">
          <Icon name="arrowLeft" size={13} /> Go to previous lesson
        </Link>
      )}
    </div>
  );
}

// ── Video Content ─────────────────────────────────────────
/** Uploaded videos arrive as this placeholder; the playable link is signed and short-lived. */
const STORED_VIDEO = 'stored-video';
const DATA_SAVER_KEY = 'cpa:dataSaver';

function VideoContent({ lesson, courseId, allLessons, onMarkComplete }: {
  lesson: Lesson; courseId: string; allLessons: Lesson[]; onMarkComplete: (l: Lesson) => void;
}) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [links, setLinks] = useState<{ url: string; lowUrl: string | null } | null>(null);
  const [videoError, setVideoError] = useState('');
  const [dataSaver, setDataSaver] = useState(false);
  const lastPosition = useRef<number | null>(null);
  const refreshedAt = useRef(0);

  useEffect(() => {
    try { setDataSaver(localStorage.getItem(DATA_SAVER_KEY) === '1'); } catch {}
  }, []);

  const isStored = lesson.videoUrl === STORED_VIDEO;
  const loadLinks = useCallback(() => {
    if (!lesson.videoUrl) return;
    api.get(`/platform-courses/${courseId}/lessons/${lesson.id}/signed-video`)
      .then(r => { setLinks({ url: r.data.url, lowUrl: r.data.lowUrl ?? null }); setVideoError(''); })
      .catch(err => {
        // External links (YouTube etc.) can still play from the lesson data; stored videos can't
        if (!isStored) setLinks({ url: lesson.videoUrl!, lowUrl: null });
        else setVideoError(err?.response?.data?.message ?? 'Could not load this video. Check your connection and try again.');
      });
  }, [courseId, lesson.id, lesson.videoUrl, isStored]);

  useEffect(() => {
    setLinks(null); setVideoError(''); lastPosition.current = null;
    loadLinks();
  }, [loadLinks]);

  const videoSrc = links ? (dataSaver && links.lowUrl ? links.lowUrl : links.url) : null;

  function toggleDataSaver() {
    const next = !dataSaver;
    setDataSaver(next);
    try { localStorage.setItem(DATA_SAVER_KEY, next ? '1' : '0'); } catch {}
  }

  // Signed links expire after a couple of hours: fetch a fresh one (at most once a minute) and resume
  function onVideoError() {
    if (!isStored || Date.now() - refreshedAt.current < 60_000) return;
    refreshedAt.current = Date.now();
    loadLinks();
  }

  const reportProgress = useCallback((positionSecs: number, deltaSecs: number) => {
    lastPosition.current = positionSecs;
    api.post(`/platform-courses/${courseId}/progress/${lesson.id}/watch`, { positionSecs, deltaSecs }).catch(() => {});
  }, [courseId, lesson.id]);

  const seek = playerRef.current?.canSeek === false ? undefined : (s: number) => playerRef.current?.seekTo(s);

  const nextLesson = useMemo(() => {
    const i = allLessons.findIndex(l => l.id === lesson.id);
    return i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : null;
  }, [allLessons, lesson.id]);

  const durationLabel = lesson.durationSecs
    ? lesson.durationSecs >= 3600
      ? `${Math.floor(lesson.durationSecs / 3600)}h ${Math.round((lesson.durationSecs % 3600) / 60)}m`
      : `${Math.round(lesson.durationSecs / 60)} min`
    : null;

  return (
    <div className="flex flex-col">
      {/* Video — right-click blocked */}
      <div className="select-none" onContextMenu={e => e.preventDefault()}>
        {videoSrc
          ? <VideoPlayer
              ref={playerRef}
              key={videoSrc}
              src={videoSrc}
              title={lesson.title}
              startAt={lastPosition.current ?? lesson.progress?.positionSecs}
              chapters={lesson.chapters}
              onProgress={reportProgress}
              dataSaver={dataSaver}
              onError={onVideoError}
            />
          : <div className="bg-black flex items-center justify-center px-6 text-center" style={{ minHeight: 300 }}>
              <p className="text-white/50 text-sm">
                {!lesson.videoUrl ? 'No video for this lesson yet' : videoError || 'Loading video…'}
              </p>
            </div>
        }
      </div>
      {isStored && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-[var(--pl-divider)] text-[11px] text-[var(--pl-sub)]">
          <span className="hidden sm:inline">
            {dataSaver
              ? lesson.hasDataSaver ? 'Playing the smaller, lower-quality version' : 'The video only downloads when you press play'
              : 'Using mobile data?'}
          </span>
          <button type="button" onClick={toggleDataSaver} aria-pressed={dataSaver}
            className={`rounded-full px-3 py-1 font-bold transition ${dataSaver ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--pl-bg2)] hover:text-azure'}`}>
            Data saver {dataSaver ? 'on' : 'off'}
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-6 xl:px-8 py-8 space-y-6">

        {/* Lesson header */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-azure/15 border border-azure/20 px-3 py-1 text-xs font-bold text-azure">
                <Icon name="play" size={11} /> Video
              </span>
              {durationLabel && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--pl-sub)]">
                  <Icon name="clockLine" size={11} /> {durationLabel}
                </span>
              )}
            </div>
            {lesson.progress?.completed && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 flex-shrink-0">
                <Icon name="check" size={13} /> Completed
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {lesson.title}
          </h1>
        </div>

        <LessonMediaExtras
          chapters={lesson.chapters}
          transcript={lesson.transcript}
          onSeek={parseVideoUrl(videoSrc ?? '')?.kind === 'file' ? seek : undefined}
        />
        <LessonPractice
          courseId={courseId}
          lessonId={lesson.id}
          onSeek={parseVideoUrl(videoSrc ?? '')?.kind === 'file'
            ? (s) => { seek?.(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }
            : undefined}
        />
        <Attachments attachments={lesson.attachments} />
        <LessonCompletionCard lesson={lesson} onMarkComplete={onMarkComplete} nextLesson={nextLesson} courseId={courseId} />
        <DiscussionSection courseId={courseId} lessonId={lesson.id} />
      </div>
    </div>
  );
}

// ── Text Content ──────────────────────────────────────────
function TextContent({ lesson, courseId, allLessons, onMarkComplete }: {
  lesson: Lesson; courseId: string; allLessons: Lesson[]; onMarkComplete: (l: Lesson) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState('');

  // Estimated read time — word count ÷ 200 wpm
  const readTime = useMemo(() => {
    if (!lesson.content) return 1;
    const text = lesson.content.replace(/<[^>]+>/g, ' ');
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }, [lesson.content]);

  // Parse headings + inject stable IDs for TOC and IntersectionObserver
  const { headings, processedContent } = useMemo(() => {
    if (!lesson.content) return { headings: [] as { id: string; text: string; level: 'h2' | 'h3' }[], processedContent: '' };
    const list: { id: string; text: string; level: 'h2' | 'h3' }[] = [];
    let idx = 0;
    const html = lesson.content.replace(
      /<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi,
      (_m, tag, _attrs, inner) => {
        const id = `hl-${idx++}`;
        list.push({ id, text: inner.replace(/<[^>]+>/g, '').trim(), level: tag.toLowerCase() as 'h2' | 'h3' });
        return `<${tag} id="${id}">${inner}</${tag}>`;
      },
    );
    return { headings: list, processedContent: html };
  }, [lesson.content]);

  // Reading progress — scroll listener on the OverlayScrollbars viewport ancestor
  useEffect(() => {
    let node: HTMLElement | null = wrapperRef.current?.parentElement ?? null;
    while (node && !node.hasAttribute('data-overlayscrollbars-viewport')) node = node.parentElement;
    if (!node) return;
    const vp = node;
    const onScroll = () => {
      const max = vp.scrollHeight - vp.clientHeight;
      setReadProgress(max <= 0 ? 100 : Math.min(100, Math.round((vp.scrollTop / max) * 100)));
    };
    vp.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => vp.removeEventListener('scroll', onScroll);
  }, [lesson.id]);

  // Active heading — IntersectionObserver per heading element
  useEffect(() => {
    if (!headings.length) return;
    const obs: IntersectionObserver[] = [];
    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (!el) return;
      const o = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) setActiveHeadingId(h.id); },
        { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
      );
      o.observe(el);
      obs.push(o);
    });
    return () => obs.forEach(o => o.disconnect());
  }, [headings]);

  const nextLesson = useMemo(() => {
    const i = allLessons.findIndex(l => l.id === lesson.id);
    return i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : null;
  }, [allLessons, lesson.id]);

  const showToc = headings.length >= 3;

  return (
    <div ref={wrapperRef} className="flex min-h-full">

      {/* ── Reading column ── */}
      <div className="flex-1 min-w-0">

        {/* Reading progress bar — sticky at top of scroll viewport */}
        <div className="sticky top-0 z-10 h-0.5 bg-white/[0.05]">
          <div className="h-full bg-azure transition-[width] duration-150 ease-out"
            style={{ width: `${readProgress}%` }} />
        </div>

        <div className="max-w-2xl mx-auto px-6 xl:px-8 py-10 space-y-8">

          {/* ── Lesson header ── */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-azure/15 border border-azure/20 px-3 py-1 text-xs font-bold text-azure">
                  <Icon name="docLine" size={11} /> Reading
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <Icon name="clockLine" size={11} /> {readTime} min read
                </span>
              </div>
              {lesson.progress?.completed ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 flex-shrink-0">
                  <Icon name="check" size={13} /> Completed
                </span>
              ) : (
                <button onClick={() => onMarkComplete(lesson)}
                  className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-azure/10 border border-azure/25 px-4 py-2 text-xs font-bold text-azure hover:bg-azure hover:text-white hover:border-azure transition active:scale-95">
                  <Icon name="check" size={12} /> Mark complete
                </button>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white leading-tight" style={{ letterSpacing: '-0.025em' }}>
              {lesson.title}
            </h1>
          </div>

          {/* ── Prose content card ── */}
          {lesson.content ? (
            <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] px-8 py-9 xl:px-10 xl:py-10">
              <div
                className="lesson-prose select-none"
                dangerouslySetInnerHTML={{ __html: processedContent }}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] px-8 py-16 text-center">
              <Icon name="docLine" size={28} className="text-white/20 mx-auto mb-3" />
              <p className="text-white/30 text-sm">No content yet.</p>
            </div>
          )}

          <Attachments attachments={lesson.attachments} />

          <LessonPractice courseId={courseId} lessonId={lesson.id} />

          {/* ── End-of-lesson card ── */}
          <LessonCompletionCard lesson={lesson} onMarkComplete={onMarkComplete} nextLesson={nextLesson} courseId={courseId} />

          <DiscussionSection courseId={courseId} lessonId={lesson.id} />
        </div>
      </div>

      {/* ── Table of contents sidebar ── */}
      {showToc && (
        <div className="hidden xl:block w-56 flex-shrink-0 py-10 pr-4">
          <div className="sticky top-8 space-y-3">

            {/* Header row */}
            <div className="flex items-center justify-between px-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--pl-sub)]">On this page</p>
              {readProgress > 0 && readProgress < 100 && (
                <span className="text-[10px] font-bold text-azure tabular-nums">{readProgress}%</span>
              )}
              {readProgress >= 100 && (
                <span className="text-[10px] font-bold text-green-400">Done</span>
              )}
            </div>

            {/* Rail + items */}
            <nav className="relative">
              {/* Vertical track line */}
              <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--pl-divider)]" />

              <div className="space-y-0.5">
                {headings.map(h => {
                  const isActive = activeHeadingId === h.id;
                  const isH3 = h.level === 'h3';
                  return (
                    <button key={h.id}
                      onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className={`relative flex w-full items-start gap-2.5 rounded-r-lg py-1.5 text-left transition-all duration-150
                        ${isH3 ? 'pl-7 pr-2' : 'pl-5 pr-2'}
                        ${isActive
                          ? 'text-azure'
                          : 'text-[var(--pl-sub)] hover:text-white/70'
                        }`}>

                      {/* Active rail highlight */}
                      {isActive && (
                        <span className="absolute left-3 top-0 bottom-0 w-px bg-azure" />
                      )}

                      {/* Dot — H2 only */}
                      {!isH3 && (
                        <span className={`mt-[5px] h-1.5 w-1.5 rounded-full flex-shrink-0 transition-all duration-150
                          ${isActive ? 'bg-azure scale-125' : 'bg-[var(--pl-divider)]'}`} />
                      )}

                      {/* Text */}
                      <span className={`leading-snug line-clamp-2 transition-all duration-150
                        ${isH3
                          ? isActive ? 'text-[11px] font-semibold' : 'text-[11px]'
                          : isActive ? 'text-xs font-bold' : 'text-xs font-medium'
                        }`}>
                        {h.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Lesson Completion Card ─────────────────────────────────
function LessonCompletionCard({ lesson, onMarkComplete, nextLesson, courseId }: {
  lesson: Lesson; onMarkComplete: (l: Lesson) => void;
  nextLesson: Lesson | null; courseId: string;
}) {
  const typeIcon: Partial<Record<string, IconName>> = { VIDEO: 'play', QUIZ: 'assignments', TEXT: 'docLine' };
  return (
    <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] overflow-hidden">
      {lesson.progress?.completed ? (
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500/15 border border-green-500/20">
            <Icon name="check" size={17} className="text-green-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-green-400">Lesson completed</p>
            <p className="text-xs text-[var(--pl-sub)] mt-0.5">Keep going — your progress is saved</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-sm font-bold text-white">Done reading?</p>
            <p className="text-xs text-[var(--pl-sub)] mt-0.5">Mark complete to track your progress</p>
          </div>
          <button onClick={() => onMarkComplete(lesson)}
            className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-sm font-bold text-white hover:bg-royal transition active:scale-95">
            <Icon name="check" size={14} /> Mark complete
          </button>
        </div>
      )}
      {nextLesson && (
        <>
          <div className="h-px bg-[var(--pl-divider)]" />
          <Link href={`/student/learn/${courseId}/lesson/${nextLesson.id}`}
            className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--pl-card)] transition group">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--pl-card)] border border-[var(--pl-divider)]">
              <Icon name={(typeIcon[nextLesson.type] ?? 'file') as IconName} size={15}
                className="text-white/45 group-hover:text-azure transition" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Up next</p>
              <p className="text-sm font-semibold text-white/75 group-hover:text-white truncate transition">{nextLesson.title}</p>
            </div>
            <Icon name="arrowRight" size={16} className="text-white/25 group-hover:text-azure flex-shrink-0 transition" />
          </Link>
        </>
      )}
    </div>
  );
}

// ── Quiz Content ──────────────────────────────────────────
function QuizContent({
  lesson, courseId, allLessons,
  quizState, quizQuestions, quizAnswers, setQuizAnswers,
  quizResults, quizScore, quizAttempts,
  submittingQuiz, onStart, onSubmit, onRetry,
}: {
  lesson: Lesson; courseId: string; allLessons: Lesson[];
  quizState: QuizState; quizQuestions: QuizQuestion[];
  quizAnswers: Record<string, string>; setQuizAnswers: (a: Record<string, string>) => void;
  quizResults: QuizResult[] | null; quizScore: { percentage: number; passed: boolean } | null;
  quizAttempts: QuizAttemptSummary[]; submittingQuiz: boolean;
  onStart: () => void; onSubmit: () => void; onRetry: () => void;
}) {
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  async function handleStart() {
    setLoadingQuiz(true);
    try { await onStart(); } finally { setLoadingQuiz(false); }
  }

  const nextLesson = useMemo(() => {
    const i = allLessons.findIndex(l => l.id === lesson.id);
    return i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : null;
  }, [allLessons, lesson.id]);

  const answered = Object.keys(quizAnswers).length;
  const total = quizQuestions.length;
  const canSubmit = answered > 0;
  const attemptsUsed = quizAttempts.length;
  const maxAttempts = lesson.maxAttempts;
  const attemptsLeft = maxAttempts > 0 ? maxAttempts - attemptsUsed : null;
  const bestAttempt = quizAttempts.length > 0
    ? quizAttempts.reduce((best, a) => a.finalScore > best.finalScore ? a : best)
    : null;

  // ── Idle: show quiz info + previous attempts ──────────────
  if (quizState === 'idle') {
    const alreadyPassed = quizAttempts.some(a => a.passed);
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-azure/20 mx-auto mb-4">
            <Icon name="assignments" size={28} className="text-azure" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{lesson.title}</h2>
          <p className="text-white/40 text-sm">Complete this quiz to mark the lesson as done</p>
        </div>

        {/* Quiz metadata */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pass mark',   value: lesson.passMark ? `${lesson.passMark}%` : 'None' },
            { label: 'Time limit',  value: lesson.timeLimitSecs ? `${Math.round(lesson.timeLimitSecs / 60)} min` : 'None' },
            { label: 'Attempts',    value: lesson.maxAttempts > 0 ? String(lesson.maxAttempts) : '∞' },
          ].map(m => (
            <div key={m.label} className="bg-[var(--pl-card)] rounded-xl p-3 text-center border border-[var(--pl-divider)]">
              <p className="text-base font-black text-white">{m.value}</p>
              <p className="text-[11px] text-[var(--pl-sub)] mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Previous attempts */}
        {quizAttempts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--pl-sub)] uppercase tracking-widest">Previous attempts</p>
            {quizAttempts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 bg-[var(--pl-card)] border border-[var(--pl-divider)] rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-[var(--pl-sub)]">#{quizAttempts.length - i}</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">
                    {a.maxScore > 0 ? `${a.finalScore}/${a.maxScore}` : 'Written'} ·{' '}
                    {a.maxScore > 0 ? `${Math.round((a.finalScore / a.maxScore) * 100)}%` : 'Pending grade'}
                  </p>
                  <p className="text-[11px] text-[var(--pl-sub)]">{new Date(a.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${a.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {a.passed ? 'Passed' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Start button */}
        {(attemptsLeft === null || attemptsLeft > 0) && !alreadyPassed ? (
          <div className="text-center">
            <button onClick={handleStart} disabled={loadingQuiz}
              className="inline-flex items-center gap-2 rounded-xl bg-azure px-8 py-3 text-sm font-bold text-white hover:bg-royal transition disabled:opacity-50">
              <Icon name="play" size={14} />
              {loadingQuiz ? 'Loading…' : attemptsUsed > 0 ? 'Try again' : 'Start quiz'}
            </button>
            {attemptsLeft !== null && (
              <p className="text-[11px] text-white/40 mt-2">{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining</p>
            )}
          </div>
        ) : attemptsLeft === 0 ? (
          <div className="text-center text-white/40 text-sm">
            No attempts remaining.
            {alreadyPassed && <p className="text-green-400 font-semibold mt-1">You already passed this quiz!</p>}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-green-400 font-semibold text-sm">You already passed this quiz!</p>
          </div>
        )}

        <LessonNav allLessons={allLessons} activeId={lesson.id} courseId={courseId} />
        <DiscussionSection courseId={courseId} lessonId={lesson.id} />
      </div>
    );
  }

  // ── In progress: show questions ───────────────────────────
  if (quizState === 'in_progress') {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-[var(--pl-sub)] mb-1.5">
            <span>{answered} / {total} answered</span>
            {lesson.passMark && <span>Pass: {lesson.passMark}%</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--pl-card)] overflow-hidden">
            <div className="h-full rounded-full bg-azure transition-all" style={{ width: total > 0 ? `${(answered / total) * 100}%` : '0%' }} />
          </div>
        </div>

        {quizQuestions.map((q, idx) => (
          <div key={q.id} className="bg-[var(--pl-card)] border border-[var(--pl-divider)] rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-azure/20 text-xs font-black text-azure">{idx + 1}</span>
              <p className="text-sm font-semibold text-white leading-relaxed select-none">{q.questionText}</p>
            </div>
            {q.type === 'MCQ' && q.options ? (
              <div className="space-y-2 pl-9">
                {q.options.map(opt => {
                  const selected = quizAnswers[q.id] === opt.id;
                  return (
                    <button key={opt.id} type="button"
                      onClick={() => setQuizAnswers({ ...quizAnswers, [q.id]: opt.id })}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                        selected ? 'border-azure bg-azure/20 text-white font-semibold' : 'border-[var(--pl-divider)] text-white/60 hover:bg-[var(--pl-card-h)] hover:text-white'
                      }`}>
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${selected ? 'border-azure bg-azure text-white' : 'border-[var(--pl-divider)]'}`}>
                        {opt.id.toUpperCase()}
                      </span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={quizAnswers[q.id] ?? ''}
                onChange={e => setQuizAnswers({ ...quizAnswers, [q.id]: e.target.value })}
                rows={4} placeholder="Write your answer here…"
                className="w-full rounded-xl bg-[var(--pl-input)] border border-[var(--pl-divider)] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-azure resize-none transition-colors"
              />
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <button onClick={() => { setQuizAnswers({}); }}
            className="text-xs text-[var(--pl-sub)] hover:text-white transition">Clear answers</button>
          <button onClick={onSubmit} disabled={!canSubmit || submittingQuiz}
            className="inline-flex items-center gap-2 rounded-xl bg-azure px-6 py-2.5 text-sm font-bold text-white hover:bg-royal transition disabled:opacity-40">
            {submittingQuiz ? 'Submitting…' : 'Submit quiz'}
          </button>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────
  if (quizState === 'submitted' && quizResults && quizScore) {
    const mcqResults = quizResults.filter(r => r.type !== 'WRITTEN');
    const correctCount = mcqResults.filter(r => r.isCorrect).length;

    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        {/* Score banner */}
        <div className={`rounded-2xl p-6 text-center ${quizScore.passed ? 'bg-green-500/15 border border-green-500/30' : 'bg-red-500/15 border border-red-500/20'}`}>
          <div className={`flex h-14 w-14 items-center justify-center rounded-full mx-auto mb-3 ${quizScore.passed ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <Icon name={quizScore.passed ? 'check' : 'closeSmall'} size={28} className={quizScore.passed ? 'text-green-400' : 'text-red-400'} />
          </div>
          <div className={`text-5xl font-black mb-1 ${quizScore.passed ? 'text-green-400' : 'text-red-400'}`}>
            {quizScore.percentage}%
          </div>
          <p className={`text-base font-bold mb-0.5 ${quizScore.passed ? 'text-green-300' : 'text-red-300'}`}>
            {quizScore.passed ? 'Passed' : 'Not passed'}
          </p>
          {mcqResults.length > 0 && (
            <p className="text-white/50 text-sm">{correctCount} / {mcqResults.length} correct</p>
          )}
          {lesson.passMark && (
            <p className="text-[var(--pl-sub)] text-xs mt-1">Pass mark: {lesson.passMark}%</p>
          )}
        </div>

        {/* Per-question breakdown */}
        {quizResults.map((r, idx) => (
          <div key={r.questionId} className="bg-[var(--pl-card)] border border-[var(--pl-divider)] rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-black ${
                r.type !== 'WRITTEN' ? (r.isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-amber-500 text-white'
              }`}>
                {r.type !== 'WRITTEN' ? (r.isCorrect ? '✓' : '✗') : '?'}
              </span>
              <p className="text-sm font-semibold text-white">{r.questionText}</p>
            </div>
            {r.type === 'MCQ' && r.options && (
              <div className="space-y-1.5 pl-9">
                {r.options.map(opt => {
                  const isYours = r.yourAnswer === opt.id;
                  const isCorrect = r.correctAnswer === opt.id;
                  return (
                    <div key={opt.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      isCorrect ? 'bg-green-500/20 text-green-300 font-semibold' :
                      isYours && !isCorrect ? 'bg-red-500/15 text-red-300' :
                      'text-white/40'
                    }`}>
                      <span className="font-bold w-4">{opt.id.toUpperCase()}.</span>
                      {opt.text}
                      {isCorrect && <span className="ml-auto text-green-400">✓ Correct</span>}
                      {isYours && !isCorrect && <span className="ml-auto text-red-400">← Your answer</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {r.type === 'SHORT_ANSWER' && (
              <div className="pl-9 space-y-1 text-xs">
                <p className={r.isCorrect ? 'text-green-300' : 'text-red-300'}>Your answer: {r.yourAnswer || '(no answer)'}</p>
                {!r.isCorrect && r.correctAnswer && <p className="text-green-300">Accepted answer: {r.correctAnswer}</p>}
              </div>
            )}
            {r.type === 'WRITTEN' && (
              <div className="pl-9">
                <p className="text-xs text-[var(--pl-sub)] mb-1 uppercase tracking-wider">Your answer</p>
                <p className="text-sm text-white/70 bg-[var(--pl-input)] border border-[var(--pl-divider)] rounded-lg p-3 leading-relaxed">{r.yourAnswer || '(no answer)'}</p>
                <p className="text-xs text-amber-400/80 mt-2">Written answers are graded manually by your teacher.</p>
              </div>
            )}
            {r.explanation && (
              <div className="pl-9 flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <Icon name="sparkles" size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/60 italic">{r.explanation}</p>
              </div>
            )}
          </div>
        ))}

        {/* Actions */}
        {!quizScore.passed && (lesson.maxAttempts === 0 || lesson.maxAttempts > quizAttempts.length) && (
          <div className="flex justify-start">
            <button onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--pl-divider)] bg-[var(--pl-card)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--pl-card-h)] transition">
              <Icon name="arrowLeft" size={14} /> Try again
            </button>
          </div>
        )}
        {quizScore.passed && (
          <LessonCompletionCard lesson={lesson} onMarkComplete={() => {}} nextLesson={nextLesson} courseId={courseId} />
        )}
      </div>
    );
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────
function TimerBadge({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgent = seconds < 60;
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${urgent ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/70'}`}>
      <Icon name="clock" size={13} /> {mins}:{String(secs).padStart(2, '0')}
    </div>
  );
}

function CompleteButton({ lesson, onMarkComplete }: { lesson: Lesson; onMarkComplete: (l: Lesson) => void }) {
  if (lesson.progress?.completed) {
    return <span className="flex items-center gap-1.5 text-azure text-sm font-semibold flex-shrink-0"><Icon name="check" size={14} /> Completed</span>;
  }
  return (
    <button onClick={() => onMarkComplete(lesson)}
      className="flex items-center gap-2 rounded-xl bg-azure px-4 py-2 text-sm font-semibold text-white hover:bg-royal transition flex-shrink-0 active:scale-95">
      <Icon name="check" size={13} /> Mark complete
    </button>
  );
}

function Attachments({ attachments }: { attachments: Attachment[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!attachments?.length) return null;

  async function triggerDownload(a: Attachment) {
    if (downloading) return;
    setDownloading(a.id);
    try {
      // Fetch via credentials so the raw CDN URL is never a plain <a href> in the DOM
      const res = await fetch(a.url, { credentials: 'include' });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = a.name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback for CORS-blocked external URLs
      window.open(a.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--pl-sub)]">Downloads</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map(a => (
          <button key={a.id} onClick={() => triggerDownload(a)} disabled={!!downloading}
            className="flex items-center gap-2 rounded-xl border border-[var(--pl-divider)] bg-[var(--pl-card)] px-3 py-2 text-xs font-semibold text-white/70 hover:text-white hover:border-azure/40 hover:bg-[var(--pl-card-h)] transition disabled:opacity-50">
            <Icon name={downloading === a.id ? 'spinner' : 'download'} size={12}
              className={downloading === a.id ? 'animate-spin' : ''} />
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function LessonNav({ allLessons, activeId, courseId }: { allLessons: Lesson[]; activeId: string; courseId: string; }) {
  const idx = allLessons.findIndex(l => l.id === activeId);
  const prev = idx > 0 ? allLessons[idx - 1] : null;
  const next = idx < allLessons.length - 1 ? allLessons[idx + 1] : null;
  return (
    <div className="flex justify-between gap-3 pt-2">
      {prev ? (
        <Link href={`/student/learn/${courseId}/lesson/${prev.id}`}
          className="flex items-center gap-2 rounded-xl border border-[var(--pl-divider)] bg-[var(--pl-card)] px-4 py-2.5 text-xs font-semibold text-[var(--pl-sub)] hover:text-white hover:border-azure/30 hover:bg-[var(--pl-card-h)] transition min-w-0 flex-1">
          <Icon name="arrowLeft" size={13} className="flex-shrink-0" />
          <span className="truncate">{prev.title}</span>
        </Link>
      ) : <span className="flex-1" />}
      {next && (
        <Link href={`/student/learn/${courseId}/lesson/${next.id}`}
          className="flex items-center gap-2 rounded-xl border border-azure/30 bg-azure/10 px-4 py-2.5 text-xs font-semibold text-azure hover:bg-azure hover:text-white transition min-w-0 flex-1 justify-end">
          <span className="truncate">{next.title}</span>
          <Icon name="arrowRight" size={13} className="flex-shrink-0" />
        </Link>
      )}
    </div>
  );
}

// ── Notes Panel ───────────────────────────────────────────
interface LessonNote { id: string; body: string; lessonId: string; timestamp: number | null; createdAt: string; }

function NotesPanel({ courseId, lessonId, progress }: { courseId: string; lessonId: string; progress: ProgressData | null }) {
  const [tab, setTab] = useState<'lesson' | 'all'>('lesson');
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [allNotes, setAllNotes] = useState<LessonNote[]>([]);
  const [text, setText] = useState('');
  const [tsInput, setTsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedMods, setCollapsedMods] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const DRAFT_KEY = `notes_draft_${lessonId}`;

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    setText(saved ?? '');
    setTsInput('');
    setEditingId(null);
  }, [lessonId, DRAFT_KEY]);

  useEffect(() => {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  }, [text, DRAFT_KEY]);

  useEffect(() => {
    api.get(`/notes?courseId=${courseId}&lessonId=${lessonId}`).then(r => setNotes(r.data ?? [])).catch(() => {});
  }, [courseId, lessonId]);

  useEffect(() => {
    if (tab === 'all') {
      api.get(`/notes?courseId=${courseId}`).then(r => setAllNotes(r.data ?? [])).catch(() => {});
    }
  }, [tab, courseId]);

  function parseTimestamp(input: string): number | null {
    const m = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
  }

  function fmtTs(secs: number | null) {
    if (!secs) return '';
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function applyFormat(format: 'bold' | 'italic' | 'bullet') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = text.slice(start, end);
    let replacement = '';
    if (format === 'bold') replacement = `**${sel || 'text'}**`;
    else if (format === 'italic') replacement = `_${sel || 'text'}_`;
    else if (format === 'bullet') replacement = (start === 0 || text[start - 1] === '\n' ? '' : '\n') + `• ${sel || 'item'}`;
    setText(text.slice(0, start) + replacement + text.slice(end));
    setTimeout(() => ta.focus(), 0);
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    const ts = parseTimestamp(tsInput);
    try {
      const r = await api.post('/notes', { lessonId, body: text.trim(), ...(ts !== null ? { timestamp: ts } : {}) });
      setNotes(n => [r.data, ...n]);
      setText('');
      setTsInput('');
      localStorage.removeItem(DRAFT_KEY);
    } catch {} finally { setSaving(false); }
  }

  async function del(id: string) {
    await api.delete(`/notes/${id}`).catch(() => {});
    setNotes(n => n.filter(x => x.id !== id));
    setAllNotes(n => n.filter(x => x.id !== id));
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    setSavingEdit(true);
    try {
      const r = await api.patch(`/notes/${id}`, { body: editText.trim() });
      setNotes(n => n.map(x => x.id === id ? r.data : x));
      setAllNotes(n => n.map(x => x.id === id ? r.data : x));
      setEditingId(null);
    } catch {} finally { setSavingEdit(false); }
  }

  async function exportNotes() {
    setExporting(true);
    try {
      const r = await api.get(`/notes/export/${courseId}`);
      const blob = new Blob([r.data.text ?? r.data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'notes.txt'; a.click();
      URL.revokeObjectURL(url);
    } catch {} finally { setExporting(false); }
  }

  function toggleMod(modId: string) {
    setCollapsedMods(prev => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId); else next.add(modId);
      return next;
    });
  }

  // Build lesson + module metadata from progress
  const lessonMeta: Record<string, { title: string; modId: string; moduleTitle: string; modOrder: number; lesOrder: number }> = {};
  const moduleIndex: { id: string; title: string; order: number }[] = [];
  if (progress) {
    for (const mod of progress.modules) {
      moduleIndex.push({ id: mod.id, title: mod.title, order: mod.sortOrder });
      for (const l of mod.lessons) {
        lessonMeta[l.id] = { title: l.title, modId: mod.id, moduleTitle: mod.title, modOrder: mod.sortOrder, lesOrder: l.sortOrder };
      }
    }
  }

  // Filter + group all notes by module → lesson
  const q = search.trim().toLowerCase();
  const filteredAll = q ? allNotes.filter(n => n.body.toLowerCase().includes(q)) : allNotes;
  const grouped: Record<string, Record<string, LessonNote[]>> = {};
  for (const n of filteredAll) {
    const modId = lessonMeta[n.lessonId]?.modId ?? '__unknown__';
    if (!grouped[modId]) grouped[modId] = {};
    if (!grouped[modId][n.lessonId]) grouped[modId][n.lessonId] = [];
    grouped[modId][n.lessonId].push(n);
  }
  const sortedModIds = Object.keys(grouped).sort((a, b) => {
    const oa = moduleIndex.find(m => m.id === a)?.order ?? 999;
    const ob = moduleIndex.find(m => m.id === b)?.order ?? 999;
    return oa - ob;
  });

  function renderNote(n: LessonNote) {
    const isEditing = editingId === n.id;
    const ts = fmtTs(n.timestamp);
    return (
      <div key={n.id}
        className="relative flex gap-0 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 overflow-hidden group transition-colors">
        {/* Left accent bar */}
        <div className={`w-0.5 flex-shrink-0 ${ts ? 'bg-azure/60' : 'bg-white/10'}`} />
        <div className="flex-1 min-w-0 p-3 space-y-1.5">
          {/* Timestamp pill */}
          {ts && (
            <span className="inline-flex items-center gap-1 rounded-full bg-azure/15 px-2 py-0.5 text-[10px] font-bold text-azure">
              <Icon name="clockLine" size={9} />
              {ts}
            </span>
          )}
          {/* Body */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea rows={3} value={editText} onChange={e => setEditText(e.target.value)}
                className="w-full rounded-lg bg-white/10 border border-azure/30 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-azure resize-none leading-relaxed" />
              <div className="flex gap-1.5">
                <button onClick={() => saveEdit(n.id)} disabled={savingEdit}
                  className="rounded-lg bg-azure px-3 py-1 text-[10px] font-bold text-white disabled:opacity-50 transition">
                  {savingEdit ? '…' : 'Save'}
                </button>
                <button onClick={() => setEditingId(null)}
                  className="rounded-lg bg-white/10 px-3 py-1 text-[10px] text-white/50 hover:text-white transition">Cancel</button>
              </div>
            </div>
          ) : (
            <ReactMarkdown
              components={{
                p:      ({ children }: { children: any }) => <p className="text-xs text-white/70 leading-relaxed mb-1 last:mb-0">{children}</p>,
                strong: ({ children }: { children: any }) => <strong className="font-semibold text-white/90">{children}</strong>,
                em:     ({ children }: { children: any }) => <em className="italic text-white/75">{children}</em>,
                ul:     ({ children }: { children: any }) => <ul className="list-disc list-inside space-y-0.5 text-xs text-white/65 mt-1">{children}</ul>,
                li:     ({ children }: { children: any }) => <li className="text-xs text-white/65">{children}</li>,
              }}>
              {n.body}
            </ReactMarkdown>
          )}
          {/* Footer */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[10px] text-white/35">{fmtDate(n.createdAt)}</span>
            {!isEditing && (
              <div className="hidden group-hover:flex items-center gap-1">
                <button onClick={() => { setEditingId(n.id); setEditText(n.body); }} title="Edit note"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-white/25 hover:text-azure hover:bg-azure/10 transition">
                  <Icon name="penLine" size={12} />
                </button>
                <button onClick={() => del(n.id)} title="Delete note"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition">
                  <Icon name="trashLine" size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-[var(--pl-divider)] bg-[var(--pl-bg)] flex flex-col overflow-hidden">

      {/* ── Panel header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--pl-divider)] flex-shrink-0">
        {/* Title + count */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[13px] font-bold text-white tracking-tight">Notes</span>
          {notes.length > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-azure/20 px-1.5 text-[10px] font-black text-azure">
              {notes.length}
            </span>
          )}
        </div>
        {/* Tab switcher pill */}
        <div className="flex items-center rounded-lg bg-[var(--pl-card)] p-0.5">
          {(['lesson', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                tab === t ? 'bg-azure text-white shadow-sm' : 'text-white/45 hover:text-white/70'
              }`}>
              {t === 'lesson' ? 'Lesson' : 'All'}
            </button>
          ))}
        </div>
        {/* Export icon */}
        <button onClick={exportNotes} disabled={exporting} title="Export all notes"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--pl-faint)] hover:text-azure hover:bg-azure/10 transition disabled:opacity-30">
          {exporting ? <span className="text-[10px]">…</span> : <Icon name="downloadLine" size={14} />}
        </button>
      </div>

      {/* ══ LESSON TAB ══ */}
      {tab === 'lesson' && (
        <>
          {/* Compose card */}
          <div className="px-4 pt-4 pb-3 border-b border-[var(--pl-divider)] flex-shrink-0 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--pl-sub)]">New note</p>

            {/* Toolbar row */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg bg-[var(--pl-input)] border border-[var(--pl-divider)] p-0.5">
                {([
                  ['boldLine',  'bold',   'Bold — select text then click'],
                  ['penLine',   'italic', 'Italic — select text then click'],
                  ['listLine',  'bullet', 'Insert bullet point'],
                ] as const).map(([iconName, fmt, title]) => (
                  <button key={fmt} title={title} onClick={() => applyFormat(fmt)}
                    className="h-7 w-8 rounded-md flex items-center justify-center text-[var(--pl-sub)] hover:text-white hover:bg-[var(--pl-card-h)] transition">
                    <Icon name={iconName} size={13} />
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              {/* Timestamp */}
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--pl-input)] border border-[var(--pl-divider)] px-2.5 py-1.5">
                <Icon name="clockLine" size={11} className="text-[var(--pl-faint)] flex-shrink-0" />
                <input value={tsInput} onChange={e => setTsInput(e.target.value)}
                  placeholder="0:00" maxLength={5}
                  className="w-10 bg-transparent text-[10px] text-white placeholder:text-white/30 focus:outline-none text-center" />
              </div>
            </div>

            {/* Textarea */}
            <textarea ref={textareaRef} rows={4} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save(); } }}
              placeholder="Write your note here…"
              className="w-full rounded-xl bg-[var(--pl-input)] border border-[var(--pl-divider)] px-3.5 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-azure/50 focus:bg-[var(--pl-card)] resize-none transition-colors leading-relaxed" />

            {/* Footer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {text.length > 0 && (
                  <>
                    <span className="text-[10px] text-[var(--pl-sub)]">{text.length} chars</span>
                    <span className="flex items-center gap-1 text-[10px] text-azure/60">
                      <span className="h-1 w-1 rounded-full bg-azure/50" />
                      Draft saved
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--pl-faint)]">Ctrl+Enter</span>
                <button onClick={save} disabled={saving || !text.trim()}
                  className="rounded-lg bg-azure px-4 py-1.5 text-xs font-bold text-white hover:bg-royal transition disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
          </div>

          {/* Notes list */}
          <Scroll className="flex-1 px-3 py-3">
            <div className="space-y-2">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
                  <Icon name="docLine" size={26} className="text-white/20" />
                </div>
                <p className="text-xs font-semibold text-white/50 mb-1">No notes yet</p>
                <p className="text-[11px] text-white/30 max-w-[170px] leading-relaxed">
                  Write your first note above to start building your study notebook
                </p>
              </div>
            ) : (
              notes.map(n => renderNote(n))
            )}
            </div>
          </Scroll>
        </>
      )}

      {/* ══ ALL NOTES TAB ══ */}
      {tab === 'all' && (
        <>
          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/8 px-3 py-2 focus-within:border-azure/40 transition-colors">
              <Icon name="search" size={13} className="text-white/25 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search all notes…"
                className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none" />
              {search && (
                <button onClick={() => setSearch('')} className="text-white/25 hover:text-white/60 transition">
                  <Icon name="closeSmall" size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Grouped notes */}
          <Scroll className="flex-1 px-3 py-3">
            {filteredAll.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
                  {search
                    ? <Icon name="search" size={26} className="text-white/20" />
                    : <Icon name="docLine" size={26} className="text-white/20" />
                  }
                </div>
                <p className="text-xs font-semibold text-white/50 mb-1">
                  {search ? 'No matches found' : 'No notes in this course'}
                </p>
                <p className="text-[11px] text-white/30 max-w-[170px] leading-relaxed">
                  {search ? 'Try a different search term' : 'Take notes on any lesson — they all appear here'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedModIds.map(modId => {
                  const modInfo = moduleIndex.find(m => m.id === modId);
                  const modTitle = modInfo?.title ?? 'Other';
                  const lessonIds = Object.keys(grouped[modId]).sort((a, b) =>
                    (lessonMeta[a]?.lesOrder ?? 0) - (lessonMeta[b]?.lesOrder ?? 0)
                  );
                  const totalInMod = lessonIds.reduce((sum, lid) => sum + grouped[modId][lid].length, 0);
                  const isCollapsed = collapsedMods.has(modId);

                  return (
                    <div key={modId} className="mb-3">
                      {/* Module header row */}
                      <button onClick={() => toggleMod(modId)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 transition group mb-1">
                        <span className={`flex-shrink-0 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}>
                          <Icon name="chevronRight" size={12} className="text-white/25" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 flex-1 text-left truncate">{modTitle}</span>
                        <span className="text-[10px] text-white/35 bg-white/5 rounded-full px-1.5 py-0.5 flex-shrink-0">{totalInMod}</span>
                      </button>

                      {/* Module lessons + notes */}
                      {!isCollapsed && (
                        <div className="space-y-3 pl-2 border-l border-white/5 ml-2">
                          {lessonIds.map(lid => {
                            const meta = lessonMeta[lid];
                            const isCurrent = lid === lessonId;
                            const lessonNotes = grouped[modId][lid];
                            return (
                              <div key={lid}>
                                {/* Lesson row */}
                                <div className="flex items-center gap-2 mb-2 pl-2">
                                  <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isCurrent ? 'bg-azure' : 'bg-white/15'}`} />
                                  <Link href={`/student/learn/${courseId}/lesson/${lid}`}
                                    className={`text-xs font-semibold flex-1 truncate transition ${
                                      isCurrent ? 'text-azure' : 'text-white/55 hover:text-white/80'
                                    }`}>
                                    {meta?.title ?? 'Lesson'}
                                  </Link>
                                  <span className="text-[10px] text-white/35 bg-white/5 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                    {lessonNotes.length}
                                  </span>
                                </div>
                                {/* Notes under this lesson */}
                                <div className="space-y-1.5 pl-2">
                                  {lessonNotes.map(n => renderNote(n))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Scroll>
        </>
      )}
    </div>
  );
}

// ── AI Assistant Panel ────────────────────────────────────
interface AIMessage { role: 'user' | 'ai'; text: string; time: string; failed?: boolean; }

const AI_PROMPTS: { icon: IconName; label: string; q: string }[] = [
  { icon: 'docLine',      label: 'Summarise this lesson',  q: 'Give me a concise summary of the key points covered in this lesson.' },
  { icon: 'keyLine',      label: 'Key takeaways',          q: 'What are the 3 most important takeaways from this lesson I should remember?' },
  { icon: 'questionLine', label: 'Quiz me',                q: 'Ask me 3 short quiz questions to test my understanding of this lesson.' },
  { icon: 'lightbulbLine',label: 'Explain simply',         q: "Explain the main concept of this lesson as simply as possible, like I'm a beginner." },
];

function AIAssistantPanel({ courseId, lessonId, lessonTitle }: { courseId: string; lessonId: string; lessonTitle: string }) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function now() {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput('');
    // Earlier turns give the tutor context for follow-ups; failed replies are left out
    const history = messages
      .filter(m => !m.failed)
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', text: m.text }));
    setMessages(m => [...m, { role: 'user', text: q, time: now() }]);
    setLoading(true);
    try {
      const r = await api.post('/ai/tutor', { courseId, lessonId, question: q, history });
      setMessages(m => [...m, { role: 'ai', text: r.data.answer, time: now() }]);
    } catch (err: any) {
      const text = err?.response?.data?.message ?? 'Sorry, I could not reach the AI right now. Please try again.';
      setMessages(m => [...m, { role: 'ai', text: Array.isArray(text) ? text.join(' ') : text, time: now(), failed: true }]);
    } finally { setLoading(false); }
  }

  async function copyMsg(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-white/10 bg-[var(--pl-bg)] flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="flex items-center gap-1.5 rounded-full bg-azure/15 px-2.5 py-1 text-xs font-black text-azure">
            <Icon name="sparkles" size={14} />
            AI Tutor
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} title="Clear conversation"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-red-400 hover:bg-red-400/10 transition">
              <Icon name="trashLine" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <Scroll className="flex-1 px-3 py-4">
        <div className="space-y-4">

        {/* Empty state with prompt chips */}
        {messages.length === 0 && !loading && (
          <div className="space-y-4">
            <div className="text-center px-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azure/10 mx-auto mb-3">
                <Icon name="sparkles" size={28} className="text-azure/60" />
              </div>
              <p className="text-sm font-bold text-white/70 mb-1">AI Tutor</p>
              <p className="text-xs text-white/40 leading-relaxed">
                {lessonTitle ? `Ask me anything about "${lessonTitle}"` : 'Ask me anything about this lesson'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 px-1">Try asking</p>
              {AI_PROMPTS.map(p => (
                <button key={p.label} onClick={() => send(p.q)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-azure/20 px-3 py-2.5 text-left transition group">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-azure/10 text-azure/60 group-hover:bg-azure/20 group-hover:text-azure transition">
                    <Icon name={p.icon} size={15} />
                  </span>
                  <span className="text-xs font-medium text-white/60 group-hover:text-white/85 transition leading-snug">{p.label}</span>
                  <Icon name="chevronRight" size={13} className="ml-auto text-white/20 group-hover:text-azure/60 flex-shrink-0 transition" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            {m.role === 'user' ? (
              /* User bubble */
              <div className="max-w-[85%]">
                <div className="rounded-2xl rounded-tr-sm bg-azure px-3.5 py-2.5 text-xs text-white leading-relaxed">
                  {m.text}
                </div>
                <p className="text-[10px] text-white/30 mt-1 pr-1 text-right">{m.time}</p>
              </div>
            ) : (
              /* AI bubble */
              <div className="max-w-[95%] w-full group">
                {/* AI badge */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon name="sparkles" size={13} className="text-azure/70" />
                  <span className="text-[11px] font-bold text-azure/80">AI Tutor</span>
                </div>
                <div className="relative rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.07] px-3.5 py-3">
                  <ReactMarkdown
                    components={{
                      p:          ({ children }: { children: any }) => <p className="text-xs text-white/75 leading-relaxed mb-2 last:mb-0">{children}</p>,
                      strong:     ({ children }: { children: any }) => <strong className="font-semibold text-white/90">{children}</strong>,
                      em:         ({ children }: { children: any }) => <em className="italic text-white/70">{children}</em>,
                      ul:         ({ children }: { children: any }) => <ul className="list-disc list-inside space-y-1 text-xs text-white/70 mb-2 mt-1">{children}</ul>,
                      ol:         ({ children }: { children: any }) => <ol className="list-decimal list-inside space-y-1 text-xs text-white/70 mb-2 mt-1">{children}</ol>,
                      li:         ({ children }: { children: any }) => <li className="text-xs text-white/70 leading-relaxed">{children}</li>,
                      h3:         ({ children }: { children: any }) => <h3 className="text-xs font-bold text-white/90 mb-1 mt-2">{children}</h3>,
                      code:       ({ children }: { children: any }) => <code className="text-[10px] font-mono bg-azure/15 text-azure px-1.5 py-0.5 rounded">{children}</code>,
                      blockquote: ({ children }: { children: any }) => <blockquote className="border-l-2 border-azure/30 pl-3 text-xs text-white/50 italic my-2">{children}</blockquote>,
                    }}>
                    {m.text}
                  </ReactMarkdown>
                  {/* Copy button */}
                  <button onClick={() => copyMsg(m.text, i)} title="Copy response"
                    className="absolute top-2 right-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition">
                    {copiedIdx === i
                      ? <Icon name="checkLine" size={12} className="text-green-400" />
                      : <Icon name="copyLine" size={12} className="text-white/30" />
                    }
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-1 pl-1">{m.time}</p>
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold text-azure/80">✨ AI Tutor</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.07] px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-azure/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-azure/50 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-azure/50 animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
                <span className="text-[11px] text-white/40">Thinking…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
        </div>
      </Scroll>

      {/* ── Input area ── */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10 flex-shrink-0 space-y-2">
        <div className="flex items-end gap-2 rounded-2xl bg-white/5 border border-white/8 focus-within:border-azure/40 px-3 py-2 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask anything about this lesson…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none leading-relaxed resize-none min-h-[20px]"
            style={{ height: '20px' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-azure hover:bg-royal transition disabled:opacity-40 disabled:cursor-not-allowed mb-0.5">
            <Icon name="send" size={14} className="text-white" />
          </button>
        </div>
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] text-white/25">Enter to send · Shift+Enter for newline</p>
          <p className="text-[10px] text-white/25">Powered by Claude</p>
        </div>
      </div>
    </div>
  );
}

// ── Discussion Section ────────────────────────────────────
function DiscussionSection({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function loadPosts() {
    try {
      const r = await api.get(`/platform-courses/${courseId}/lessons/${lessonId}/discussions`);
      setPosts(r.data ?? []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadPosts(); }, [courseId, lessonId]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/discussions`, { body: body.trim() });
      setBody('');
      await loadPosts();
    } catch {}
    finally { setPosting(false); }
  }

  async function handleReply(postId: string) {
    if (!replyBody.trim()) return;
    setReplyingId(postId);
    try {
      await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/discussions`, { body: replyBody.trim(), parentId: postId });
      setReplyTo(null);
      setReplyBody('');
      await loadPosts();
    } catch {}
    finally { setReplyingId(null); }
  }

  async function handleDelete(postId: string) {
    setDeleteConfirm(null);
    try {
      await api.delete(`/platform-courses/${courseId}/lessons/${lessonId}/discussions/${postId}`);
      await loadPosts();
    } catch {}
  }

  function authorName(a: DiscussionAuthor) {
    return [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Student';
  }

  function initials(a: DiscussionAuthor) {
    return [a.firstName?.[0], a.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'S';
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function Avatar({ author, size = 8 }: { author: DiscussionAuthor; size?: number }) {
    const dim = `h-${size} w-${size}`;
    if (author.avatarUrl) {
      return <img src={author.avatarUrl} alt={authorName(author)} className={`${dim} flex-shrink-0 rounded-full object-cover`} />;
    }
    return (
      <div className={`${dim} flex-shrink-0 flex items-center justify-center rounded-full bg-azure/20 text-azure font-bold`}
        style={{ fontSize: size <= 6 ? 10 : 12 }}>
        {initials(author)}
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--pl-divider)] pt-8 mt-4 space-y-5">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--pl-sub)]">Discussion</p>

      {/* New post form */}
      <form onSubmit={handlePost} className="flex gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure/20 text-xs font-bold text-azure">
          {user?.firstName?.[0] ?? 'M'}
        </div>
        <div className="flex-1 space-y-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Ask a question or share a thought…"
            rows={2}
            className="w-full rounded-xl bg-[var(--pl-input)] border border-[var(--pl-divider)] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-azure resize-none transition-colors"
          />
          {body.trim() && (
            <button type="submit" disabled={posting}
              className="rounded-lg bg-azure px-4 py-1.5 text-xs font-bold text-white hover:bg-royal transition disabled:opacity-50">
              {posting ? 'Posting…' : 'Post'}
            </button>
          )}
        </div>
      </form>

      {/* Posts */}
      {loading ? (
        <p className="text-[var(--pl-faint)] text-xs">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-[var(--pl-faint)] text-xs">No discussion yet. Be the first to ask a question!</p>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="space-y-3">
              {/* Top-level post */}
              <div className="flex gap-3">
                <Avatar author={post.author} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white">{authorName(post.author)}</span>
                    <span className="text-[11px] text-[var(--pl-faint)]">{timeAgo(post.createdAt)}</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{post.body}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button onClick={() => { setReplyTo(replyTo === post.id ? null : post.id); setReplyBody(''); }}
                      className="text-[11px] text-[var(--pl-sub)] hover:text-azure transition">
                      {replyTo === post.id ? 'Cancel' : 'Reply'}
                    </button>
                    {user?.id === post.author.id && (
                      deleteConfirm === post.id ? (
                        <span className="flex items-center gap-1.5">
                          <button onClick={() => handleDelete(post.id)}
                            className="text-[11px] text-red-400 font-semibold hover:text-red-300 transition">Confirm</button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="text-[11px] text-[var(--pl-sub)] hover:text-white/60 transition">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteConfirm(post.id)}
                          className="text-[11px] text-[var(--pl-faint)] hover:text-red-400 transition">Delete</button>
                      )
                    )}
                  </div>

                  {/* Reply form */}
                  {replyTo === post.id && (
                    <div className="mt-2 flex gap-2">
                      <textarea
                        value={replyBody}
                        onChange={e => setReplyBody(e.target.value)}
                        placeholder="Write a reply…"
                        rows={2}
                        autoFocus
                        className="flex-1 rounded-xl bg-[var(--pl-input)] border border-[var(--pl-divider)] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-azure resize-none transition-colors"
                      />
                      <button onClick={() => handleReply(post.id)} disabled={!replyBody.trim() || replyingId === post.id}
                        className="self-end rounded-lg bg-azure px-3 py-1.5 text-xs font-bold text-white hover:bg-royal transition disabled:opacity-40">
                        {replyingId === post.id ? '…' : 'Reply'}
                      </button>
                    </div>
                  )}

                  {/* Replies */}
                  {post.replies.length > 0 && (
                    <div className="mt-3 space-y-3 pl-4 border-l border-[var(--pl-divider)]">
                      {post.replies.map(reply => (
                        <div key={reply.id} className="flex gap-3">
                          <Avatar author={reply.author} size={6} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-white">{authorName(reply.author)}</span>
                              <span className="text-[11px] text-[var(--pl-faint)]">{timeAgo(reply.createdAt)}</span>
                            </div>
                            <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                            {user?.id === reply.author.id && (
                              deleteConfirm === reply.id ? (
                                <span className="flex items-center gap-1.5 mt-1">
                                  <button onClick={() => handleDelete(reply.id)}
                                    className="text-[11px] text-red-400 font-semibold hover:text-red-300 transition">Confirm</button>
                                  <button onClick={() => setDeleteConfirm(null)}
                                    className="text-[11px] text-[var(--pl-sub)] hover:text-white/60 transition">Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setDeleteConfirm(reply.id)}
                                  className="text-[11px] text-[var(--pl-faint)] hover:text-red-400 transition mt-1">Delete</button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Content Watermark ──────────────────────────────────────
// Floats the user's name over the lesson content at very low opacity.
// Moves through a 3×3 grid every 11 s so it can't be cropped out in screenshots.
// pointer-events: none — never interferes with clicks or scrolling.
function ContentWatermark() {
  const { user } = useAuth();
  const [posIdx, setPosIdx] = useState(() => Math.floor(Math.random() * 9));

  // 3×3 grid of % positions
  const POSITIONS = useMemo(() => [
    { x: 8,  y: 10 }, { x: 40, y: 10 }, { x: 70, y: 10 },
    { x: 8,  y: 45 }, { x: 40, y: 45 }, { x: 70, y: 45 },
    { x: 8,  y: 78 }, { x: 40, y: 78 }, { x: 70, y: 78 },
  ], []);

  useEffect(() => {
    const t = setInterval(() => setPosIdx(i => (i + 1) % POSITIONS.length), 11000);
    return () => clearInterval(t);
  }, [POSITIONS]);

  const label = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || '')
    : '';

  if (!label) return null;

  const { x, y } = POSITIONS[posIdx];
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      aria-hidden
      style={{ zIndex: 4 }}
    >
      <span
        className="absolute font-mono text-xs leading-none transition-all duration-[3000ms] ease-in-out"
        style={{
          left: `${x}%`,
          top:  `${y}%`,
          transform: 'rotate(-18deg)',
          color: 'rgba(255,255,255,0.07)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
