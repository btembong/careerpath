'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import type { IconName } from '@/lib/icons';

/* ─── Nav item type ───────────────────────────────────────────────────────── */

interface NavItem { label: string; href: string; icon: IconName; badge?: number | boolean; }
interface NavGroup { title: string; items: NavItem[]; }

/* ─── Student navigation ──────────────────────────────────────────────────── */

const STUDENT_NAV: NavGroup[] = [
  { title: 'Learn', items: [
    { label: 'Dashboard',      href: '/student/dashboard',    icon: 'dashboard' },
    { label: 'My Courses',     href: '/student/courses',      icon: 'courses' },
    { label: 'My Cohorts',     href: '/student/cohorts',      icon: 'mentorship' },
    { label: 'Live Classes',   href: '/student/live',         icon: 'live' },
    { label: 'Study Calendar', href: '/student/calendar',     icon: 'calendar' },
    { label: 'Assignments',    href: '/student/assignments',  icon: 'assignments' },
  ]},
  { title: 'Discover', items: [
    { label: 'Search',         href: '/student/search',       icon: 'search' },
    { label: 'Catalogue',      href: '/student/catalogue',    icon: 'notebook' },
    { label: 'Teachers',       href: '/student/teachers',     icon: 'graduate' },
    { label: 'Packages',       href: '/packages',             icon: 'packages' },
  ]},
  { title: 'Connect', items: [
    { label: 'Messages',       href: '/student/messages',     icon: 'messages' },
    { label: 'Mentorship',     href: '/student/mentorship',   icon: 'mentorship' },
    { label: 'Community',      href: '/student/community',    icon: 'community' },
  ]},
  { title: 'Account', items: [
    { label: 'Notifications',  href: '/student/notifications', icon: 'bell' },
    { label: 'Certificates',   href: '/student/certificates', icon: 'certificates' },
    { label: 'Wallet',         href: '/student/wallet',       icon: 'wallet' },
    { label: 'Billing',        href: '/student/billing',      icon: 'card' },
    { label: 'Progress',       href: '/student/progress',     icon: 'reports' },
    { label: 'Roadmap',        href: '/student/roadmap',      icon: 'roadmap' },
    { label: 'Refer & Earn',   href: '/student/referrals',    icon: 'heart' },
    { label: 'My Profile',     href: '/student/profile',      icon: 'user' },
  ]},
  { title: 'Help', items: [
    { label: 'Help & Support', href: '/student/support',      icon: 'shield' },
  ]},
];

/* ─── Teacher navigation ──────────────────────────────────────────────────── */

const TEACHER_NAV: NavGroup[] = [
  { title: 'Teach', items: [
    { label: 'Dashboard',      href: '/teacher/dashboard',    icon: 'dashboard' },
    { label: 'My Courses',     href: '/teacher/courses',      icon: 'courses' },
    { label: 'Cohorts',        href: '/teacher/cohorts',      icon: 'mentorship' },
    { label: 'Live Classes',   href: '/teacher/live',         icon: 'live' },
    { label: 'Assignments',    href: '/teacher/assignments',  icon: 'assignments' },
    { label: 'Quiz Grading',   href: '/teacher/quiz-grading', icon: 'notebook' },
  ]},
  { title: 'Connect', items: [
    { label: 'Mentorship',     href: '/teacher/mentorship',   icon: 'graduate' },
    { label: 'Messages',       href: '/teacher/messages',     icon: 'messages' },
    { label: 'Notifications',  href: '/teacher/notifications', icon: 'bell' },
    { label: 'Alerts',         href: '/teacher/alerts',       icon: 'alert' },
  ]},
  { title: 'Account', items: [
    { label: 'Earnings',       href: '/teacher/wallet',       icon: 'wallet' },
    { label: 'My Profile',     href: '/teacher/profile',      icon: 'user' },
  ]},
];

/* ─── Admin navigation ────────────────────────────────────────────────────── */

const ADMIN_NAV: NavGroup[] = [
  { title: 'Overview', items: [
    { label: 'Dashboard',      href: '/admin/dashboard',      icon: 'dashboard' },
    { label: 'Reports',        href: '/admin/reports',        icon: 'reports' },
  ]},
  { title: 'Content', items: [
    { label: 'Courses',        href: '/admin/courses',        icon: 'courses' },
    { label: 'Packages',       href: '/admin/packages',       icon: 'packages' },
    { label: 'Coupons',        href: '/admin/coupons',        icon: 'tag' },
    { label: 'Live Classes',   href: '/admin/live',           icon: 'live' },
    { label: 'WP Reviews',     href: '/admin/reviews',        icon: 'assignments' },
  ]},
  { title: 'People', items: [
    { label: 'Users',          href: '/admin/users',          icon: 'user' },
    { label: 'Teachers',       href: '/admin/teachers',       icon: 'mentorship' },
    { label: 'Teacher Welcome Video', href: '/admin/onboarding-video', icon: 'play' },
    { label: 'Cohorts',        href: '/admin/cohorts',        icon: 'community' },
    { label: 'Mentorship',     href: '/admin/mentorship',     icon: 'mentorship' },
    { label: 'Countries',      href: '/admin/countries',      icon: 'countries' },
    { label: 'Org',            href: '/admin/org',            icon: 'graduate' },
  ]},
  { title: 'Finance', items: [
    { label: 'Payouts',        href: '/admin/payouts',        icon: 'payouts' },
    { label: 'Wallets',        href: '/admin/wallets',        icon: 'wallet' },
  ]},
  { title: 'Platform', items: [
    { label: 'Community',      href: '/admin/community',      icon: 'community' },
    { label: 'Notifications',  href: '/admin/notifications',  icon: 'bell' },
    { label: 'Support',        href: '/admin/support',        icon: 'shield' },
  ]},
];

