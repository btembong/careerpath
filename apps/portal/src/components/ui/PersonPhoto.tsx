import { clsx } from 'clsx';
import { KIND_COLOURS } from '@/components/wallet/WalletCharts';

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
/** The same colour for the same person everywhere */
export const colourFor = (key: string) => KIND_COLOURS[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % KIND_COLOURS.length];

/** A person's photo when they have one, otherwise their initials on their colour. Round by default. */
export function PersonPhoto({ src, name, id, size, square, className }: { src?: string | null; name: string; id?: string; size: number; square?: boolean; className?: string }) {
  const shape = square ? 'rounded-lg' : 'rounded-full';
  if (src) return <img src={src} alt="" width={size} height={size} loading="lazy" className={clsx('flex-shrink-0 bg-subtle object-cover', shape, className)} style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className={clsx('flex flex-shrink-0 items-center justify-center font-extrabold text-[#FFFFFF]', shape, className)}
      style={{ width: size, height: size, fontSize: Math.round(size / 3.2), background: colourFor(id ?? name) }}>
      {initialsOf(name)}
    </span>
  );
}
