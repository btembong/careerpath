'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useAuth } from '@/hooks/useAuth';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: string;
  keywords?: string;
}

const ADMIN_COMMANDS: CommandItem[] = [
  { id: 'a-dash',     label: 'Dashboard',          group: 'Admin',    href: '/admin/dashboard',   icon: '📊' },
  { id: 'a-users',    label: 'Users',               group: 'Admin',    href: '/admin/users',        icon: '👥' },
  { id: 'a-courses',  label: 'Course Management',   group: 'Admin',    href: '/admin/courses',      icon: '📚' },
  { id: 'a-packages', label: 'Packages',            group: 'Admin',    href: '/admin/packages',     icon: '📦' },
  { id: 'a-teachers', label: 'Teachers',            group: 'Admin',    href: '/admin/teachers',     icon: '🎓' },
  { id: 'a-reports',  label: 'Revenue Reports',     group: 'Admin',    href: '/admin/reports',      icon: '📈' },
  { id: 'a-payouts',  label: 'Payouts',             group: 'Admin',    href: '/admin/payouts',      icon: '💸' },
  { id: 'a-countries',label: 'Countries',           group: 'Admin',    href: '/admin/countries',    icon: '🌍' },
  { id: 'a-org',      label: 'Org Enrollments',     group: 'Admin',    href: '/admin/org',          icon: '🏢' },
  { id: 'a-reviews',  label: 'WP Reviews',          group: 'Admin',    href: '/admin/reviews',      icon: '✅' },
];

const TEACHER_COMMANDS: CommandItem[] = [
  { id: 't-dash',     label: 'Dashboard',           group: 'Teacher',  href: '/teacher/dashboard',  icon: '📊' },
  { id: 't-courses',  label: 'My Courses',          group: 'Teacher',  href: '/teacher/courses',    icon: '📚' },
  { id: 't-cohorts',  label: 'Cohorts',             group: 'Teacher',  href: '/teacher/cohorts',    icon: '👥' },
  { id: 't-live',     label: 'Live Classes',        group: 'Teacher',  href: '/teacher/live',       icon: '📡' },
  { id: 't-assign',   label: 'Assignments',         group: 'Teacher',  href: '/teacher/assignments', icon: '📝' },
  { id: 't-mentor',   label: 'Mentorship Slots',    group: 'Teacher',  href: '/teacher/mentorship', icon: '🤝' },
  { id: 't-wallet',   label: 'Wallet & Earnings',   group: 'Teacher',  href: '/teacher/wallet',     icon: '💰' },
];

const STUDENT_COMMANDS: CommandItem[] = [
  { id: 's-dash',     label: 'Dashboard',           group: 'Student',  href: '/student/dashboard',  icon: '📊' },
  { id: 's-cat',      label: 'Course Catalogue',    group: 'Student',  href: '/student/catalogue',  icon: '🗂️' },
  { id: 's-courses',  label: 'My Courses',          group: 'Student',  href: '/student/courses',    icon: '📚' },
  { id: 's-live',     label: 'Live Classes',        group: 'Student',  href: '/student/live',       icon: '📡' },
  { id: 's-assign',   label: 'Assignments',         group: 'Student',  href: '/student/assignments', icon: '📝' },
  { id: 's-mentor',   label: 'Mentorship',          group: 'Student',  href: '/student/mentorship', icon: '🤝' },
  { id: 's-certs',    label: 'Certificates',        group: 'Student',  href: '/student/certificates', icon: '🏆' },
  { id: 's-comm',     label: 'Community',           group: 'Student',  href: '/student/community',  icon: '💬' },
];

const GLOBAL_COMMANDS: CommandItem[] = [
  { id: 'g-settings', label: 'Settings',            group: 'General',  href: '/settings',           icon: '⚙️' },
];

const ROLE_COMMANDS: Record<string, CommandItem[]> = {
  ADMIN: [...ADMIN_COMMANDS, ...GLOBAL_COMMANDS],
  TEACHER: [...TEACHER_COMMANDS, ...GLOBAL_COMMANDS],
  STUDENT: [...STUDENT_COMMANDS, ...GLOBAL_COMMANDS],
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        // Don't intercept '/' inside input/textarea
        if (e.key === '/' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return;
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [toggle]);

  const commands = ROLE_COMMANDS[user?.role ?? 'STUDENT'] ?? GLOBAL_COMMANDS;

  // Group commands
  const groups = commands.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    (acc[cmd.group] ??= []).push(cmd);
    return acc;
  }, {});

  function runCommand(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        <Command>
          <div className="flex items-center gap-3 px-4 border-b border-gray-100">
            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Command.Input
              placeholder="Search pages, actions…"
              className="flex-1 py-3.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
              autoFocus
            />
            <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono flex-shrink-0">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-gray-400">
              No results found.
            </Command.Empty>

            {Object.entries(groups).map(([group, items]) => (
              <Command.Group key={group} heading={group}
                className="[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:py-1.5 [&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:font-bold [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-widest [&>[cmdk-group-heading]]:text-gray-400">
                {items.map(cmd => (
                  <Command.Item
                    key={cmd.id}
                    value={`${cmd.label} ${cmd.keywords ?? ''}`}
                    onSelect={() => runCommand(cmd.href)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-700 cursor-pointer
                      data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-700
                      aria-selected:bg-blue-50 aria-selected:text-blue-700
                      hover:bg-gray-50 transition-colors">
                    <span className="text-base w-6 text-center flex-shrink-0">{cmd.icon}</span>
                    <span className="font-medium">{cmd.label}</span>
                    <span className="ml-auto text-[10px] text-gray-300 font-mono truncate max-w-[120px]">{cmd.href}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono bg-white text-[9px]">↑↓</kbd>
              navigate
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono bg-white text-[9px]">↵</kbd>
              open
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono bg-white text-[9px]">⌘K</kbd>
              toggle
            </div>
            <div className="ml-auto text-[10px] text-gray-300">CareerPath Africa</div>
          </div>
        </Command>
      </div>
    </div>
  );
}
