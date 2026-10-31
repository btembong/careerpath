'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { useAuth } from '@/hooks/useAuth';
import type { IconName } from '@/lib/icons';

interface NavItem { label: string; href: string; icon: IconName; }
interface NavGroup { title: string; items: NavItem[]; }

/* ─── Student ─────────────────────────────────────────────────────────────── */

const STUDENT_TABS: NavItem[] = [
  { label: 'Home',     href: '/student/dashboard', icon: 'dashboard' },
  { label: 'Courses',  href: '/student/courses',   icon: 'courses'   },
  { label: 'Calendar', href: '/student/calendar',  icon: 'calendar'  },
  { label: 'Live',     href: '/student/live',      icon: 'live'      },
];

const STUDENT_MORE: NavGroup[] = [
  { title: 'Learn', items: [
    { label: 'Cohorts',      href: '/student/cohorts',      icon: 'mentorship'   },
    { label: 'Assignments',  href: '/student/assignments',  icon: 'assignments'  },
    { label: 'Catalogue',    href: '/student/catalogue',    icon: 'notebook'     },
    { label: 'Packages',     href: '/packages',             icon: 'packages'     },
    { label: 'Teachers',     href: '/student/teachers',     icon: 'graduate'     },
  ]},
  { title: 'Connect', items: [
    { label: 'Messages',     href: '/student/messages',     icon: 'messages'     },
    { label: 'Mentorship',   href: '/student/mentorship',   icon: 'mentorship'   },
    { label: 'Community',    href: '/student/community',    icon: 'community'    },
  ]},
  { title: 'Account', items: [
    { label: 'Certificates', href: '/student/certificates', icon: 'certificates' },
    { label: 'Billing',      href: '/student/billing',      icon: 'card'         },
    { label: 'Refer & Earn', href: '/student/referrals',    icon: 'heart'        },
    { label: 'Support',      href: '/student/support',      icon: 'shield'       },
  ]},
];

/* ─── Teacher ─────────────────────────────────────────────────────────────── */

const TEACHER_TABS: NavItem[] = [
  { label: 'Home',     href: '/teacher/dashboard',  icon: 'dashboard'  },
  { label: 'Courses',  href: '/teacher/courses',    icon: 'courses'    },
  { label: 'Students', href: '/teacher/cohorts',    icon: 'mentorship' },
  { label: 'Earnings', href: '/teacher/wallet',     icon: 'wallet'     },
];

const TEACHER_MORE: NavGroup[] = [
  { title: 'Teach', items: [
    { label: 'Live Classes',  href: '/teacher/live',         icon: 'live'        },
    { label: 'Assignments',   href: '/teacher/assignments',  icon: 'assignments' },
    { label: 'Grading',       href: '/teacher/grading',      icon: 'notebook'    },
  ]},
  { title: 'Connect', items: [
    { label: 'Mentorship',    href: '/teacher/mentorship',   icon: 'graduate'    },
    { label: 'Community',     href: '/teacher/community',    icon: 'community'   },
    { label: 'Messages',      href: '/teacher/messages',     icon: 'messages'    },
    { label: 'Notifications', href: '/teacher/notifications', icon: 'bell'       },
    { label: 'Alerts',        href: '/teacher/alerts',       icon: 'alert'       },
    { label: 'My Profile',    href: '/teacher/profile',      icon: 'user'        },
  ]},
];

/* ─── Admin ───────────────────────────────────────────────────────────────── */

const ADMIN_TABS: NavItem[] = [
  { label: 'Home',    href: '/admin/dashboard', icon: 'dashboard' },
  { label: 'Users',   href: '/admin/users',     icon: 'mentorship'},
  { label: 'Courses', href: '/admin/courses',   icon: 'courses'   },
  { label: 'Reports', href: '/admin/reports',   icon: 'reports'   },
];

