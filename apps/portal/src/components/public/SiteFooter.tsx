'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { openCookieSettings } from './CookieConsent';

const COLS: { title: string; links: [string, string][] }[] = [
  { title: 'Learn', links: [['/courses', 'Courses'], ['/teachers', 'Teachers'], ['/packages', 'Packages'], ['/#test-centre', 'Test Centre']] },
  { title: 'CareerPath', links: [['/register?role=teacher', 'Teach with us'], ['/#schools', 'For schools'], ['/verify', 'Check a certificate'], ['https://careerpathafrica.com', 'careerpathafrica.com']] },
  { title: 'Help', links: [['mailto:support@careerpathafrica.com', 'support@careerpathafrica.com'], ['/login', 'Sign in'], ['/register', 'Start free']] },
  { title: 'Legal', links: [['/legal/terms', 'Terms'], ['/legal/privacy', 'Privacy'], ['/legal/cookies', 'Cookies'], ['/legal/tutor-agreement', 'Tutor agreement']] },
];
const LINE1 = ['Every', 'pass', 'starts', 'here.'];
const LINE2 = ['Start', 'with', 'one', 'question.'];

function Col({ c, cookies }: { c: (typeof COLS)[number]; cookies?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <b className="mb-1 text-[13px] font-semibold text-[#7F8DB8]">{c.title}</b>
      {c.links.map(([href, l]) => href.startsWith('/')
        ? <Link key={href} href={href} className="cpa-ulink w-fit max-w-full truncate text-[15px] text-[#E6ECFF]">{l}</Link>
        : <a key={href} href={href} className="cpa-ulink w-fit max-w-full truncate text-[15px] text-[#E6ECFF]">{l}</a>)}
      {cookies && <button type="button" onClick={openCookieSettings} className="cpa-ulink w-fit text-left text-[15px] text-[#E6ECFF]">Cookie settings</button>}
    </div>
  );
}

/**
 * The footer on the landing page and every public page: a closing line that rises in word by word, links either side of
 * our "c" mark, and "careerpath." huge at the very bottom, cut off by the edge, with a blue glow drifting across it
 * (on a computer the glow follows the mouse). Motion stops for people who turn animations off.
 */
export function SiteFooter() {
  const ref = useRef<HTMLElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  function follow(e: React.PointerEvent<HTMLDivElement>) {
    const w = word.current; if (!w || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    w.classList.add('cpa-follow');
    w.style.setProperty('--cpa-gx', `${((e.clientX - r.left) / r.width) * 100}%`);
  }

  return (
    <footer ref={ref} className={clsx('keep-light relative mt-auto overflow-hidden bg-[#040D29] text-[#C9D4F2]', inView && 'cpa-in')}>
      <span aria-hidden className="pointer-events-none absolute -left-32 -top-20 h-[340px] w-[520px] rounded-full bg-[rgba(63,111,232,0.35)] blur-[70px]" />
      <span aria-hidden className="pointer-events-none absolute -right-24 top-[240px] h-[300px] w-[460px] rounded-full bg-[rgba(88,137,250,0.22)] blur-[70px]" />

      <div className="relative px-4 pb-6 pt-16 text-center sm:pt-[84px]">
        <p className="text-[40px] font-extrabold leading-none tracking-[-0.045em] sm:text-[64px] lg:text-[80px]">
          <span className="block">{LINE1.map((w, i) => <span key={w} className="cpa-rise cpa-fade-line mr-[0.22em] last:mr-0" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>{w}</span>)}</span>
          <span className="block text-[#FFFFFF]">{LINE2.map((w, i) => <span key={w} className="cpa-rise mr-[0.22em] last:mr-0" style={{ animationDelay: `${0.38 + i * 0.07}s` }}>{w}</span>)}</span>
        </p>
        <Link href="/register" className="cpa-roll mt-7 inline-flex h-[46px] items-center rounded-lg bg-[#3F6FE8] px-5 text-[15px] font-extrabold tracking-[0.02em] text-[#FFFFFF] hover:bg-[#2F57C9]">
          <span>START FREE →</span><span aria-hidden>START FREE →</span>
        </Link>
      </div>

      {/* Phones: the mark above the links, links in two columns */}
      <div className="relative flex justify-center pb-2 pt-8 lg:hidden">
        <Mark size="h-24 w-24 rounded-[24px] text-[62px]" />
      </div>
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-2 gap-x-6 gap-y-9 px-6 pb-6 pt-8 lg:grid-cols-[1fr_1fr_auto_1fr_1fr] lg:items-start lg:gap-7 lg:px-[72px] lg:pt-14">
        <Col c={COLS[0]} />
        <Col c={COLS[1]} />
        <div className="hidden flex-col items-center gap-6 px-5 lg:flex">
          <Mark size="h-[150px] w-[150px] rounded-[34px] text-[96px]" />
          <span className="text-center text-[13.5px] text-[#9AA8D2]">© {new Date().getFullYear()} CareerPath Africa. Pay by mobile money or card.</span>
        </div>
        <Col c={COLS[2]} />
        <Col c={COLS[3]} cookies />
      </div>
      <p className="relative pb-2 text-center text-[13px] text-[#9AA8D2] lg:hidden">© {new Date().getFullYear()} CareerPath Africa</p>

      <div aria-hidden onPointerMove={follow} className="relative h-[24vw] max-h-[300px] min-h-[96px] select-none">
        {/* Centred by the flex row, so the rise-in animation can move it freely */}
        <div className="absolute inset-x-0 bottom-[-5.4vw] flex justify-center xl:bottom-[-64px]">
          <div ref={word} className="cpa-word whitespace-nowrap text-[20.5vw] font-extrabold leading-none tracking-[-0.06em] xl:text-[252px]">careerpath.</div>
        </div>
      </div>
    </footer>
  );
}

function Mark({ size }: { size: string }) {
  return (
    <span aria-hidden className={clsx('cpa-mark relative flex items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#6E97FF_0%,#3F6FE8_45%,#2342A8_100%)] font-extrabold leading-none text-[#FFFFFF] shadow-[inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-10px_22px_rgba(4,13,41,0.35),0_30px_60px_rgba(63,111,232,0.35),0_8px_0_#1B3489]', size)}>c</span>
  );
}
