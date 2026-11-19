import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { price } from '@/components/public/PublicChrome';

export interface PkgPerson { name: string | null; avatarUrl: string | null; slug: string | null }
export interface PkgLiveClass {
  name: string; examDate: string | null; sitting: string | null; students: number; included: boolean; price: number | null;
  teacher: PkgPerson; next: { title: string; scheduledAt: string; durationMins: number }[];
}

const TZ = 'Africa/Douala';
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o }).format(d);
const length = (m: number) => (m % 60 ? (m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} h ${m % 60} min`) : m === 60 ? '1 hour' : `${m / 60} hours`);
/** Whole weeks to the exam; null once it has passed */
export const weeksTo = (iso: string | null) => {
  if (!iso) return null;
  const w = Math.ceil((new Date(iso).getTime() - Date.now()) / (7 * 86400000));
  return w > 0 ? w : null;
};

function Face({ p, size, tilt, className = '' }: { p: PkgPerson; size: number; tilt: string; className?: string }) {
  return (
    <span style={{ width: size, height: size }} className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#FFFDF8] font-extrabold text-[#3F6FE8] shadow-[0_12px_26px_rgba(7,32,97,0.25)] ${tilt} ${className}`}>
      {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name ?? ''} loading="lazy" className="h-full w-full object-cover" /> : initials(p.name ?? '')}
    </span>
  );
}

