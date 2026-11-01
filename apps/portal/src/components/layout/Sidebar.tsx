'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '@/hooks/useAuth';

/* ─── Outline icons (stroke, 24 grid) — the menu uses its own lighter set ─────── */

const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  book:      'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  calendar:  'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart:     'M5 20v-8M12 20V5M19 20v-5M3 20h18',
  message:   'M4 5h16v11H9l-5 4z',
  users:     'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
  wallet:    'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3zM3 7l12-3v3M16 13.5h2',
  clipboard: 'M8 4h8v3H8zM6 5H5v16h14V5h-1M9 12h6M9 16h4',
  box:       'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  globe:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  inbox:     'M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5',
  user:      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.5z',
  help:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  chevDown:  'M6 9l6 6 6-6',
  chevLeft:  'M15 6l-6 6 6 6',
} as const;
type IconKey = keyof typeof ICONS;

function Glyph({ name, size = 18, className }: { name: IconKey; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ─── Menus: a few top-level items, related pages folded underneath ────────── */

interface Leaf { label: string; href: string; /** extra paths that also count as this page */ also?: string[]; }
interface Item { label: string; icon: IconKey; href?: string; also?: string[]; children?: Leaf[]; }

const STUDENT: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/student/dashboard' },
  { label: 'Learning', icon: 'book', children: [
    { label: 'My Courses',   href: '/student/courses', also: ['/student/learn'] },
    { label: 'Catalogue',    href: '/student/catalogue' },
    { label: 'Quiz History', href: '/student/quiz-history', also: ['/student/quiz'] },
    { label: 'Flashcards',   href: '/student/flashcards' },
    { label: 'Roadmap',      href: '/student/roadmap' },
  ]},
  { label: 'Classes', icon: 'calendar', children: [
    { label: 'My Cohorts',     href: '/student/cohorts', also: ['/student/cohort'] },
    { label: 'Live Classes',   href: '/student/live' },
    { label: 'Study Calendar', href: '/student/calendar' },
    { label: 'Assignments',    href: '/student/assignments' },
  ]},
  { label: 'Progress', icon: 'chart', children: [
    { label: 'My Progress',  href: '/student/progress', also: ['/student/analytics'] },
    { label: 'Certificates', href: '/student/certificates' },
    { label: 'Leaderboard',  href: '/student/leaderboard' },
  ]},
  { label: 'Messages', icon: 'message', href: '/student/messages' },
  { label: 'Community', icon: 'users', children: [
    { label: 'Community',  href: '/student/community' },
    { label: 'Mentorship', href: '/student/mentorship' },
    { label: 'Teachers',   href: '/student/teachers' },
  ]},
  { label: 'Billing', icon: 'wallet', children: [
    { label: 'Billing',      href: '/student/billing', also: ['/student/wallet'] },
    { label: 'Packages',     href: '/packages' },
    { label: 'Refer a friend', href: '/student/referrals' },
  ]},
];

const TEACHER: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/teacher/dashboard' },
  { label: 'Teaching', icon: 'book', children: [
    { label: 'My Courses',   href: '/teacher/courses', also: ['/teacher/quiz-builder'] },
    { label: 'Live Classes', href: '/teacher/live' },
  ]},
  { label: 'Classes', icon: 'calendar', children: [
    { label: 'Cohorts',     href: '/teacher/cohorts' },
    { label: 'Assignments', href: '/teacher/assignments', also: ['/teacher/rubrics'] },
  ]},
  { label: 'Grading', icon: 'clipboard', href: '/teacher/grading', also: ['/teacher/quiz-grading', '/teacher/grade'] },
  { label: 'Students', icon: 'users', children: [
    { label: 'My Students',    href: '/teacher/students', also: ['/teacher/alerts'] },
    { label: 'Mentorship',     href: '/teacher/mentorship' },
    { label: 'Community',      href: '/teacher/community' },
  ]},
  { label: 'Messages', icon: 'message', href: '/teacher/messages' },
  { label: 'Earnings', icon: 'wallet', href: '/teacher/wallet' },
];

