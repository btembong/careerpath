'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useBadges } from '@/hooks/useBadges';
import type { IconName } from '@/lib/icons';
import { useMe } from '@/hooks/useMe';

interface NavItem { label: string; href: string; icon: IconName; also?: string[]; badge?: 'messages' | 'notices' }
interface NavGroup { items: NavItem[] }

/*
 * Phones and small tablets: a floating bar with each role's four most-used pages and the menu,
 * and the menu as a full-screen list (everything else, then Settings, profile and Sign out).
 */

const NOTICES: Record<string, string> = {
  STUDENT: '/student/notifications', TEACHER: '/teacher/notifications', ADMIN: '/admin/notifications',
};

const ROLES: Record<string, { tabs: NavItem[]; menu: NavGroup[]; profile: string }> = {
  STUDENT: {
    tabs: [
      { label: 'Home', href: '/student/dashboard', icon: 'home' },
      { label: 'My courses', href: '/student/courses', icon: 'courses', also: ['/student/learn'] },
      { label: 'Test Centre', href: '/student/tests', icon: 'docLine' },
      { label: 'Messages', href: '/student/messages', icon: 'messages', badge: 'messages' },
    ],
    menu: [
      { items: [
        { label: 'My cohorts', href: '/student/cohorts', icon: 'community', also: ['/student/cohort'] },
        { label: 'Live classes', href: '/student/live', icon: 'live' },
        { label: 'Study calendar', href: '/student/calendar', icon: 'calendar' },
        { label: 'Assignments', href: '/student/assignments', icon: 'assignments' },
      ] },
      { items: [
        { label: 'Catalogue', href: '/student/catalogue', icon: 'notebook' },
        { label: 'Flashcards', href: '/student/flashcards', icon: 'copyLine' },
        { label: 'Quiz history', href: '/student/quiz-history', icon: 'questionLine', also: ['/student/quiz'] },
        { label: 'Roadmap', href: '/student/roadmap', icon: 'roadmap' },
      ] },
      { items: [
        { label: 'My progress', href: '/student/progress', icon: 'trending', also: ['/student/analytics'] },
        { label: 'Certificates', href: '/student/certificates', icon: 'certificates' },
        { label: 'Leaderboard', href: '/student/leaderboard', icon: 'star' },
      ] },
      { items: [
        { label: 'Notifications', href: '/student/notifications', icon: 'bell', badge: 'notices' },
        { label: 'Community', href: '/student/community', icon: 'community' },
        { label: 'Mentorship', href: '/student/mentorship', icon: 'mentorship' },
        { label: 'Teachers', href: '/student/teachers', icon: 'teacher' },
      ] },
      { items: [
        { label: 'Billing', href: '/student/billing', icon: 'card', also: ['/student/wallet'] },
        { label: 'Packages', href: '/packages', icon: 'packages' },
        { label: 'Refer a friend', href: '/student/referrals', icon: 'heart' },
        { label: 'Help & support', href: '/student/support', icon: 'questionLine' },
      ] },
    ],
    profile: '/student/profile',
  },
  TEACHER: {
    tabs: [
      { label: 'Home', href: '/teacher/dashboard', icon: 'home' },
      { label: 'Courses', href: '/teacher/courses', icon: 'courses', also: ['/teacher/quiz-builder'] },
      { label: 'Students', href: '/teacher/students', icon: 'student', also: ['/teacher/alerts'] },
      { label: 'Messages', href: '/teacher/messages', icon: 'messages', badge: 'messages' },
    ],
    menu: [
      { items: [
        { label: 'Live classes', href: '/teacher/live', icon: 'live' },
        { label: 'Cohorts', href: '/teacher/cohorts', icon: 'community' },
        { label: 'Assignments', href: '/teacher/assignments', icon: 'assignments', also: ['/teacher/rubrics'] },
        { label: 'Grading', href: '/teacher/grading', icon: 'penLine', also: ['/teacher/quiz-grading', '/teacher/grade'] },
      ] },
      { items: [
        { label: 'Question bank', href: '/teacher/questions', icon: 'questionLine' },
        { label: 'Mock exams', href: '/teacher/mocks', icon: 'docLine' },
      ] },
      { items: [
        { label: 'Notifications', href: '/teacher/notifications', icon: 'bell', badge: 'notices' },
        { label: 'Mentorship', href: '/teacher/mentorship', icon: 'mentorship' },
        { label: 'Community', href: '/teacher/community', icon: 'community' },
        { label: 'Earnings', href: '/teacher/wallet', icon: 'wallet' },
      ] },
    ],
    profile: '/teacher/profile',
  },
  ADMIN: {
    tabs: [
      { label: 'Home', href: '/admin/dashboard', icon: 'home' },
      { label: 'Courses', href: '/admin/courses/manage', icon: 'courses', also: ['/admin/courses'] },
      { label: 'Users', href: '/admin/users', icon: 'student' },
      { label: 'Messages', href: '/admin/messages', icon: 'messages', badge: 'messages' },
    ],
    menu: [
      { items: [
        { label: 'Reports', href: '/admin/reports', icon: 'reports' },
        { label: 'Question bank', href: '/admin/questions', icon: 'questionLine' },
        { label: 'Mock exams', href: '/admin/mocks', icon: 'docLine' },
        { label: 'Packages', href: '/admin/packages', icon: 'packages' },
        { label: 'Coupons', href: '/admin/coupons', icon: 'tag' },
        { label: 'Live classes', href: '/admin/live', icon: 'live' },
        { label: 'Commissions', href: '/admin/reviews', icon: 'dollar' },
      ] },
      { items: [
        { label: 'Teachers', href: '/admin/teachers', icon: 'teacher' },
        { label: 'Cohorts', href: '/admin/cohorts', icon: 'community' },
        { label: 'Mentorship', href: '/admin/mentorship', icon: 'mentorship' },
        { label: 'Organisations', href: '/admin/org', icon: 'school' },
      ] },
      { items: [
        { label: 'Countries', href: '/admin/countries', icon: 'countries', also: ['/admin/country'] },
        { label: 'Welcome video', href: '/admin/onboarding-video', icon: 'play' },
        { label: 'Announcements', href: '/admin/notifications', icon: 'bell' },
        { label: 'Community', href: '/admin/community', icon: 'community' },
        { label: 'Staff room', href: '/admin/staff-room', icon: 'messages' },
        { label: 'Support', href: '/admin/support', icon: 'shield' },
        { label: 'Errors', href: '/admin/errors', icon: 'alert' },
      ] },
      { items: [
        { label: 'Payments', href: '/admin/payments', icon: 'card' },
        { label: 'Payouts', href: '/admin/payouts', icon: 'payouts' },
        { label: 'Wallets', href: '/admin/wallets', icon: 'wallet' },
      ] },
    ],
    profile: '/admin/dashboard',
  },
  SUBJECT_REVIEWER: {
    tabs: [
      { label: 'Review queue', href: '/reviewer/dashboard', icon: 'assignments' },
      { label: 'Courses', href: '/reviewer/courses', icon: 'courses' },
      { label: 'Messages', href: '/reviewer/messages', icon: 'messages', badge: 'messages' },
      { label: 'Earnings', href: '/reviewer/wallet', icon: 'wallet' },
    ],
    menu: [{ items: [
      { label: 'Question bank', href: '/reviewer/questions', icon: 'questionLine' },
      { label: 'Staff room', href: '/reviewer/staff-room', icon: 'community' },
    ] }],
    profile: '/reviewer/profile',
  },
  COUNTRY_REP: {
    tabs: [
      { label: 'Home', href: '/country-rep/dashboard', icon: 'home' },
      { label: 'Students', href: '/country-rep/students', icon: 'student' },
      { label: 'Teachers', href: '/country-rep/teachers', icon: 'teacher' },
      { label: 'Messages', href: '/country-rep/messages', icon: 'messages', badge: 'messages' },
    ],
    menu: [{ items: [
      { label: 'Packages', href: '/country-rep/packages', icon: 'packages' },
      { label: 'Wallet', href: '/country-rep/wallet', icon: 'wallet' },
    ] }],
    profile: '/country-rep/profile',
  },
  ORG_ADMIN: {
    tabs: [
      { label: 'Home', href: '/school/dashboard', icon: 'home' },
      { label: 'Students', href: '/school/students', icon: 'student' },
      { label: 'Invite', href: '/school/invite', icon: 'mail' },
      { label: 'School settings', href: '/school/settings', icon: 'school' },
    ],
    menu: [],
    profile: '/school/settings',
  },
};

