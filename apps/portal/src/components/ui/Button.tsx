'use client';
import { type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Icon } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  fullWidth?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

// React 19: ref is passed as a regular prop — no forwardRef needed.
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  className,
  children,
  disabled,
  style,
  ref,
  ...props
}: ButtonProps) {
  // Square-ish, flat buttons. One accent: primary is the brand blue; danger is red text only.
  const base = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none';
  const variants = {
    primary:   'border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95',
    secondary: 'border border-line bg-white text-navy hover:bg-subtle',
    ghost:     'border border-transparent text-azure-strong hover:bg-subtle',
    danger:    'border border-line bg-white text-error hover:bg-subtle',
    link:      'text-azure-strong underline-offset-4 hover:underline p-0',
  };
  const sizes = {
    sm:   'h-8 px-3 text-[13px]',
    md:   'h-9 px-4 text-[13.5px]',
    lg:   'h-10 px-5 text-sm',
    icon: 'h-9 w-9 p-0',
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      style={style}
      className={clsx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading && <Icon name="spinner" size={16} className="animate-spin" />}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {children as any}
    </button>
  );
}
