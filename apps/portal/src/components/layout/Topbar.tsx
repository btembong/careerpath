'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownLabel } from '../ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useBadges } from '@/hooks/useBadges';
import { useMe, initialsOf } from '@/hooks/useMe';
import { useInstall } from '../push/Push';
import { notify } from '@/lib/notify';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

/* ─── OS detection for keyboard shortcut label ────────────────────────────── */

function useIsMac() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform?.toLowerCase().includes('mac') || navigator.userAgent?.toLowerCase().includes('mac'));
  }, []);
  return isMac;
}

const initials = initialsOf;

function greetingNow() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/* ─── Role-based routes ───────────────────────────────────────────────────── */

const NOTIFICATION_ROUTES: Record<string, string> = {
  STUDENT:          '/student/notifications',
  TEACHER:          '/teacher/alerts',
  ADMIN:            '/admin/notifications',
  COUNTRY_REP:      '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
  ORG_ADMIN:        '/school/dashboard',
};

const PROFILE_ROUTES: Record<string, string> = {
  STUDENT:          '/student/profile',
  TEACHER:          '/teacher/profile',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/profile',
  SUBJECT_REVIEWER: '/reviewer/profile',
  ORG_ADMIN:        '/school/settings',
};

/* ─── Breadcrumb type ─────────────────────────────────────────────────────── */

interface Crumb { label: string; href?: string; }

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface TopbarProps {
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}

export function Topbar({ title, subtitle, backHref, backLabel, actions, breadcrumbs }: TopbarProps) {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();
  const isMac = useIsMac();

  const openPalette = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  }, []);

  const bare = !title && !backHref && !breadcrumbs?.length;
  // Search bar — on the left when the page has no title
  const searchButton = (
        <button
          onClick={openPalette}
          className="hidden md:flex h-[38px] w-60 xl:w-80 items-center gap-2.5 rounded-md border border-line bg-subtle pl-3 pr-2 text-[13.5px] text-muted hover:text-navy transition-colors">
          <Icon name="search" size={15} className="text-muted" />
          <span className="flex-1 text-left truncate">Search or type a command</span>
          <kbd className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-semibold text-muted">
            {isMac ? '⌘ K' : 'Ctrl K'}
          </kbd>
        </button>
  );

  const notifHref = NOTIFICATION_ROUTES[user?.role ?? ''] ?? '/student/notifications';
  const badges = useBadges();
  const profileHref = PROFILE_ROUTES[user?.role ?? ''] ?? '/student/profile';
  const me = useMe();
  const inst = useInstall();
  const fullName = me?.name ?? user?.name ?? user?.email ?? '';
  const [hello, setHello] = useState('');
  useEffect(() => setHello(greetingNow()), []); // the hour is the phone's, not the server's

  return (
    <>
    {/* Phones, on a dashboard: a welcome header, your photo on the left and the bell alone on the right */}
    {bare && (
      <header className="flex items-center gap-3 px-4 pb-1 pt-4 lg:hidden">
        <Link href={profileHref} aria-label="My profile" className="flex min-w-0 flex-1 items-center gap-3">
          {me?.avatarUrl
            ? <img src={me.avatarUrl} alt="" className="h-[46px] w-[46px] flex-shrink-0 rounded-full object-cover ring-[3px] ring-white" />
            : <span className="grid h-[46px] w-[46px] flex-shrink-0 place-items-center rounded-full bg-[#3F6FE8] text-[15px] font-extrabold text-[#FFFFFF] ring-[3px] ring-white">{initials(fullName)}</span>}
          <span className="min-w-0">
            <span className="block text-[12.5px] text-muted">{hello || 'Welcome'} 👋</span>
            <strong className="block truncate text-[18px] leading-tight text-navy">{fullName}</strong>
          </span>
        </Link>
        <Link href={notifHref} aria-label={badges.notices > 0 ? `Notifications, ${badges.notices} unread` : 'Notifications'} className="relative grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full border border-line bg-white text-navy">
          <Icon name="bell" size={21} />
          {badges.notices > 0 && <span aria-hidden className="absolute right-[9px] top-2 h-[9px] w-[9px] rounded-full border-2 border-white bg-[#E5484D]" />}
        </Link>
      </header>
    )}
    <header className={`${bare ? 'hidden lg:flex' : 'flex'} h-16 items-center border-b border-line bg-white px-4 lg:px-7 gap-3`}>

      {/* Left — back button OR title + breadcrumbs */}
      {backHref ? (
        <Link
          href={backHref}
          className="flex items-center gap-2.5 -ml-1 text-navy group flex-shrink-0">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line bg-white group-hover:bg-subtle transition-colors">
            <Icon name="arrowLeft" size={15} className="text-ink2" />
          </span>
          <span className="text-[15px] font-semibold text-navy hidden sm:block">
            {backLabel ?? title ?? 'Back'}
          </span>
        </Link>
      ) : bare ? (
        <div className="flex-1 min-w-0">{searchButton}</div>
      ) : (
        <div className="flex-1 min-w-0">
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 mb-0.5">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-muted">›</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-xs font-medium text-muted hover:text-navy transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-xs font-medium text-ink2">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {title && <h1 className="text-[17px] font-bold text-navy leading-tight truncate">{title}</h1>}
          {subtitle && <p className="text-[13px] text-muted truncate">{subtitle}</p>}
        </div>
      )}

      {/* Center title — only shown on detail pages */}
      {backHref && title && (
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-bold text-navy truncate">{title}</p>
          {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
        </div>
      )}

      {/* Right — actions + search + dark mode + bell + avatar dropdown */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {!bare && searchButton}

        {inst.canInstall && (
          <button onClick={async () => { if (await inst.install()) notify.success('CareerPath is installed'); }}
            className="hidden h-[38px] items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle lg:inline-flex">
            <Icon name="install" size={16} line />Install app
          </button>
        )}

        <div className="hidden lg:block">
          <LanguageSwitcher />
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="hidden md:flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line bg-white text-ink2 hover:bg-subtle hover:text-navy transition-colors"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Icon name={dark ? 'sunLine' : 'moonLine'} size={17} />
        </button>

        {/* Notifications */}
        <Link href={notifHref} aria-label="Notifications" className="relative flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line bg-white text-ink2 hover:bg-subtle hover:text-navy transition-colors">
          <Icon name="bell" size={17} />
          {badges.notices > 0 && <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-azure" aria-label={`${badges.notices} unread`} />}
        </Link>

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line md:block" />

        {/* Avatar dropdown */}
        <DropdownMenu
          trigger={
            <button aria-label="Account menu" className="flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-azure/40">
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-accent-soft text-[13px] font-bold text-navy">
                {initials(user?.name ?? user?.email ?? '')}
              </span>
              <Icon name="chevronDown" size={14} className="text-muted" />
            </button>
          }
        >
          <DropdownLabel>{user?.name ?? user?.email ?? 'Account'}</DropdownLabel>
          <DropdownItem icon="user" onSelect={() => { window.location.href = profileHref; }}>
            My Profile
          </DropdownItem>
          <DropdownItem icon="settings" onSelect={() => { window.location.href = '/settings'; }}>
            Settings
          </DropdownItem>
          <DropdownItem
            icon={dark ? 'sunLine' : 'moonLine'}
            onSelect={toggleDark}>
            {dark ? 'Light mode' : 'Dark mode'}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon="logout" variant="danger" onSelect={logout}>
            Sign out
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}
