'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { BAND_LABEL } from '@/components/tests/cat';

interface Point { id: string; title: string; kind: 'MOCK' | 'PAST_PAPER' | 'CAT'; date: string; percent: number; band: string | null }
interface Data {
  results: Point[];
  passMark: number;
  tiles: {
    bestMock: { value: number; since: number | null; sinceDate: string | null } | null;
    readiness: { band: string; title: string; up: number | null; prev: string | null } | null;
    studied: { thisMonthHours: number; lastMonthHours: number };
  };
  calendar: { days: { date: string; count: number; level: number }[]; streak: number };
}

const SHADE = ['#EDF1F8', '#C9D6FF', '#5889FA', '#2F57C9'];
const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const month = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long' });
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);

/** Tiles, results-over-time chart and study calendar. Every point is a real result. */
export function ProgressViz() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api.get('/test-centre/progress').then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <div className="h-[340px] animate-pulse rounded-[10px] bg-subtle" />;

  const { bestMock, readiness, studied } = d.tiles;
  const dh = Math.round((studied.thisMonthHours - studied.lastMonthHours) * 10) / 10;
  const tiles = [
    { l: 'Best mock score', v: bestMock ? `${bestMock.value}%` : '—', d: bestMock?.since != null && bestMock.since !== 0 ? `${bestMock.since > 0 ? '↑' : '↓'} ${Math.abs(bestMock.since)} points since ${month(bestMock.sinceDate!)}` : bestMock ? 'Your best so far' : 'Take a mock exam to see it here' },
    { l: readiness ? `Readiness (${readiness.title.split(/\s+/)[0]})` : 'Readiness', v: readiness ? BAND_LABEL[readiness.band] ?? readiness.band : '—', d: readiness?.prev && readiness.up ? `${readiness.up > 0 ? '↑' : '↓'} from ${BAND_LABEL[readiness.prev] ?? readiness.prev}` : readiness ? 'From your latest readiness test' : 'Take a readiness test to see it' },
    { l: 'Studied this month', v: hrs(studied.thisMonthHours), d: dh ? `${dh > 0 ? '↑' : '↓'} ${hrs(Math.abs(dh))} on last month` : 'Lessons and tests together' },
  ];

  // Chart geometry
  const pts = d.results;
  const W = 600, H = 240, L = 40, Rr = 590, top = 26, bottom = 210;
  const x = (i: number) => (pts.length === 1 ? (L + Rr) / 2 : L + 30 + (i * (Rr - L - 60)) / (pts.length - 1));
  const y = (p: number) => bottom - ((bottom - top) * p) / 100;
  const first = pts.find(p => p.kind !== 'CAT');
  const last = [...pts].reverse().find(p => p.kind !== 'CAT');
  const gain = first && last && first !== last ? last.percent - first.percent : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-3">
        {tiles.map(t => (
          <div key={t.l} className="rounded-[10px] border border-line bg-white px-[18px] py-4">
            <span className="text-[12.5px] text-muted">{t.l}</span>
            <p className="mt-1 text-[26px] font-extrabold text-navy">{t.v}</p>
            <span className="text-[12.5px] font-semibold text-[#2F57C9] dark:text-[#8FB0FF]">{t.d}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-line bg-white p-[18px]">
          <div className="flex flex-wrap justify-between gap-2"><strong className="text-[15px] text-navy">Your mock and CAT results over time</strong><span className="text-[12.5px] text-muted">Pass mark {d.passMark}% · readiness as a chance</span></div>
          {pts.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full" role="img" aria-label="Results over time">
              <line x1={L} y1={y(d.passMark)} x2={Rr} y2={y(d.passMark)} stroke="#C9D3E6" strokeDasharray="4 4" />
              <text x={L + 4} y={y(d.passMark) - 6} fontSize="11" fill="#637090">pass mark</text>
              <line x1={L} y1={bottom} x2={Rr} y2={bottom} stroke="#E4E9F3" />
              {pts.length > 1 && <polyline points={pts.map((p, i) => `${x(i)},${y(p.percent)}`).join(' ')} fill="none" stroke="#3F6FE8" strokeWidth="3" strokeLinejoin="round" />}
              {pts.map((p, i) => (
                <g key={p.id}>
                  <title>{`${p.title} · ${p.percent}%${p.kind === 'CAT' ? ' chance of being above the standard' : ''}`}</title>
                  <circle cx={x(i)} cy={y(p.percent)} r="6" fill={p.kind === 'CAT' ? '#3F6FE8' : '#FFFFFF'} stroke="#3F6FE8" strokeWidth="3" />
                  <text x={x(i)} y={y(p.percent) - 12} textAnchor="middle" fontSize="11.5" fontWeight="700" className="fill-navy">{p.percent}%</text>
                  {(pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1) && <text x={x(i)} y="230" textAnchor="middle" fontSize="10.5" fill="#637090">{short(p.date)}</text>}
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg bg-subtle text-center">
              <p className="text-sm text-ink2">Your mock exam and readiness results will draw a line here.</p>
              <Link href="/student/tests/mocks" className="text-[13px] font-semibold text-[#3F6FE8]">See mock exams →</Link>
            </div>
          )}
          {gain != null && <span className="text-[13px] text-ink2">{gain >= 0 ? <>Up <strong className="text-navy">{gain} points</strong> since your first mock.</> : <>Down {Math.abs(gain)} points on your first mock. Practise your weak topics, then try again.</>}</span>}
          <span className="text-[11.5px] text-muted">Filled dots are readiness tests: the chance you’re above the standard. Open dots are mock exams and past papers.</span>
        </section>
        <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-[18px]">
          <div className="flex justify-between"><strong className="text-[15px] text-navy">Study calendar</strong>{d.calendar.streak > 0 && <span className="text-[12.5px] font-bold text-[#3F6FE8]">🔥 {d.calendar.streak}-day streak</span>}</div>
          <div className="grid grid-cols-7 gap-[5px] text-center text-[10.5px] text-muted">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i}>{w}</span>)}
            {d.calendar.days.map(c => (
              <span key={c.date} title={c.level < 0 ? '' : `${short(c.date)} · ${c.count ? `${c.count} thing${c.count === 1 ? '' : 's'} studied` : 'nothing'}`}
                className="h-[22px] rounded" style={{ background: c.level < 0 ? 'transparent' : SHADE[c.level], outline: c.level < 0 ? '1px dashed #E4E9F3' : undefined }} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">Less{SHADE.map(s => <span key={s} className="h-3 w-3 rounded-[3px]" style={{ background: s }} />)}More</div>
        </section>
      </div>
    </div>
  );
}