const ADMIN: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/admin/dashboard' },
  { label: 'Reports',   icon: 'chart',     href: '/admin/reports' },
  { label: 'Content', icon: 'box', children: [
    { label: 'Courses',         href: '/admin/courses' },
    { label: 'Course management', href: '/admin/courses/manage', also: ['/admin/courses/wordpress', '/admin/courses/taxonomy', '/admin/courses/import'] },
    { label: 'Packages',        href: '/admin/packages' },
    { label: 'Coupons',         href: '/admin/coupons' },
    { label: 'Live Classes',    href: '/admin/live' },
    { label: 'Commissions',     href: '/admin/reviews' },
  ]},
  { label: 'People', icon: 'users', children: [
    { label: 'Users',         href: '/admin/users' },
    { label: 'Teachers',      href: '/admin/teachers' },
    { label: 'Cohorts',       href: '/admin/cohorts' },
    { label: 'Mentorship',    href: '/admin/mentorship' },
    { label: 'Organisations', href: '/admin/org' },
  ]},
  { label: 'Platform', icon: 'globe', children: [
    { label: 'Countries',     href: '/admin/countries', also: ['/admin/country'] },
    { label: 'Welcome Video', href: '/admin/onboarding-video' },
    { label: 'Notifications', href: '/admin/notifications' },
    { label: 'Community',     href: '/admin/community' },
    { label: 'Staff room',    href: '/admin/staff-room' },
  ]},
  { label: 'Finance', icon: 'wallet', children: [
    { label: 'Payments', href: '/admin/payments' },
    { label: 'Payouts', href: '/admin/payouts' },
    { label: 'Wallets', href: '/admin/wallets' },
  ]},
];

const REVIEWER: Item[] = [
  { label: 'Review Queue', icon: 'inbox',  href: '/reviewer/dashboard' },
  { label: 'Courses',      icon: 'book',   href: '/reviewer/courses' },
  { label: 'Messages',     icon: 'message', href: '/reviewer/messages' },
  { label: 'Staff room',   icon: 'users',   href: '/reviewer/staff-room' },
  { label: 'Earnings',     icon: 'wallet', href: '/reviewer/wallet' },
  { label: 'My Profile',   icon: 'user',   href: '/reviewer/profile' },
];

const COUNTRY_REP: Item[] = [
  { label: 'Dashboard',  icon: 'dashboard', href: '/country-rep/dashboard' },
  { label: 'Packages',   icon: 'box',       href: '/country-rep/packages' },
  { label: 'Teachers',   icon: 'book',      href: '/country-rep/teachers' },
  { label: 'Messages',   icon: 'message',   href: '/country-rep/messages' },
  { label: 'Students',   icon: 'users',     href: '/country-rep/students' },
  { label: 'Wallet',     icon: 'wallet',    href: '/country-rep/wallet' },
  { label: 'My Profile', icon: 'user',      href: '/country-rep/profile' },
];

const ORG_ADMIN: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', href: '/school/dashboard' },
  { label: 'Students',  icon: 'users',     href: '/school/students' },
  { label: 'Invite',    icon: 'inbox',     href: '/school/invite' },
  { label: 'Settings',  icon: 'settings',  href: '/school/settings' },
];

const MENUS: Record<string, { items: Item[]; name: string; help?: string }> = {
  STUDENT:          { items: STUDENT,     name: 'Student portal',         help: '/student/support' },
  TEACHER:          { items: TEACHER,     name: 'Teacher portal' },
  ADMIN:            { items: ADMIN,       name: 'Administration',         help: '/admin/support' },
  SUBJECT_REVIEWER: { items: REVIEWER,    name: 'Subject reviewer' },
  COUNTRY_REP:      { items: COUNTRY_REP, name: 'Country representative' },
  ORG_ADMIN:        { items: ORG_ADMIN,   name: 'School' },
};

function matches(pathname: string, href: string, also?: string[]) {
  return [href, ...(also ?? [])].some(p => pathname === p || pathname.startsWith(p + '/'));
}

/* ─── Collapsed state persistence ─────────────────────────────────────────── */

function usePersisted(key: string, initial: boolean) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s !== null) setV(s === 'true'); } catch {}
  }, [key]);
  function toggle() {
    setV(prev => { try { localStorage.setItem(key, String(!prev)); } catch {} return !prev; });
  }
  return [v, toggle] as const;
}

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */

