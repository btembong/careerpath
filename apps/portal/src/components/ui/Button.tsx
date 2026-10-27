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
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 select-none';
  const variants = {
    primary:   'bg-azure text-white hover:bg-royal shadow-sm shadow-azure/20 rounded-xl',
    secondary: 'border border-cloud bg-white text-navy hover:bg-cloud rounded-xl',
    ghost:     'text-royal hover:bg-cloud rounded-xl',
    danger:    'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/20 rounded-xl',
    link:      'text-azure hover:text-royal underline-offset-4 hover:underline p-0',
  };
  const sizes = {
    sm:   'px-3.5 py-2 text-xs',
    md:   'px-5 py-2.5 text-sm',
    lg:   'px-6 py-3.5 text-sm',
    icon: 'h-9 w-9 p-0 rounded-lg',
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