const ADMIN_MORE: NavGroup[] = [
  { title: 'Content', items: [
    { label: 'Packages',      href: '/admin/packages',      icon: 'packages'    },
    { label: 'Coupons',       href: '/admin/coupons',       icon: 'tag'         },
    { label: 'Live Classes',  href: '/admin/live',          icon: 'live'        },
    { label: 'WP Reviews',    href: '/admin/reviews',       icon: 'assignments' },
  ]},
  { title: 'People', items: [
    { label: 'Teachers',      href: '/admin/teachers',      icon: 'graduate'    },
    { label: 'Welcome Video', href: '/admin/onboarding-video', icon: 'play'      },
    { label: 'Cohorts',       href: '/admin/cohorts',       icon: 'community'   },
    { label: 'Mentorship',    href: '/admin/mentorship',    icon: 'mentorship'  },
    { label: 'Countries',     href: '/admin/countries',     icon: 'countries'   },
    { label: 'Org',           href: '/admin/org',           icon: 'packages'    },
  ]},
  { title: 'Platform', items: [
    { label: 'Payouts',       href: '/admin/payouts',       icon: 'payouts'     },
    { label: 'Wallets',       href: '/admin/wallets',       icon: 'wallet'      },
    { label: 'Community',     href: '/admin/community',     icon: 'community'   },
    { label: 'Notifications', href: '/admin/notifications', icon: 'bell'        },
    { label: 'Support',       href: '/admin/support',       icon: 'shield'      },
  ]},
];

/* ─── Country rep ─────────────────────────────────────────────────────────── */

const COUNTRY_REP_TABS: NavItem[] = [
  { label: 'Home',     href: '/country-rep/dashboard', icon: 'dashboard' },
  { label: 'Packages', href: '/country-rep/packages',  icon: 'packages'  },
  { label: 'Students', href: '/country-rep/students',  icon: 'graduate'  },
  { label: 'Wallet',   href: '/country-rep/wallet',    icon: 'wallet'    },
];

const COUNTRY_REP_MORE: NavGroup[] = [
  { title: 'Account', items: [
    { label: 'Teachers',   href: '/country-rep/teachers', icon: 'graduate' },
    { label: 'Messages',   href: '/country-rep/messages', icon: 'messages' },
    { label: 'My Profile', href: '/country-rep/profile', icon: 'user' },
  ]},
];

/* ─── Reviewer ────────────────────────────────────────────────────────────── */

const REVIEWER_TABS: NavItem[] = [
  { label: 'Reviews',  href: '/reviewer/dashboard', icon: 'assignments' },
  { label: 'Courses',  href: '/reviewer/courses',   icon: 'courses'     },
  { label: 'Earnings', href: '/reviewer/wallet',    icon: 'wallet'      },
];

const REVIEWER_MORE: NavGroup[] = [
  { title: 'Account', items: [
    { label: 'Messages',   href: '/reviewer/messages', icon: 'messages' },
    { label: 'My Profile', href: '/reviewer/profile', icon: 'user' },
  ]},
];

/* ─── Map ─────────────────────────────────────────────────────────────────── */

const TABS_MAP: Record<string, { tabs: NavItem[]; more: NavGroup[] }> = {
  STUDENT:          { tabs: STUDENT_TABS,      more: STUDENT_MORE      },
  TEACHER:          { tabs: TEACHER_TABS,      more: TEACHER_MORE      },
  ADMIN:            { tabs: ADMIN_TABS,         more: ADMIN_MORE        },
  COUNTRY_REP:      { tabs: COUNTRY_REP_TABS,  more: COUNTRY_REP_MORE  },
  SUBJECT_REVIEWER: { tabs: REVIEWER_TABS,     more: REVIEWER_MORE     },
};

/* ─── Tab item with haptic feedback ───────────────────────────────────────── */

function TabItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href}
      className="flex flex-1 items-center justify-center py-2">
      {active ? (
        <motion.span
          layoutId="mobile-tab-pill"
          transition={spring.snappy}
          className="flex items-center gap-1.5 rounded-md bg-azure px-3.5 py-1.5"
        >
          <Icon name={item.icon} size={16} className="text-white flex-shrink-0" />
          <span className="text-[11px] font-bold text-white leading-none whitespace-nowrap">{item.label}</span>
        </motion.span>
      ) : (
        <motion.span
          whileTap={{ scale: 0.85 }}
          transition={spring.snappy}
          className="flex h-9 w-9 items-center justify-center transition-all"
        >
          <Icon name={item.icon} size={20} className="text-royal/35" />
        </motion.span>
      )}
    </Link>
  );
}

/* ─── Profile routes ──────────────────────────────────────────────────────── */

const PROFILE_HREF: Record<string, string> = {
  STUDENT:          '/student/profile',
  TEACHER:          '/teacher/profile',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/profile',
  SUBJECT_REVIEWER: '/reviewer/profile',
};

/* ─── Component ───────────────────────────────────────────────────────────── */

export function MobileNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const config = TABS_MAP[user?.role ?? ''];
  if (!config) return null;

  const { tabs, more } = config;
  const profileHref = PROFILE_HREF[user?.role ?? ''] ?? '/settings';

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {/* ── Bottom tab bar ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center
                      border-t border-cloud bg-white/95 backdrop-blur-md lg:hidden
                      pb-[env(safe-area-inset-bottom)]">
        {tabs.map(item => (
          <TabItem key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 items-center justify-center py-2">
          {moreOpen ? (
            <span className="flex items-center gap-1.5 rounded-md bg-navy px-3.5 py-1.5">
              <Icon name="grid" size={16} className="text-white flex-shrink-0" />
              <span className="text-[11px] font-bold text-white leading-none">More</span>
            </span>
          ) : (
            <motion.span whileTap={{ scale: 0.85 }} transition={spring.snappy}
              className="flex h-9 w-9 items-center justify-center">
              <Icon name="grid" size={20} className="text-royal/35" />
            </motion.span>
          )}
        </button>
      </nav>

      {/* ── More bottom sheet — grouped ──────────────────────────────── */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="px-4 pt-2 pb-8">

          {more.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                {group.title}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map(item => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={clsx(
                        'flex flex-col items-center gap-2 rounded-2xl p-3 transition-all active:scale-[0.96]',
                        active ? 'bg-azure' : 'bg-surface hover:bg-cloud',
                      )}>
                      <div className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-xl',
                        active ? 'bg-white/20' : 'bg-white shadow-sm',
                      )}>
                        <Icon name={item.icon} size={18}
                          className={active ? 'text-white' : 'text-azure'} />
                      </div>
                      <span className={clsx(
                        'text-[10px] font-bold leading-tight text-center',
                        active ? 'text-white' : 'text-navy',
                      )}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="border-t border-cloud mb-3" />

          {/* Settings + Profile rows */}
          <div className="space-y-1 mb-3">
            <Link href="/settings" onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3.5 rounded-2xl px-4 py-3 hover:bg-surface transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cloud flex-shrink-0">
                <Icon name="settings" size={18} className="text-royal" />
              </div>
              <span className="flex-1 text-sm font-semibold text-navy">Settings</span>
              <Icon name="chevronRight" size={14} className="text-royal/30" />
            </Link>

            <Link href={profileHref} onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3.5 rounded-2xl px-4 py-3 hover:bg-surface transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cloud flex-shrink-0">
                <Icon name="user" size={18} className="text-royal" />
              </div>
              <span className="flex-1 text-sm font-semibold text-navy">Profile</span>
              <Icon name="chevronRight" size={14} className="text-royal/30" />
            </Link>
          </div>

          {/* Sign out */}
          <button onClick={() => { setMoreOpen(false); logout(); }}
            className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3
                       text-red-500 hover:bg-red-50 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 flex-shrink-0">
              <Icon name="logout" size={18} className="text-red-400" />
            </div>
            <span className="flex-1 text-sm font-semibold text-left">Sign out</span>
          </button>

        </div>
      </BottomSheet>
    </>
  );
}
