import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Cover, price } from '@/components/public/PublicChrome';
import { PlayPreview } from './PlayPreview';

export interface CardCourse {
  id: string; slug: string; title: string; coverUrl: string | null;
  exam: string | null; subject: string | null; level?: string | null;
  lessons: number; questions?: number; topics?: string[];
  selling: 'free' | 'paid' | 'package' | 'notsale'; price: { amount: number; currency: string } | null;
  inPackage?: boolean; added?: string; website?: boolean;
  teacher: { name: string | null; avatarUrl: string | null } | null;
}

const ACRONYMS = /^(gce|ielts|toefl|wassce|waec|neco|acca|ict|atp|dna|rna|sat|gre|gmat|ii|iii|iv)$/i;
const SMALL = /^(a|an|and|as|at|by|for|in|of|on|or|the|to|with)$/i;
/** "INTRODUCTION TO AND PALM-WINE WILL FLOW" → "Introduction to And Palm-Wine Will Flow"; mixed case is left alone */
function tidy(t: string) {
  if (/[a-z]/.test(t)) return t;
  return t.toLowerCase().split(/\s+/).map((w, i) => ACRONYMS.test(w) ? w.toUpperCase() : i && SMALL.test(w) ? w : w.replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())).join(' ');
}

/**
 * Titles brought over from the website carry the exam and class in front:
 * "Cameroon GCE, Form Five, Human Biology – HOUSING" → title "Human Biology: Housing", class "Form Five"
 */
export function cardTitle(raw: string): { title: string; form: string | null } {
  let t = raw.replace(/^\s*Cameroon\s+GCE\s*[,.]?\s*/i, '');
  let form: string | null = null;
  // "Form Five", "Form Upper Sixth", and ranges like "Form Four-Five" or "Form 4 and 5"
  const N = 'Upper Sixth|Lower Sixth|One|Two|Three|Four|Five|[1-5]';
  const f = new RegExp(`^Form\\s+((?:${N})(?:\\s*(?:-|–|and|&)\\s*(?:${N}))?)\\s*[,.:]?\\s*`, 'i').exec(t);
  if (f) { form = /sixth/i.test(f[1]) ? tidy(f[1].toUpperCase()) : `Form ${tidy(f[1].toUpperCase()).replace(/\s*[-–]\s*/, '–')}`; t = t.slice(f[0].length); }
  const parts = t.split(/\s+[–—-]\s+/);
  let head = parts.length > 1 ? parts.slice(0, -1).join(' – ') : null;
  let tail = (parts.length > 1 ? parts[parts.length - 1] : t).replace(/^[–—-]\s*/, '').replace(/^Lesson\s*Title\s*:\s*/i, '').replace(/\s*\([^)]{12,}\)\s*$/, '').trim();
  // "TOEFL TEST – Succeeding in …": the exam alone in front adds nothing
  if (head && /^(\w+\s+)?(test|exam)$/i.test(head)) head = null;
  tail = tidy(tail);
  // Leftover separators at the start ("– LESSON 1: …")
  return { title: (head ? `${tidy(head)}: ${tail}` : tail).replace(/^[\s–—.,:-]+/, ''), form };
}

const TEST_PREP = /^(ielts|toefl|sat|gre|gmat|duolingo)/i;
/** Bars for the level meter: O-Level two, A-Level three; null = no meter */
function bars(level: string | null | undefined, exam: string | null) {
  const l = `${level ?? ''} ${exam ?? ''}`;
  if (/a.?level|advanced|sixth/i.test(l)) return 3;
  if (/o.?level|ordinary|wassce|waec|neco/i.test(l)) return 2;
  return null;
}

/** For the Level filter: 'o' (O-Level), 'a' (A-Level), 'prep' (IELTS, TOEFL…), '' unknown */
export function levelKey(level: string | null | undefined, exam: string | null): '' | 'o' | 'a' | 'prep' {
  if (exam && TEST_PREP.test(exam)) return 'prep';
  const n = bars(level, exam);
  return n === 3 ? 'a' : n === 2 ? 'o' : '';
}

/**
 * Course card grids, by the room they have (wrap them in an `@container`): 4 a row when there's space, 3 on tablets, 2, then 1 on phones.
 * ROW_GRID is for a single row of up to 4: the 4th card hides until there are 4 columns, so a row never leaves one alone.
 */
export const CARD_GRID = 'grid grid-cols-1 gap-x-4 gap-y-6 @[420px]:grid-cols-2 @[640px]:grid-cols-3 @[860px]:grid-cols-4';
export const ROW_GRID = `${CARD_GRID} [&>*:nth-child(4)]:hidden @[860px]:[&>*:nth-child(4)]:flex`;

const DAY = 86400000;
type Badge = { icon: IconName; label: string; cls: string };