const row = 'flex w-full items-center gap-3 rounded-md px-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-azure/40';

export function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, toggleCollapsed] = usePersisted('sidebar-collapsed', false);
  // Until the signed-in user loads, show placeholders rather than another role's menu
  const menu = user ? (MENUS[user.role] ?? MENUS.STUDENT) : { items: [] as Item[], name: '' };
  // Groups the person opened or closed by hand; otherwise a group is open when it holds the current page
  const [manual, setManual] = useState<Record<string, boolean>>({});

  return (
    <aside className={clsx(
      'relative hidden lg:flex h-screen flex-shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200',
      collapsed ? 'w-[68px]' : 'w-[248px]',
    )}>
      <button type="button" onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        className="absolute -right-3 top-[76px] z-10 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white text-muted hover:text-navy transition-colors">
        <Glyph name="chevLeft" size={14} className={clsx('transition-transform', collapsed && 'rotate-180')} />
      </button>

      {/* Brand */}
      <div className={clsx('pt-5 pb-1', collapsed ? 'px-[19px]' : 'px-6')}>
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[7px] bg-navy text-[15px] font-extrabold text-white dark-invert-logo">C</span>
          {!collapsed && (
            <span className="text-[17px] font-extrabold tracking-[-0.01em] text-navy">
              CareerPath<span className="text-azure">Africa</span>
            </span>
          )}
        </Link>
        {!collapsed && <p className="mt-1.5 pl-10 text-xs text-muted">{menu.name}</p>}
      </div>

      {/* Menu */}
      <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-3.5 pt-5 pb-2 no-scrollbar">
        {!user && (
          <div aria-hidden className="space-y-2 px-1">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 rounded-md bg-subtle animate-pulse" />)}
          </div>
        )}
        <ul className="space-y-0.5">
          {menu.items.map(item => {
            const kids = item.children ?? [];
            const childActive = kids.some(c => matches(pathname, c.href, c.also));
            const selfActive = !!item.href && matches(pathname, item.href, item.also);
            const open = (manual[item.label] ?? childActive) && !collapsed;

            if (!kids.length || collapsed) {
              const href = item.href ?? kids[0]?.href ?? '#';
              const active = selfActive || childActive;
              return (
                <li key={item.label}>
                  <Link href={href} title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(row, 'min-h-[38px] text-sm',
                      collapsed && 'justify-center px-0',
                      active ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:bg-subtle hover:text-navy')}>
                    <Glyph name={item.icon} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <button type="button" aria-expanded={open}
                  onClick={() => setManual(m => ({ ...m, [item.label]: !open }))}
                  className={clsx(row, 'min-h-[38px] text-sm hover:bg-subtle hover:text-navy',
                    childActive && !open ? 'font-semibold text-navy' : 'font-medium text-ink2')}>
                  <Glyph name={item.icon} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <Glyph name="chevDown" size={16} className={clsx('text-muted transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <ul className="ml-[19px] mt-0.5 mb-1.5 space-y-0.5 border-l border-line pl-2.5">
                    {kids.map(c => {
                      const a = matches(pathname, c.href, c.also);
                      return (
                        <li key={c.href}>
                          <Link href={c.href} aria-current={a ? 'page' : undefined}
                            className={clsx(row, 'min-h-[34px] text-[13.5px]',
                              a ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:bg-subtle hover:text-navy')}>
                            <span className="truncate">{c.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Pinned */}
      <div className="mx-3.5 border-t border-line pt-2.5 pb-4 space-y-0.5">
        {user && [{ label: 'Settings', icon: 'settings' as IconKey, href: '/settings' },
          ...(menu.help ? [{ label: 'Help & Support', icon: 'help' as IconKey, href: menu.help }] : [])].map(f => {
          const a = matches(pathname, f.href);
          return (
            <Link key={f.href} href={f.href} title={collapsed ? f.label : undefined}
              aria-current={a ? 'page' : undefined}
              className={clsx(row, 'min-h-[38px] text-sm', collapsed && 'justify-center px-0',
                a ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:bg-subtle hover:text-navy')}>
              <Glyph name={f.icon} />
              {!collapsed && <span className="flex-1 truncate">{f.label}</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
