import { clsx } from 'clsx';

const initials = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const SIZES = {
  card: 'h-[136px] w-[136px] rounded-[22px] text-[48px]',
  hero: 'h-24 w-24 rounded-[18px] text-[34px] sm:h-[120px] sm:w-[120px] sm:rounded-[22px] sm:text-[44px]',
  row: 'h-24 w-24 rounded-[18px] text-[34px]',
};

/**
 * A teacher's photo as a tilted square, the same as the profile hero's photo, at card sizes.
 * Without a photo: their initials in blue on cream. `straight` undoes the tilt (selected cards);
 * inside a `group`, hovering the card straightens it too.
 */
export function TeacherPhoto({ src, name, size = 'card', video, straight }: {
  src?: string | null; name: string; size?: keyof typeof SIZES; video?: boolean; straight?: boolean;
}) {
  return (
    <span className={clsx('relative flex flex-shrink-0 items-center justify-center overflow-hidden bg-[#FFFDF8] font-extrabold tracking-[-0.02em] text-[#3F6FE8] shadow-[0_10px_22px_rgba(7,32,97,0.22)] transition-transform duration-200',
      SIZES[size], straight ? 'rotate-0' : '-rotate-3 group-hover:rotate-0', !src && 'border border-[#E4E9F3]')}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span aria-hidden>{initials(name)}</span>}
      {video && <span aria-label="Has a video intro" className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[rgba(7,32,97,0.82)] text-[#FFFFFF]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4v16l13-8z" /></svg></span>}
    </span>
  );
}
