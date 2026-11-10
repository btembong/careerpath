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
  /** The outline (linear) version of the icon, where Solar has one */
  line?: boolean;
}

/** Renders a Solar icon by name key (from Icons map). */
export function Icon({ name, size = 18, className, line }: IconProps) {
  let icon: string = Icons[name];
  if (line && icon.endsWith('-bold')) {
    const linear = icon.replace(/-bold$/, '-linear');
    const key = linear.slice('solar:'.length);
    if ((solarIcons as any).icons[key] || (solarIcons as any).aliases?.[key]) icon = linear;
  }
  return (
    <Iconify
      icon={icon}
      width={size}
      height={size}
      className={clsx(className)}
    />
  );
}
