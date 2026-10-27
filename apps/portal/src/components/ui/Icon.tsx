'use client';
import { Icon as Iconify, addCollection } from '@iconify/react';
import solarIcons from '@iconify-json/solar/icons.json';
import { clsx } from 'clsx';
import { Icons } from '@/lib/icons';
import type { IconName } from '@/lib/icons';
export type { IconName };

// Register Solar icons locally — prevents runtime CDN fetches
addCollection(solarIcons as Parameters<typeof addCollection>[0]);

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Renders a Solar icon by name key (from Icons map). */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <Iconify
      icon={Icons[name]}
      width={size}
      height={size}
      className={clsx(className)}
    />
  );
}