/* ─── Country rep navigation ──────────────────────────────────────────────── */

const COUNTRY_REP_NAV: NavGroup[] = [
  { title: 'Overview', items: [
    { label: 'Dashboard',      href: '/country-rep/dashboard', icon: 'dashboard' },
    { label: 'Packages',       href: '/country-rep/packages',  icon: 'packages' },
    { label: 'Students',       href: '/country-rep/students',  icon: 'graduate' },
    { label: 'Wallet',         href: '/country-rep/wallet',    icon: 'wallet' },
    { label: 'My Profile',     href: '/country-rep/profile',   icon: 'user' },
  ]},
];

/* ─── Reviewer navigation ─────────────────────────────────────────────────── */

const REVIEWER_NAV: NavGroup[] = [
  { title: 'Overview', items: [
    { label: 'Review Queue',   href: '/reviewer/dashboard',   icon: 'assignments' },
    { label: 'Earnings',       href: '/reviewer/wallet',      icon: 'wallet' },
    { label: 'My Profile',     href: '/reviewer/profile',     icon: 'user' },
  ]},
];

/* ─── Map ─────────────────────────────────────────────────────────────────── */

const NAV_MAP: Record<string, NavGroup[]> = {
  STUDENT:          STUDENT_NAV,
  TEACHER:          TEACHER_NAV,
  ADMIN:            ADMIN_NAV,
  COUNTRY_REP:      COUNTRY_REP_NAV,
  SUBJECT_REVIEWER: REVIEWER_NAV,
};

/* ─── Collapsed state persistence ─────────────────────────────────────────── */

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  function toggle() {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });
  }
  return { collapsed, toggle };
}

/* ─── Sidebar component ───────────────────────────────────────────────────── */

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();
  const nav = NAV_MAP[user?.role ?? 'STUDENT'] ?? STUDENT_NAV;

  return (
    <aside className={clsx(
      'hidden lg:flex h-screen flex-col border-r border-cloud bg-white transition-all duration-300',
      collapsed ? 'w-[68px]' : 'w-64',
    )}>
      {/* Logo + collapse toggle */}
      <div className="flex items-center gap-3 border-b border-cloud px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-navy">
            <span className="text-sm font-black text-white">C</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-navy truncate">
              CareerPath<span className="text-azure">Africa</span>
            </span>
          )}
        </Link>
        <button
          onClick={toggle}
          className={clsx(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-royal/40 hover:bg-cloud hover:text-navy transition',
            collapsed ? 'mx-auto' : 'ml-auto',
          )}>
          <svg className={clsx('h-4 w-4 transition-transform', collapsed && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 no-scrollbar">
        {nav.map((group) => (
          <div key={group.title} className="mb-1">
            {!collapsed && (
              <p className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                {group.title}
              </p>
            )}
            {collapsed && <div className="h-2" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all',
                        active ? 'bg-azure text-white' : 'text-navy hover:bg-cloud',
                        collapsed && 'justify-center px-0',
                      )}>
                      <span className={clsx(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-white/20 text-white' : 'bg-cloud text-azure',
                      )}>
                        <Icon name={item.icon} size={16} />
                      </span>
                      {!collapsed && (
                        <>
                          <span className={clsx('text-[13px] font-semibold leading-tight truncate', active ? 'text-white' : 'text-navy')}>
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className={clsx(
                              'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                              active ? 'bg-white/25 text-white' : 'bg-azure/10 text-azure',
                            )}>
                              {typeof item.badge === 'number' ? item.badge : ''}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings + User */}
      <div className="border-t border-cloud px-2.5 py-2.5 space-y-0.5">
        <Link href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={clsx(
            'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-navy transition-all hover:bg-cloud',
            collapsed && 'justify-center px-0',
          )}>
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cloud text-azure">
            <Icon name="settings" size={16} />
          </span>
          {!collapsed && <span className="text-[13px] font-semibold">Settings</span>}
        </Link>

        {/* User row */}
        <div className={clsx(
          'flex items-center gap-2.5 rounded-xl px-2.5 py-2',
          collapsed && 'justify-center px-0',
        )}>
          <Avatar name={user?.name ?? user?.email} size="sm" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-navy truncate">{user?.name ?? 'User'}</p>
                <p className="text-[11px] text-royal/50 truncate">{user?.email}</p>
              </div>
              <button onClick={logout} className="text-royal/40 transition hover:text-azure flex-shrink-0">
                <Icon name="logout" size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
