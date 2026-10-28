'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Cell { month: string; lessons: number; practice: number; quizzes: number; total: number; }
interface Row { courseId: string; title: string; subject: string | null; total: number; cells: Cell[]; }
interface Activity { months: { key: string; label: string }[]; rows: Row[]; max: number; }

/** Five steps of the brand blue; step 0 is an empty square. Alpha keeps it right on light and dark surfaces. */
const STEPS = [0, 0.2, 0.4, 0.65, 0.92];
function step(total: number, max: number) {
  if (!total || !max) return 0;
  return Math.min(4, Math.max(1, Math.ceil((total / max) * 4)));
}
function swatch(level: number) {
  return level ? { background: `rgba(88, 137, 250, ${STEPS[level]})` } : undefined;
}
function describe(c: Cell) {
  if (!c.total) return 'No study';
  const parts = [
    c.lessons && `${c.lessons} lesson${c.lessons === 1 ? '' : 's'}`,
    c.practice && `${c.practice} practice set${c.practice === 1 ? '' : 's'}`,
    c.quizzes && `${c.quizzes} quiz${c.quizzes === 1 ? '' : 'zes'}`,
  ].filter(Boolean);
  return parts.join(', ');
}

/** Study activity per course per month — which subjects are getting attention and which are being left behind. */
export function StudyHeatmap() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    api.get(`/portals/student/study-activity?months=${months}`)
      .then(r => setData(r.data))
      .catch(() => setFailed(true));
  }, [months]);

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-navy">Study activity</h2>
          <p className="mt-0.5 text-[13px] text-muted">Lessons, practice and quizzes per course each month</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink2">
          <span className="sr-only">Period</span>
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            className="h-8 rounded-md border border-line bg-white px-2 text-[13px] font-semibold text-navy outline-none focus:border-azure">
            <option value={12}>Last 12 months</option>
            <option value={6}>Last 6 months</option>
          </select>
        </label>
      </div>

      {failed ? (
        <p className="py-8 text-center text-[13px] text-muted">Couldn&apos;t load your study activity. Refresh the page to try again.</p>
      ) : !data ? (
        <div className="h-40 rounded-md bg-subtle animate-pulse" />
      ) : !data.rows.length ? (
        <p className="py-8 text-center text-[13px] text-muted">
          Your study activity will appear here once you complete lessons, practice questions or quizzes.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-separate" style={{ borderSpacing: 4 }}>
              <caption className="sr-only">Study activity by course and month</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[30%]"><span className="sr-only">Course</span></th>
                  {data.months.map(m => (
                    <th key={m.key} scope="col" className="pb-1 text-center text-xs font-medium text-muted">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.courseId}>
                    <th scope="row" className="max-w-0 pr-3 text-left text-[13px] font-medium text-ink2">
                      <span className="block truncate" title={r.title}>{r.subject ?? r.title}</span>
                    </th>
                    {r.cells.map((c, i) => {
                      const level = step(c.total, data.max);
                      const label = `${r.subject ?? r.title}, ${data.months[i].label}: ${describe(c)}`;
                      return (
                        <td key={c.month} title={label} aria-label={label}
                          className={level ? 'h-9 rounded' : 'h-9 rounded border border-line bg-subtle'}
                          style={swatch(level)} />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted" aria-hidden>
            <span className="mr-1">Less</span>
            {[0, 1, 2, 3, 4].map(l => (
              <span key={l} className={l ? 'h-3.5 w-3.5 rounded-sm' : 'h-3.5 w-3.5 rounded-sm border border-line bg-subtle'} style={swatch(l)} />
            ))}
            <span className="ml-1">More</span>
          </div>
        </>
      )}
    </section>
  );
}
