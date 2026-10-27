'use client';
import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label htmlFor={inputId} className="text-sm font-medium text-navy">{label}</label>}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full rounded-xl border border-cloud bg-white px-4 py-3 text-sm text-navy placeholder-royal/40 outline-none transition-all resize-y min-h-[100px]',
            'focus:border-azure focus:ring-2 focus:ring-azure/15',
            'disabled:cursor-not-allowed disabled:bg-surface disabled:text-royal',
            error && 'border-red-400',
            className,
          )}
          {...props as any}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-royal/60">{hint}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
