import { clsx } from 'clsx';

/** Shade pairs by subject group: same blues, slightly different per group. */
const SHADES = {
  sci: ['#3F6FE8', '#2F57C9'],
  math: ['#2F57C9', '#072061'],
  lang: ['#5889FA', '#3F6FE8'],
  biz: ['#072061', '#2F57C9'],
  health: ['#4A7BF0', '#1F3F9E'],
} as const;
type Group = keyof typeof SHADES;

/** Subject keyword → [group, glyph]. First match wins, so put the specific ones first. */
const RULES: [RegExp, Group, string][] = [
  [/pharma/i, 'health', '℞'],
  [/nurs|nclex|health|medic|anatom|physiol/i, 'health', '+'],
  [/bio/i, 'sci', '❦'],
  [/chem/i, 'sci', '⚗'],
  [/phys/i, 'sci', 'F'],
  [/geog|earth/i, 'sci', '◍'],
  [/comput|ict|program|informat/i, 'sci', '{}'],
  [/agric/i, 'sci', '✿'],
  [/stat|probab/i, 'math', '%'],
  [/math|algebra|calcul|geomet/i, 'math', '∑'],
  [/account|acca|financ|econom|business|commerce|market|manage/i, 'biz', '₵'],
  [/law|legal/i, 'biz', '§'],
  [/hist|govern|civic|relig|philos/i, 'lang', '¶'],
  [/liter/i, 'lang', '“'],
  [/french|français|francais|tef|tcf|delf/i, 'lang', 'Fr'],
  [/english|ielts|toefl|language|writing|reading/i, 'lang', 'Aa'],
];

function pick(text: string): [Group, string] {
  for (const [re, g, glyph] of RULES) if (re.test(text)) return [g, glyph];
  const word = text.trim().split(/\s+/)[0] ?? '';
  return ['sci', (word[0] ?? 'C').toUpperCase()];
}

export interface CoverCourse {
  title: string;
  coverUrl?: string | null;
  subject?: { name: string } | null;
  programme?: { name: string; shortName?: string | null } | null;
}

/** A course's cover: its uploaded picture, or one made from its programme and subject. Same course, same cover. */
export function CourseCover({ course, variant = 'banner', size = 'md', className }: { course: CoverCourse; variant?: 'banner' | 'tile'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const tileBox = size === 'sm' ? 'h-10 w-10 rounded-md text-[14px]' : size === 'lg' ? 'h-14 w-14 rounded-lg text-[19px]' : 'h-11 w-11 rounded-md text-[15px]';
  if (course.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={course.coverUrl} alt="" className={clsx('object-cover', variant === 'banner' ? 'h-[130px] w-full' : tileBox, 'flex-shrink-0', className)} />;
  }
  const subject = course.subject?.name ?? '';
  const [group, glyph] = pick(`${subject} ${subject ? '' : course.title}`.trim() || course.title);
  const [a, b] = SHADES[group];
  const bg = { background: `linear-gradient(135deg, ${a}, ${b})` };
  if (variant === 'tile') {
    return (
      <span aria-hidden className={clsx('relative flex flex-shrink-0 items-center justify-center overflow-hidden font-extrabold text-white', tileBox, className)} style={bg}>
        {glyph}
      </span>
    );
  }
  const prog = course.programme?.shortName || course.programme?.name;
  return (
    <div aria-hidden className={clsx('relative h-[130px] w-full overflow-hidden', className)} style={bg}>
      <span className="pointer-events-none absolute -bottom-8 -right-4 select-none text-[150px] font-extrabold leading-none text-white/[0.14]">{glyph}</span>
      {prog && <span className="absolute left-3.5 top-3 rounded-[5px] bg-white/20 px-2 py-[3px] text-[11px] font-bold text-white">{prog}</span>}
      <span className="absolute bottom-3 left-3.5 right-3.5 truncate text-[22px] font-extrabold tracking-[-0.02em] text-white">{subject || course.title}</span>
    </div>
  );
}
