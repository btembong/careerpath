'use client';
import { type InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label htmlFor={inputId} className="text-sm font-medium text-navy">{label}</label>}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal">{leftIcon}</span>
          )}
          <input ref={ref} id={inputId}
            className={clsx(
              'w-full rounded-xl border border-cloud bg-white px-4 py-3 text-sm text-navy placeholder-royal/40 outline-none transition-all',
              'focus:border-azure focus:ring-2 focus:ring-azure/15',
              'disabled:cursor-not-allowed disabled:bg-surface disabled:text-royal',
              leftIcon && 'pl-10', rightIcon && 'pr-10',
              error && 'border-red-400',
              className,
            )} {...(props as React.InputHTMLAttributes<HTMLInputElement>)} />
          {rightIcon && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-royal">{rightIcon}</span>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-royal/60">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
