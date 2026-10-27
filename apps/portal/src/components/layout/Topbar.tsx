'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '../ui/Avatar';
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

/* ─── Role-based routes ───────────────────────────────────────────────────── */

const NOTIFICATION_ROUTES: Record<string, string> = {
  STUDENT:          '/student/notifications',
  TEACHER:          '/teacher/alerts',
  ADMIN:            '/admin/notifications',
  COUNTRY_REP:      '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
};

const PROFILE_ROUTES: Record<string, string> = {
  STUDENT:          '/student/profile',
  TEACHER:          '/teacher/profile',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/profile',
  SUBJECT_REVIEWER: '/reviewer/profile',
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

  const notifHref = NOTIFICATION_ROUTES[user?.role ?? ''] ?? '/student/notifications';
  const profileHref = PROFILE_ROUTES[user?.role ?? ''] ?? '/student/profile';

  return (
    <header className="flex h-16 items-center border-b border-cloud bg-white px-4 gap-3">

      {/* Left — back button OR title + breadcrumbs */}
      {backHref ? (
        <Link
          href={backHref}
          className="flex items-center gap-2 rounded-xl px-2 py-2 -ml-1 text-navy hover:bg-cloud transition-all group flex-shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cloud group-hover:bg-azure/15 transition-colors">
            <Icon name="arrowLeft" size={14} className="text-navy group-hover:text-azure transition-colors" />
          </span>
          <span className="text-sm font-semibold text-navy group-hover:text-azure transition-colors hidden sm:block">
            {backLabel ?? title ?? 'Back'}
          </span>
        </Link>
      ) : (
        <div className="flex-1 min-w-0">
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 mb-0.5">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <Icon name="chevronRight" size={10} className="text-royal/30" />}
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-[11px] font-medium text-royal/50 hover:text-azure transition">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-[11px] font-medium text-navy">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {title && <h1 className="text-base font-bold text-navy leading-tight truncate">{title}</h1>}
          {subtitle && <p className="text-xs text-royal/50 truncate">{subtitle}</p>}
        </div>
      )}

      {/* Center title — only shown on detail pages */}
      {backHref && title && (
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-bold text-navy truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-royal/50 truncate">{subtitle}</p>}
        </div>
      )}

      {/* Right — actions + search + dark mode + bell + avatar dropdown */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* Search bar */}
        <button
          onClick={openPalette}
          className="hidden md:flex items-center gap-2 rounded-xl border border-cloud bg-surface px-3 py-2 text-xs text-royal/50 hover:border-azure/30 hover:text-navy transition w-44 group">
          <Icon name="search" size={13} className="text-royal/40 group-hover:text-azure transition" />
          <span className="flex-1 text-left">Search…</span>
          <div className="flex items-center gap-0.5">
            <kbd className="rounded border border-cloud bg-white px-1 py-0.5 text-[9px] font-mono text-royal/40">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="rounded border border-cloud bg-white px-1 py-0.5 text-[9px] font-mono text-royal/40">K</kbd>
          </div>
        </button>

        <div className="hidden lg:block">
          <LanguageSwitcher />
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-royal/40 hover:bg-cloud hover:text-navy transition"
          title={dark ? 'Light mode' : 'Dark mode'}>
          <Icon name={dark ? 'sunLine' : 'moonLine'} size={17} />
        </button>

        {/* Notifications */}
        <Link href={notifHref} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-royal/40 hover:bg-cloud hover:text-navy transition">
          <Icon name="bell" size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-azure ring-2 ring-white" />
        </Link>

        {/* Avatar dropdown */}
        <DropdownMenu
          trigger={
            <button className="rounded-full outline-none focus:ring-2 focus:ring-azure/20">
              <Avatar name={user?.name ?? user?.email} size="sm" />
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