/** A signed-in student's own state: how far they are and where Continue goes */
export interface CardMine { pct: number; next: string | null; href: string }

/**
 * The course card: badges above, a banner with the cover and the teacher, the title and play button, level, what it covers. Hover fills it blue.
 * In the portal it opens the student's course page (`href`), shows their progress and Continue (`mine`), and names the package a course is only sold in (`onlyIn`).
 */
export function BigCourseCard({ c, href, mine, onlyIn }: { c: CardCourse; href?: string; mine?: CardMine | null; onlyIn?: string | null }) {
  const { title, form } = cardTitle(c.title);
  const prep = !!c.exam && TEST_PREP.test(c.exam);
  const n = bars(c.level, c.exam);
  const levelLabel = prep ? 'Test prep' : c.level ?? (n === 3 ? 'A-Level' : n === 2 ? (/o.?level|ordinary/i.test(c.exam ?? '') ? 'O-Level' : 'Secondary') : null);
  const eyebrow = [c.exam, form ?? (prep ? c.subject?.replace(new RegExp(`^${c.exam}\\s*`, 'i'), '') || null : c.subject)].filter(Boolean).join(' · ');
  const isNew = !!c.added && Date.now() - new Date(c.added).getTime() < 14 * DAY;
  const badges = ([
    c.website ? { icon: 'clock', label: 'Lessons coming', cls: 'bg-[#FFF1D6] text-[#8A5A00]' } : null,
    c.selling === 'free' ? { icon: 'gift', label: 'Free', cls: 'bg-[#17703A] text-[#FFFFFF]' } : null,
    isNew ? { icon: 'star', label: 'New', cls: 'bg-[linear-gradient(120deg,#2F57C9,#5B82F5)] text-[#FFFFFF]' } : null,
    onlyIn ? { icon: 'packages', label: `In ${onlyIn.replace(/\s+Package$/i, '')}`, cls: 'bg-[#072061] text-[#FFFFFF]' }
      : c.inPackage ? { icon: 'packages', label: 'In a package', cls: 'bg-[#072061] text-[#FFFFFF]' } : null,
    c.questions ? { icon: 'grade', label: 'Practice questions', cls: 'bg-[linear-gradient(120deg,#2F57C9,#5B82F5)] text-[#FFFFFF]' } : null,
  ].filter(Boolean) as Badge[]).slice(0, 2);
  const cost = mine ? null : c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'package' && !onlyIn ? 'In a package' : c.selling === 'notsale' ? 'Soon' : null;
  const page = href ?? `/courses/${c.slug}`;
  // Lesson titles as written (lowercasing them would break names and places)
  const covers = c.topics?.length ? c.topics.map(tidy).join(' · ') : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-[26px] gap-1.5 overflow-hidden">
        {badges.map(b => <span key={b.label} className={clsx('inline-flex h-[26px] flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-extrabold', b.cls)}><Icon name={b.icon} size={13} />{b.label}</span>)}
      </div>
      <div className="group relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white text-navy transition duration-300 hover:-translate-y-1 hover:border-[#3F6FE8] hover:shadow-[0_22px_44px_rgba(47,87,201,0.28)]">
        {/* The whole card opens the course; the play button sits above this link */}
        <Link href={mine ? mine.href : page} aria-label={title} className="absolute inset-0 z-[1] rounded-2xl" />
        {/* Banner: the cover tilted like a book, the teacher on a blue swoosh */}
        <span className={clsx('relative block h-[150px] overflow-hidden', c.website ? 'bg-[linear-gradient(125deg,#3A4A6B,#637090)]' : 'bg-[linear-gradient(125deg,#072061_0%,#1B3A94_55%,#2F57C9_100%)]')}>
          <span className={clsx('absolute -right-[30px] -top-5 h-[220px] w-[190px] -skew-x-[14deg] rounded-[40px_0_0_120px] transition-transform duration-[350ms] group-hover:-translate-x-2.5', c.website ? 'bg-[linear-gradient(200deg,#C9D4F2,#9AA8D2)] opacity-70' : 'bg-[linear-gradient(200deg,#8EA8FF,#3F6FE8_60%,#2F57C9)] opacity-95')} />
          <span className="absolute left-[7%] top-5 aspect-square w-[40%] max-w-[104px] -rotate-6 overflow-hidden rounded-xl bg-[#FFFFFF] shadow-[0_14px_28px_rgba(0,0,0,0.35)] transition-transform duration-[350ms] group-hover:-rotate-2 group-hover:scale-105">
            <Cover src={c.coverUrl} label={c.subject ?? c.exam} seed={c.id} className="h-full w-full" />
          </span>
          <span className="absolute right-[8%] top-6 flex aspect-square w-[35%] max-w-24 rotate-[4deg] items-center justify-center overflow-hidden rounded-[18px] bg-[#FFFDF8] text-[30px] font-extrabold text-[#3F6FE8] shadow-[0_14px_28px_rgba(7,32,97,0.45)] transition-transform duration-[350ms] group-hover:rotate-0 group-hover:scale-105">
            {c.teacher?.avatarUrl ? <img src={c.teacher.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : 'c'}
          </span>
          {c.exam && <span className="absolute bottom-2.5 left-3.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#C9D4F2]">{c.exam}</span>}
          {/* The preview button sits on the banner, so the title has the card's full width */}
          <span className="absolute bottom-2.5 right-3 z-10"><PlayPreview slug={c.slug} title={title} openHref={href ? (mine?.href ?? href) : undefined} onBanner /></span>
        </span>

        <span className="relative flex flex-1 flex-col gap-2 px-4 pb-3.5 pt-[15px] transition-colors duration-300 group-hover:text-[#FFFFFF]">
          <span aria-hidden className="absolute inset-0 bg-[linear-gradient(210deg,#8EA8FF,#3F6FE8_46%,#2F57C9)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {eyebrow && <span className="relative truncate text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-muted transition-colors group-hover:text-[#EEF3FF]">{eyebrow}</span>}
          <b className="relative line-clamp-2 text-[17px] font-extrabold leading-[1.2] tracking-[-0.015em]">{title}</b>
          <span className="relative flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ink2 transition-colors group-hover:text-[#EEF3FF]">
            {levelLabel && (
              <span className="inline-flex items-center gap-1.5">
                {n && <span aria-hidden className="inline-flex gap-0.5">{[0, 1, 2].map(i => <i key={i} className={clsx('h-2.5 w-1.5 rounded-[2px] transition-colors', i < n ? 'bg-azure-strong group-hover:bg-[#FFFFFF]' : 'bg-line group-hover:bg-[rgba(255,255,255,0.35)]')} />)}</span>}
                {levelLabel}
              </span>
            )}
            {c.website ? <span>On careerpathafrica.com</span> : <>
              {c.lessons > 0 && <span className="inline-flex items-center gap-1.5"><Icon name="list" size={14} className="text-azure-strong group-hover:text-[#FFFFFF]" />{c.lessons} lesson{c.lessons === 1 ? '' : 's'}</span>}
              {!!c.questions && <span className="inline-flex items-center gap-1.5"><Icon name="grade" size={14} className="text-azure-strong group-hover:text-[#FFFFFF]" />{c.questions} question{c.questions === 1 ? '' : 's'}</span>}
            </>}
          </span>
          {mine ? (
            <span className="relative flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[12.5px] font-bold">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line group-hover:bg-[rgba(255,255,255,0.3)]"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#3F6FE8,#8EA8FF)] group-hover:bg-[#FFFFFF]" style={{ width: `${Math.max(mine.pct, 2)}%` }} /></span>
                {mine.pct}%
              </span>
              {mine.next && <span className="line-clamp-1 text-[13px] text-muted transition-colors group-hover:text-[#EEF3FF]">Next: {mine.next}</span>}
            </span>
          ) : (covers || c.website) && (
            <span className="relative line-clamp-3 text-[13.5px] leading-normal text-muted transition-colors group-hover:text-[#EEF3FF]">
              {c.website ? 'On careerpathafrica.com while its lessons move into the portal.' : <><b className="font-bold">Covers: </b>{covers}</>}
            </span>
          )}
          <span className="relative mt-auto flex items-center gap-2 pt-1.5 text-[13px]">
            <span className="flex h-7 w-7 flex-shrink-0 -rotate-[4deg] items-center justify-center overflow-hidden rounded-lg bg-accent-soft text-[11px] font-extrabold text-azure-strong shadow-[0_4px_10px_rgba(7,32,97,0.18)]">
              {c.teacher?.avatarUrl ? <img src={c.teacher.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : 'c'}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{c.teacher?.name ?? 'CareerPath Africa'}</span>
            {cost && <b className="whitespace-nowrap text-[14px]">{cost}</b>}
            {mine
              ? <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md bg-azure-strong px-3 font-extrabold text-on-accent transition-all group-hover:gap-2 group-hover:bg-[#FFFFFF] group-hover:text-[#2F57C9]">{mine.pct >= 100 ? 'Review' : mine.pct > 0 ? 'Continue' : 'Start'}<Icon name="arrowRight" size={14} /></span>
              : <span className="inline-flex items-center gap-1 font-extrabold text-azure-strong transition-all group-hover:gap-2 group-hover:text-[#FFFFFF]">Details<Icon name="arrowRight" size={14} /></span>}
          </span>
        </span>
      </div>
    </div>
  );
}