/** Full-screen moments where the bar would be in the way (WhatsApp hides its tabs inside a chat too) */
const HIDE_ON = [/\/learn\/[^/]+\/lesson\//, /\/tests\/(?!new|history|papers|mocks|cat$)[^/]+$/, /\/tests\/cat\/[^/]+/, /\/live\/[^/]+$/, /\/mentorship\/session\//, /\/mentorship\/board\//, /\/quiz\/[^/]+/];

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const ROLE_LABEL: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator', SUBJECT_REVIEWER: 'Subject reviewer', COUNTRY_REP: 'Country representative', ORG_ADMIN: 'School admin' };

export function MobileNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const badges = useBadges();
  const last = useRef(0);
  const me = useMe(); // the sign-in token has no name or photo

  const config = ROLES[user?.role ?? ''];
  const hidden = !config || chatOpen || HIDE_ON.some(r => r.test(pathname));

  // Closing the menu when the page changes
  useEffect(() => { setOpen(false); setTucked(false); }, [pathname]);
  // A conversation open in Messages hides the bar
  useEffect(() => {
    const on = (e: Event) => setChatOpen(!!(e as CustomEvent).detail?.hidden);
    window.addEventListener('cpa-tabbar', on);
    return () => window.removeEventListener('cpa-tabbar', on);
  }, []);
  // Pages make room for the bar only while it's showing
  useEffect(() => {
    document.documentElement.dataset.tabbar = hidden ? 'hidden' : 'shown';
    return () => { delete document.documentElement.dataset.tabbar; };
  }, [hidden]);
  // Scrolling down a page tucks the bar away; scrolling up brings it back
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const onScroll = () => {
      const y = main.scrollTop, dy = y - last.current;
      if (Math.abs(dy) < 8) return;
      setTucked(dy > 0 && y > 80);
      last.current = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [pathname]);
  // The menu takes the whole screen: Escape closes it, the page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open]);

  if (!config) return null;
  const isActive = (i: NavItem) => [i.href, ...(i.also ?? [])].some(h => pathname === h || pathname.startsWith(h + '/'));
  const count = (b?: NavItem['badge']) => (b === 'messages' ? badges.messages : b === 'notices' ? badges.notices : 0);
  const name = me?.name || user?.name || [user?.firstName, (user as any)?.lastName].filter(Boolean).join(' ') || user?.email || 'You';
  const avatar = me?.avatarUrl ?? undefined;
  const noticesHref = NOTICES[user?.role ?? ''];

  return (
    <>
      <style>{`
        @media (max-width: 1023px) {
          html[data-tabbar="shown"] main { padding-bottom: calc(100px + env(safe-area-inset-bottom)) !important; }
          html[data-tabbar="hidden"] main { padding-bottom: env(safe-area-inset-bottom) !important; }
        }
        .cpa-tabbar { background: #0B1530; box-shadow: 0 12px 28px rgba(7,32,97,.35); }
        html.dark .cpa-tabbar { background: #1C2C5E; border: 1px solid #2B3D75; box-shadow: 0 12px 28px rgba(0,0,0,.5); }
        /* The current page's white circle stays white in dark mode too */
        .cpa-tab-on { background: #FFFFFF; color: #0B1530; }
        html.dark .cpa-tab-on { background: #FFFFFF; color: #1C2C5E; }
      `}</style>

      {/* ── The floating bar ── */}
      <nav aria-label="Main" aria-hidden={hidden || undefined}
        className={clsx('cpa-tabbar fixed inset-x-3.5 z-[61] flex h-16 items-center justify-around rounded-full px-2 transition-transform duration-300 lg:hidden',
          (hidden || (tucked && !open)) && 'pointer-events-none translate-y-[calc(100%+40px)]')}
        style={{ bottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
        {config.tabs.map(t => {
          const on = isActive(t) && !open;
          const n = count(t.badge);
          return (
            <Link key={t.href} href={t.href} aria-label={n ? `${t.label}, ${n} unread` : t.label} aria-current={on ? 'page' : undefined}
              className={clsx('relative grid h-12 w-12 place-items-center rounded-full transition-colors', on ? 'cpa-tab-on' : 'text-[#EAF0FF] active:bg-white/10')}>
              <Icon name={t.icon} size={22} line />
              {n > 0 && !on && <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-[#0B1530] bg-[#5BB5FF]" />}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? 'Close menu' : 'Menu'} aria-expanded={open}
          className={clsx('relative grid h-12 w-12 place-items-center rounded-full transition-colors', open ? 'cpa-tab-on' : 'text-[#EAF0FF] active:bg-white/10')}>
          <Icon name={open ? 'close' : 'grid'} size={22} line />
          {!open && badges.notices > 0 && <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-[#0B1530] bg-[#5BB5FF]" />}
        </button>
      </nav>

      {/* ── The menu: a full-screen list ── */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[60] overflow-y-auto bg-white pb-[calc(110px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            {avatar ? <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
              : <span className="grid h-12 w-12 place-items-center rounded-full bg-azure-strong text-[15px] font-extrabold text-on-accent">{initials(name)}</span>}
            <span className="min-w-0 flex-1"><strong className="block truncate text-[17px] text-navy">{name}</strong><span className="block truncate text-[12.5px] text-muted">{[ROLE_LABEL[user?.role ?? ''], user?.role === 'STUDENT' ? me?.packageName : null].filter(Boolean).join(' · ')}</span></span>
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full bg-subtle text-navy"><Icon name="close" size={18} line /></button>
          </div>
          {[...config.menu, { items: [
            { label: 'Settings', href: '/settings', icon: 'settings' as IconName },
            { label: 'My profile', href: config.profile, icon: 'user' as IconName },
            ...(noticesHref && !config.menu.some(g => g.items.some(i => i.href === noticesHref)) ? [{ label: 'Notifications', href: noticesHref, icon: 'bell' as IconName, badge: 'notices' as const }] : []),
          ] }].map((g, gi) => (
            <div key={gi}>
              <div aria-hidden className="h-2.5 bg-subtle" />
              {g.items.map(i => {
                const n = count(i.badge);
                const on = isActive(i);
                return (
                  <Link key={i.href + i.label} href={i.href} onClick={() => setOpen(false)} aria-current={on ? 'page' : undefined}
                    className={clsx('flex items-center gap-4 border-b border-line px-5 py-[15px] active:bg-subtle', on ? 'text-azure-strong' : 'text-navy')}>
                    <Icon name={i.icon} size={24} line />
                    <span className="flex-1 text-[16.5px] font-semibold">{i.label}</span>
                    {n > 0 && <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-azure-strong px-1.5 text-[12px] font-extrabold text-on-accent">{n > 99 ? '99+' : n}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          <div aria-hidden className="h-2.5 bg-subtle" />
          <button onClick={() => { setOpen(false); logout(); }} className="flex w-full items-center gap-4 px-5 py-[15px] text-left text-red-600 active:bg-red-50">
            <Icon name="logout" size={24} line /><span className="flex-1 text-[16.5px] font-semibold">Sign out</span>
          </button>
        </div>
      )}
    </>
  );
}
