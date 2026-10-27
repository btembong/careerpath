'use client';
import Link from 'next/link';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useAuth } from '@/hooks/useAuth';

export function Navbar() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-cloud bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy">
            <span className="text-sm font-black text-white">C</span>
          </div>
          <span className="hidden text-base font-bold text-navy sm:block">CareerPath<span className="text-azure">Africa</span></span>
        </Link>

        {/* Search — desktop */}
        <div className="hidden flex-1 max-w-sm mx-8 md:flex">
          <div className="relative w-full">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40" />
            <input
              placeholder="Search courses, packages…"
              className="w-full rounded-xl border border-cloud bg-surface py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-azure focus:bg-white focus:ring-2 focus:ring-azure/20 placeholder:text-royal/40 text-navy"
            />
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button className="relative rounded-xl border border-cloud p-2.5 text-royal hover:bg-cloud transition">
            <Icon name="bell" size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-azure" />
          </button>
          {user && (
            <Link href={`/${user.role.toLowerCase()}/dashboard`}>
              <Avatar name={user.name ?? user.email} size="sm" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
