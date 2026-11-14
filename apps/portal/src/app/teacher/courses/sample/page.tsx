'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { PageHero, heroBtn, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { VideoThumb } from '@/components/ui/VideoThumb';
import api from '@/lib/api';

type LessonType = 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE';
interface Lesson { id: string; title: string; type: LessonType; content: string | null; videoUrl: string | null; durationSecs: number | null; isFree: boolean; passMark: number | null; timeLimitSecs: number | null; attachments: { id: string; name: string; url: string }[] }
interface Question { id: string; lessonId: string; questionText: string; type: string; difficulty: string; options: { id: string; text: string }[] | null; correctAnswer: string; explanation: string | null }
interface Sample { id: string; title: string; description: string | null; outcomes: string[]; modules: { id: string; title: string; lessons: Lesson[] }[]; questions: Question[]; _count: { enrollments: number } }

const TYPE: Record<LessonType, [string, string, string]> = {
  VIDEO: ['Video', 'bg-[#EAF0FF] text-[#2F57C9]', 'A short video teaches the idea. 10 to 15 minutes keeps students with you.'],
  TEXT: ['Notes', 'bg-[#E3F5EC] text-[#1A7F4B]', 'Notes students can read again before the exam: headings, key rules, a worked example.'],
  QUIZ: ['Quiz', 'bg-[#FFF3DC] text-[#8A5A0B]', 'A quiz closes the module: at least 3 questions, each with an explanation.'],
  LIVE: ['Live', 'bg-[#FDE8E8] text-[#A12A2A]', 'A live class on the module, recorded for anyone who missed it.'],
};

/** The sample course, open to read in full, so teachers can build theirs the same way */
export default function SampleCoursePage() {
  const [d, setD] = useState<Sample | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.get('/platform-courses/sample').then(r => setD(r.data)).catch(() => setFailed(true)); }, []);

  const lessons = d?.modules.flatMap(m => m.lessons) ?? [];
  const quizzes = lessons.filter(l => l.type === 'QUIZ').length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Sample course" subtitle="A course built the way we recommend: copy its shape for yours" backHref="/teacher/courses" backLabel="My courses" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {failed ? <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-ink2">The sample course isn’t available right now.</p>
          : !d ? <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" /> : <>
          <PageHero
            kicker={`Sample course · ${d.modules.length} modules · ${lessons.length} lessons · ${d.questions.length} quiz questions`}
            l1="Build yours" l2="the same way."
            sub={<>“{d.title}” shows the format that works best for students: every module teaches with a video, gives notes to read again, then checks understanding with a short quiz. Open any lesson below to see exactly what’s inside.</>}
            chips={[{ t: `${d.modules.length} modules`, strong: true }, { t: `${quizzes} quizzes` }, { t: 'First lesson is a free preview' }]}
            actions={<>
              <Link href="/teacher/courses" className={heroBtn}>Start my course</Link>
              <a href="#modules" className={heroBtnLine}>See the lessons</a>
            </>}
            aside={<>
              <p className={asideLabel}>The pattern, in every module</p>
              {(['VIDEO', 'TEXT', 'QUIZ'] as LessonType[]).map((t, i) => (
                <div key={t} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
                  <span><span className="block text-[13.5px] font-bold">{TYPE[t][0] === 'Notes' ? 'Notes to read again' : TYPE[t][0] === 'Quiz' ? 'A quiz to finish' : 'A video to learn'}</span><span className="block text-xs text-muted">{TYPE[t][2]}</span></span>
                </div>
              ))}
            </>}
          />

          {d.outcomes?.length > 0 && (
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="text-base font-bold text-navy">What students will be able to do</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-ink2">{d.outcomes.map(o => <li key={o}>{o}</li>)}</ul>
            </section>
          )}

          <div id="modules" className="flex scroll-mt-4 flex-col gap-4">
            {d.modules.map((m, mi) => (
              <section key={m.id} className="overflow-hidden rounded-xl border border-line bg-white">
                <h2 className="flex items-center gap-3 border-b border-line bg-subtle px-5 py-3.5 text-[15px] font-bold text-navy">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy/10 text-xs font-black">{mi + 1}</span>{m.title}
                  <span className="ml-auto text-xs font-medium text-muted">{m.lessons.length} lessons</span>
                </h2>
                {m.lessons.map(l => {
                  const qs = d.questions.filter(q => q.lessonId === l.id);
                  const isOpen = open === l.id;
                  return (
                    <div key={l.id} className="border-t border-line first-of-type:border-t-0">
                      <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-subtle">
                        <span className={clsx('inline-flex h-6 w-14 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold', TYPE[l.type][1])}>{TYPE[l.type][0]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-navy">{l.title}</span>
                          <span className="block text-xs text-muted">
                            {[l.isFree ? 'Free preview' : null, l.type === 'QUIZ' ? `${qs.length} questions${l.passMark ? ` · pass mark ${l.passMark}%` : ''}${l.timeLimitSecs ? ` · ${Math.round(l.timeLimitSecs / 60)} min` : ''}` : null, l.attachments.length ? `${l.attachments.length} file${l.attachments.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || TYPE[l.type][2]}
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-azure-strong">{isOpen ? 'Close' : 'Open'}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-line bg-[#FBFCFE] px-5 py-4">
                          <p className="mb-3 text-xs text-muted">{TYPE[l.type][2]}</p>
                          {l.type === 'VIDEO' && l.videoUrl && <VideoThumb url={l.videoUrl} label={l.title} href={l.videoUrl} className="max-w-md" />}
                          {l.type === 'TEXT' && <div className="prose prose-sm max-w-none text-navy [&_img]:rounded-lg" dangerouslySetInnerHTML={{ __html: l.content ?? '' }} />}
                          {l.type === 'QUIZ' && (
                            <ol className="flex flex-col gap-3">
                              {qs.map((q, qi) => (
                                <li key={q.id} className="rounded-lg border border-line bg-white p-3.5">
                                  <p className="text-[13.5px] font-semibold text-navy">{qi + 1}. {q.questionText} <span className="ml-1 text-[11px] font-medium text-muted">{q.type === 'WRITTEN' ? 'Written answer' : 'Multiple choice'} · {q.difficulty.toLowerCase()}</span></p>
                                  {q.options?.length ? (
                                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                      {q.options.map(o => <li key={o.id} className={clsx('rounded-md border px-2.5 py-1.5 text-[13px]', o.id === q.correctAnswer ? 'border-[#1A7F4B] bg-[#E3F5EC] font-semibold text-[#1A7F4B]' : 'border-line text-ink2')}>{o.id === q.correctAnswer ? '✓ ' : ''}{o.text}</li>)}
                                    </ul>
                                  ) : <p className="mt-2 text-[13px] text-ink2">Model answer: <b className="text-navy">{q.correctAnswer}</b></p>}
                                  {q.explanation && <p className="mt-2 text-xs text-muted">Why: {q.explanation}</p>}
                                </li>
                              ))}
                            </ol>
                          )}
                          {l.attachments.length > 0 && <p className="mt-3 text-xs text-ink2">Files: {l.attachments.map(a => <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="mr-2 font-semibold text-azure-strong hover:underline">{a.name}</a>)}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <p className="text-xs text-muted">Students can join this course for free from the catalogue, so you can also see it the way they do.</p>
        </>}
      </div>
    </div>
  );
}
