import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { minorToMajor } from '@cpa/shared';

/** "XAF 29,900", "USD 49.99" from minor units, keeping cents only where the currency has them */
export const price = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
/** "about XAF 2,500 a month" */
export const perMonth = (minor: number, cur: string, months: number | null) =>
  months && months > 1 ? `about ${cur} ${Math.round(minorToMajor(minor, cur) / months).toLocaleString('en-GB')} a month` : null;

/** Pay with: the ways people actually pay */
export function PayWith({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <img src="/brand/mtn-momo.svg" alt="MTN Mobile Money" className="h-7 rounded-md" />
      <img src="/brand/orange-money.svg" alt="Orange Money" className="h-7 rounded-md" />
      <span className="inline-flex h-7 items-center rounded-md bg-[#F1F4FA] px-2.5 text-[11.5px] font-extrabold text-[#3A4A6B]">Visa · Mastercard</span>
    </div>
  );
}

/** The header on public pages: same as the home page, on white */
export function PublicHeader() {
  const nav = 'hidden text-[14px] text-[#3A4A6B] hover:text-[#072061] md:inline';
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] items-center gap-5 px-4 py-3 sm:px-8">
        <BrandLogo size="md" href="/" />
        <span className="flex-1" />
        <Link href="/courses" className={nav}>Courses</Link>
        <Link href="/packages" className={nav}>Packages</Link>
        <Link href="/register?role=teacher" className={nav}>Teach</Link>
        <Link href="/login" className="text-[14px] font-bold text-[#072061] hover:underline">Sign in</Link>
        <Link href="/register" className="inline-flex h-9 items-center rounded-md bg-[#2F57C9] px-3.5 text-[13.5px] font-bold text-white hover:bg-[#2548AE]">Start free</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-auto bg-[#072061] text-[#C9D6FF]">
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-10 text-[13.5px] sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-2">
          <BrandLogo tone="onDark" size="md" href="/" />
          <p className="max-w-[300px] leading-relaxed">Exam prep with real teachers across Africa. Pay by mobile money or card.</p>
        </div>
        <div className="flex flex-col gap-1.5"><b className="text-white">Learn</b><Link href="/courses" className="hover:text-white">Courses</Link><Link href="/packages" className="hover:text-white">Packages</Link><Link href="/register" className="hover:text-white">Start free</Link></div>
        <div className="flex flex-col gap-1.5"><b className="text-white">CareerPath</b><Link href="/register?role=teacher" className="hover:text-white">Teach with us</Link><Link href="/verify" className="hover:text-white">Check a certificate</Link><a href="https://careerpathafrica.com" className="hover:text-white">careerpathafrica.com</a></div>
        <div className="flex flex-col gap-1.5"><b className="text-white">Legal</b><Link href="/legal/terms" className="hover:text-white">Terms</Link><Link href="/legal/privacy" className="hover:text-white">Privacy</Link><span className="mt-2 text-xs text-[#8FA3D6]">© {new Date().getFullYear()} CareerPath Africa</span></div>
      </div>
    </footer>
  );
}

/** A cover image, or a coloured panel with the exam and subject when there's none */
const SHADES = ['#2F57C9,#5889FA', '#17703A,#3BAA6A', '#6B3FB8,#9C72E0', '#8A5A00,#D9A33A', '#A0306A,#D2649A', '#072061,#2F57C9'];
export function Cover({ src, label, seed, className = '' }: { src?: string | null; label?: string | null; seed: string; className?: string }) {
  const shade = SHADES[[...seed].reduce((t, c) => t + c.charCodeAt(0), 0) % SHADES.length];
  if (src) return <img src={src} alt="" className={`object-cover ${className}`} />;
  return (
    <div className={`flex items-end p-3 ${className}`} style={{ background: `linear-gradient(135deg,${shade})` }}>
      <span className="text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-white/95">{label}</span>
    </div>
  );
}

export const initials = (n: string | null | undefined) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'CP';

export function Face({ name, src, size = 44 }: { name: string | null; src?: string | null; size?: number }) {
  return src
    ? <img src={src} alt="" className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="grid flex-shrink-0 place-items-center rounded-full bg-[#072061] font-extrabold text-white" style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials(name)}</span>;
}
