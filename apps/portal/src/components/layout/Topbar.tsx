'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownLabel } from '../ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

/* ─── OS detection for keyboard shortcut label ────────────────────────────── */

function useIsMac() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform?.toLowerCase().includes('mac') || navigator.userAgent?.toLowerCase().includes('mac'));
  }, []);
  return isMac;
}

function initials(s: string) {
  const parts = s.replace(/@.*/, '').split(/[s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
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
  const profileHref = PROFILE_ROUTES[user?.role ?? ''] ?? '/student/profile';

  return (
    <header className="flex h-16 items-center border-b border-line bg-white px-4 lg:px-7 gap-3">

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
          <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-azure" />
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
  );
}
