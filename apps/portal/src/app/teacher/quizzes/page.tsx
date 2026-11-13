'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { TeacherQuizzesHero, QuizzesWork } from '@/components/hero/TeacherWorkHeroes';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

const btn = 'inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle';

/** Every quiz across the teacher's courses with how students score, modules without one, and assignments without a rubric */
export default function TeacherQuizzesPage() {
  const [d, setD] = useState<QuizzesWork | null>(null);
  useEffect(() => { api.get('/portals/teacher/work/quizzes').then(r => setD(r.data)).catch(() => notify.error('Could not load quizzes')); }, []);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Quizzes and rubrics" subtitle="How students score on your quizzes, and what still needs one" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {d ? <TeacherQuizzesHero d={d} /> : <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />}

        {d?.courses.map(c => (
          <section key={c.id} className="rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-[18px] py-3.5">
              <h2 className="min-w-0 flex-1 truncate text-base font-bold text-navy">{c.title} <span className="font-medium text-muted">{c.quizzes.length}</span></h2>
              {c.quizzes.length > 0 && <Link href={`/teacher/quiz-builder/${c.id}`} className={btn}>Quiz builder</Link>}
              <Link href={`/teacher/courses/${c.id}/builder`} className={btn}>Course builder</Link>
            </div>
            {!c.quizzes.length ? <p className="px-4 py-6 text-center text-[13px] text-ink2">No quizzes in this course yet. Add a quiz lesson to a module in the course builder.</p>
              : c.quizzes.map(q => (
                <div key={q.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3 first-of-type:border-t-0">
                  <div className="min-w-0 flex-[999_1_220px]">
                    <p className="truncate text-sm font-semibold text-navy">{q.title}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">{q.module} · {q.questions ? `${q.questions} question${q.questions === 1 ? '' : 's'}` : 'no questions yet'}</p>
                  </div>
                  <div className="w-[170px]">
                    {q.attempts ? <>
                      <p className="mb-1 text-[12.5px] text-ink2">Average {q.avgPct}%{q.passPct != null ? ` · ${q.passPct}% pass` : ''}</p>
                      <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${q.avgPct ?? 0}%` }} /></span>
                      <p className="mt-0.5 text-[11.5px] text-muted">{q.attempts} attempt{q.attempts === 1 ? '' : 's'}</p>
                    </> : <p className="text-[12.5px] text-muted">Not taken yet</p>}
                  </div>
                  <Link href={`/teacher/quiz-builder/${c.id}?lessonId=${q.id}`} className={btn}>{q.questions ? 'Edit' : 'Add questions'}</Link>
                </div>
              ))}
          </section>
        ))}

        {d && (d.noQuiz.length > 0 || d.withoutRubric.length > 0) && (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {d.noQuiz.length > 0 && (
              <section className="rounded-lg border border-line bg-white">
                <h2 className="border-b border-line px-[18px] py-3.5 text-base font-bold text-navy">Modules without a quiz <span className="font-medium text-muted">{d.noQuiz.length}</span></h2>
                {d.noQuiz.map(m => (
                  <div key={m.moduleId} className="flex items-center gap-3 border-t border-line px-[18px] py-3 first-of-type:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{m.module}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted">{m.course} · {m.lessons} lesson{m.lessons === 1 ? '' : 's'}</p>
                    </div>
                    <Link href={`/teacher/courses/${m.courseId}/builder`} className={btn}>Add a quiz</Link>
                  </div>
                ))}
              </section>
            )}
            {d.withoutRubric.length > 0 && (
              <section className="rounded-lg border border-line bg-white">
                <h2 className="border-b border-line px-[18px] py-3.5 text-base font-bold text-navy">Assignments without a rubric <span className="font-medium text-muted">{d.stats.assignments - d.stats.rubrics}</span></h2>
                {d.withoutRubric.map(a => (
                  <div key={a.id} className="flex items-center gap-3 border-t border-line px-[18px] py-3 first-of-type:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">Due {new Date(a.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <Link href={`/teacher/rubrics/${a.id}`} className={btn}>Add a rubric</Link>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
