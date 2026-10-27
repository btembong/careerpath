'use client';
import * as _RadixSelect from '@radix-ui/react-select';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixSelect = _RadixSelect as any; // React 19 + pnpm module-identity workaround (TS2786)

interface SelectOption {
  value: string;
  label: string;
  avatar?: string; // initials or single letter for avatar circle
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ value, onValueChange, options, placeholder = '— Select —', disabled, className = '' }: SelectProps) {
  return (
    <RadixSelect.Root value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none transition data-[placeholder]:text-royal/40 hover:border-azure/50 focus:border-azure disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-royal/40 flex-shrink-0">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[200] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-cloud bg-white shadow-xl shadow-navy/10"
        >
          <RadixSelect.Viewport className="p-1.5 max-h-64 overflow-y-auto">
            {placeholder && (
              <RadixSelect.Item
                value=""
                className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-royal/40 outline-none data-[highlighted]:bg-cloud transition"
              >
                <RadixSelect.ItemText>{placeholder}</RadixSelect.ItemText>
              </RadixSelect.Item>
            )}
            {options.map(opt => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-navy outline-none data-[highlighted]:bg-azure/10 data-[highlighted]:text-azure data-[state=checked]:font-semibold data-[state=checked]:text-azure transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.avatar !== undefined && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-azure/15 text-azure text-[10px] font-black uppercase">
                      {opt.avatar || opt.label[0]}
                    </span>
                  )}
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </div>
                <RadixSelect.ItemIndicator>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
