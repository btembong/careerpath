'use client';
/**
 * DateInput — Input field that opens a react-day-picker popover.
 *
 * Usage:
 *   <DateInput label="Start date" value={date} onChange={setDate} />
 */
import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { clsx } from 'clsx';
import { Icon } from './Icon';

interface DateInputProps {
  label?: string;
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

const dayPickerClassNames = {
  month_caption: 'text-sm font-bold text-navy mb-2 flex items-center justify-center',
  button_previous: 'absolute left-1 top-0 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-cloud transition text-royal/60',
  button_next: 'absolute right-1 top-0 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-cloud transition text-royal/60',
  month_grid: 'w-full border-collapse',
  weekdays: 'flex',
  weekday: 'text-[10px] font-semibold text-royal/40 uppercase w-9 text-center',
  week: 'flex',
  day: 'w-9 h-9 text-center text-xs',
  day_button: 'w-9 h-9 rounded-lg text-xs font-medium text-navy hover:bg-azure/10 transition cursor-pointer',
  selected: '[&>button]:bg-azure [&>button]:text-white [&>button]:hover:bg-royal [&>button]:font-bold',
  today: '[&>button]:ring-1 [&>button]:ring-azure/30',
  outside: 'opacity-30',
  disabled: 'opacity-20 cursor-not-allowed',
};

export function DateInput({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  error,
  className,
  minDate,
  maxDate,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const formatted = value
    ? value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className={clsx('flex flex-col gap-1.5', className)} ref={wrapRef}>
      {label && <label className="text-sm font-medium text-navy">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={clsx(
            'w-full flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-all',
            'focus:ring-2 focus:ring-azure/15',
            open ? 'border-azure' : error ? 'border-red-400' : 'border-cloud',
          )}
        >
          <Icon name="calendar" size={15} className="text-royal/40 flex-shrink-0" />
          <span className={value ? 'text-navy' : 'text-royal/40'}>{formatted || placeholder}</span>
          <Icon name="chevronDown" size={14} className="ml-auto text-royal/40" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1.5 rounded-2xl border border-cloud bg-white p-3 shadow-xl shadow-navy/10"
            style={{ minWidth: 280 }}>
            <DayPicker
              mode="single"
              selected={value}
              onSelect={(d) => { onChange(d); setOpen(false); }}
              classNames={dayPickerClassNames}
              disabled={[
                ...(minDate ? [{ before: minDate }] : []),
                ...(maxDate ? [{ after: maxDate }] : []),
              ] as any}
            />
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
