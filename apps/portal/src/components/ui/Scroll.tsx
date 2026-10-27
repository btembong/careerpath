'use client';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import type { ComponentPropsWithoutRef } from 'react';

interface Props extends ComponentPropsWithoutRef<'div'> {
  children: React.ReactNode;
}

/**
 * Scroll — thin overlay scrollbar (macOS-style).
 * Floats on top of content, auto-hides when idle.
 * Use instead of overflow-y-auto on dark panels.
 */
export function Scroll({ children, className, ...props }: Props) {
  return (
    <OverlayScrollbarsComponent
      element="div"
      options={{
        scrollbars: {
          theme: 'os-theme-azure',
          autoHide: 'scroll',
          autoHideDelay: 800,
          clickScroll: true,
        },
      }}
      className={className}
      {...(props as object)}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