/** "Your live class": the cohort the package comes with (or offers as an add-on), its teacher, the exam countdown and the next classes */
export function LiveClassCard({ c, currency }: { c: PkgLiveClass; currency: string }) {
  const weeks = weeksTo(c.examDate);
  const days = [...new Set(c.next.map(n => part(new Date(n.scheduledAt), { weekday: 'long' })))];
  const teacher = c.teacher.slug ? <Link href={`/teachers/${c.teacher.slug}`} className="font-bold text-[#FFFFFF] hover:underline">{c.teacher.name}</Link> : c.teacher.name;
  return (
    <div className="overflow-hidden rounded-[22px] bg-[#072061] text-[#FFFFFF]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-[18px] sm:p-6">
        <Face p={c.teacher} size={76} tilt="-rotate-3" className="rounded-[18px] text-[24px]" />
        <div className="min-w-0">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[#7FA3FF]">
            Your live class · {c.included ? 'Included' : `Add at checkout · ${price(c.price ?? 0, currency)}`}
          </p>
          <p className="mt-1 text-[21px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[23px]">{c.name}</p>
          <p className="mt-0.5 text-[13.5px] text-[#C9D4F2]">
            with {teacher}{days.length ? ` · ${days.length > 2 ? 'several times a week' : days.map(d => `${d}s`).join(' and ')}` : ''}{c.students >= 5 ? ` · ${c.students} students` : ''}
          </p>
        </div>
        {weeks && (
          <div className="col-span-2 flex items-center gap-2.5 rounded-[14px] bg-[rgba(255,255,255,0.1)] px-3.5 py-2.5 sm:col-span-1 sm:block sm:text-center">
            <b className="block text-[26px] leading-none">{weeks}</b>
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#C9D4F2]">week{weeks === 1 ? '' : 's'} to<br className="hidden sm:block" /> {c.sitting ? 'the ' + c.sitting : 'the exam'}</span>
          </div>
        )}
      </div>
      {c.next.length > 0 ? (
        <div className="pb-1.5">
          <p className="px-5 pb-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#9AA8D2] sm:px-6">Next classes</p>
          {c.next.map((n, i) => {
            const d = new Date(n.scheduledAt);
            return (
              <div key={n.scheduledAt + i} className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-3.5 border-t border-[rgba(255,255,255,0.12)] px-5 py-3 text-[14px] sm:px-6">
                <span className="rounded-[10px] bg-[rgba(255,255,255,0.12)] py-1.5 text-center leading-[1.1]">
                  <span className="block text-[10.5px] font-bold uppercase text-[#C9D4F2]">{part(d, { weekday: 'short' })}</span>
                  <b className="block text-[19px]">{part(d, { day: 'numeric' })}</b>
                  <span className="block text-[10.5px] font-bold uppercase text-[#C9D4F2]">{part(d, { month: 'short' })}</span>
                </span>
                <span className="min-w-0">
                  <b className="block truncate">{n.title}</b>
                  <span className="text-[12.5px] text-[#C9D4F2]">{part(d, { hour: '2-digit', minute: '2-digit', hour12: false })} Cameroon time · {length(n.durationMins)}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="border-t border-[rgba(255,255,255,0.12)] px-5 py-4 text-[14px] text-[#C9D4F2] sm:px-6">First class announced soon. You’ll get a message as soon as it’s set.</p>
      )}
      <p className="flex items-center gap-2 px-5 pb-5 pt-3 text-[13px] text-[#9AA8D2] sm:px-6"><Icon name="live" size={15} className="text-[#7FA3FF]" />Missed one? Every class is recorded, with the board, in your portal.</p>
    </div>
  );
}

/** "Mentoring": sessions a month, who you can book, and how */
export function MentoringCard({ perMonth, included, addOnPrice, currency, mentors }: { perMonth: number | null; included: boolean; addOnPrice: number | null; currency: string; mentors: PkgPerson[] }) {
  const times = perMonth == null ? 'Mentoring sessions every month' : perMonth === 1 ? 'One 30-minute session a month' : `${perMonth === 2 ? 'Two' : perMonth === 3 ? 'Three' : perMonth} 30-minute sessions a month`;
  return (
    <div className="flex flex-col gap-4 rounded-[22px] bg-[linear-gradient(135deg,#EAF0FF,#DCE6FF)] p-5 sm:p-6">
      <div>
        <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[#2F57C9]">Mentoring · {included ? 'Included' : `Add at checkout · ${price(addOnPrice ?? 0, currency)}`}</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[24px]">{times}, one-to-one.</p>
        <p className="mt-1 max-w-[540px] text-[14.5px] leading-relaxed text-[#3A4A6B]">Bring a hard topic, a mock result or your revision plan. You and your mentor share a board, and it’s saved after.</p>
      </div>
      <div className="flex items-center gap-3">
        {mentors.length > 0 ? (
          <>
            <div className="flex">
              {mentors.slice(0, 4).map((m, i) => {
                const face = <Face p={m} size={50} tilt={['-rotate-[4deg]', 'rotate-3', '-rotate-2', 'rotate-[4deg]'][i]} className={`text-[16px] ${i ? '-ml-2.5' : ''}`} />;
                return m.slug ? <Link key={m.slug} href={`/teachers/${m.slug}`} title={`${m.name}’s profile`} className="relative hover:z-10">{face}</Link> : <span key={i} className="relative">{face}</span>;
              })}
            </div>
            <span className="min-w-0 text-[14px]">
              <b className="block">{mentors.length === 1 ? `Book ${mentors[0].name}` : `Book any of ${mentors.length} mentors`}</b>
              <span className="text-[#637090]">{mentors.length === 1 ? 'a teacher in this package who takes bookings' : 'teachers in this package who take bookings'}</span>
            </span>
          </>
        ) : (
          <>
            <span className="flex h-[50px] w-[50px] flex-shrink-0 -rotate-3 items-center justify-center rounded-[14px] bg-[#FFFFFF] text-[#3F6FE8] shadow-[0_12px_26px_rgba(7,32,97,0.15)]"><Icon name="mentorship" size={22} /></span>
            <span className="text-[14px]"><b className="block">Book any CareerPath mentor</b><span className="text-[#637090]">teachers who take bookings, in your subjects</span></span>
          </>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[['Pick a mentor', mentors.length ? 'from this package’s teachers' : 'who teaches your subject'], ['Choose a day and time', 'from their free times'], ['Join from your portal', 'on a phone or computer']].map(([t, d], i) => (
          <div key={t} className="flex items-start gap-3 rounded-xl border border-[#E1E7F2] bg-[#FFFFFF] p-3.5 text-[14px]">
            <b className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-[#3F6FE8] text-[13px] text-[#FFFFFF]">{i + 1}</b>
            <span><b className="block">{t}</b><span className="text-[#637090]">{d}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
