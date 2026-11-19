import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';

export interface Preview { module: string; lesson: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; lines: string[] | null; lessons: string[] }

const TYPE: Record<Preview['type'], [IconName, string]> = { TEXT: ['docLine', 'Reading'], VIDEO: ['play', 'Video'], QUIZ: ['question', 'Quiz'], LIVE: ['live', 'Live class'] };
const clean = (t: string) => t.replace(/^\d+[.)]\s*/, '');

/**
 * The course's first lesson, drawn like the course player (it isn't a screenshot): the module's lessons on the left,
 * the lesson on the right with its opening lines when the course is free, fading out under a button that opens it.
 */
export function LessonPreview({ p, href }: { p: Preview; href: string }) {
  const [icon, kind] = TYPE[p.type] ?? TYPE.TEXT;
  return (
    <Link href={href} aria-label={`Open the first lesson: ${clean(p.lesson)}`} className="group relative grid h-[230px] grid-cols-[118px_minmax(0,1fr)] overflow-hidden rounded-[14px] bg-[#0B1640] text-[#FFFFFF]">
      <div aria-hidden className="flex flex-col gap-1.5 border-r border-[rgba(255,255,255,0.08)] bg-[#0E1C4D] px-2.5 py-3">
        <span className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-[#7FA3FF]">Course overview</span>
        <span className="h-1 rounded-full bg-[rgba(255,255,255,0.1)]"><span className="block h-1 w-[12%] rounded-full bg-[#3F6FE8]" /></span>
        <span className="mt-1 line-clamp-2 text-[9.5px] font-bold leading-tight">{p.module}</span>
        {p.lessons.map((l, i) => (
          <span key={l + i} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[8.5px] leading-tight ${i === 0 ? 'bg-[#2F57C9] text-[#FFFFFF]' : 'text-[rgba(255,255,255,0.45)]'}`}>
            {i === 0 ? <Icon name={icon} size={9} /> : <Icon name="lock" size={8} />}<span className="truncate">{clean(l)}</span>
          </span>
        ))}
      </div>
      <div aria-hidden className="relative flex min-w-0 flex-col gap-2 px-4 py-3.5">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[rgba(127,163,255,0.4)] px-2 py-0.5 text-[9.5px] font-bold text-[#7FA3FF]"><Icon name={icon} size={10} />{kind}</span>
        <b className="line-clamp-2 text-[17px] leading-tight tracking-[-0.01em]">{clean(p.lesson)}</b>
        {p.lines ? (
          <ul className="flex flex-col gap-1">
            {p.lines.map((l, i) => <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug text-[rgba(255,255,255,0.78)]"><span className="mt-[5px] h-1 w-1 flex-shrink-0 rounded-full bg-[#7FA3FF]" /><span className="line-clamp-2">{l}</span></li>)}
          </ul>
        ) : (
          <span className="flex flex-col gap-1.5 pt-1">{[92, 80, 86, 64].map(w => <span key={w} className="h-2 rounded-full bg-[rgba(255,255,255,0.12)]" style={{ width: `${w}%` }} />)}</span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(transparent,#0B1640)]" />
      </div>
      <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FFFFFF] px-3.5 py-1.5 text-[12.5px] font-extrabold text-navy shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-transform group-hover:scale-105">
        <Icon name="play" size={13} className="text-[#2F57C9]" />Open the first lesson
      </span>
    </Link>
  );
}
