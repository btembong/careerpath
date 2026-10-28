'use client';
import { useState } from 'react';

const LOCALES = [
  { code: 'en', label: 'EN', full: 'English' },
  { code: 'fr', label: 'FR', full: 'Français' },
];

export function LanguageSwitcher() {
  const [current, setCurrent] = useState(() => {
    if (typeof document !== 'undefined') {
      const m = document.cookie.match(/cpa_locale=([^;]+)/);
      return m?.[1] ?? 'en';
    }
    return 'en';
  });

  function switchLocale(code: string) {
    document.cookie = `cpa_locale=${code};path=/;max-age=31536000;SameSite=Lax`;
    setCurrent(code);
    window.location.reload();
  }

  return (
    <div role="group" aria-label="Language" className="flex items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
      {LOCALES.map(l => (
        <button key={l.code} onClick={() => switchLocale(l.code)}
          title={l.full}
          aria-pressed={current === l.code}
          className={`h-7 rounded px-2.5 text-xs font-bold transition-colors ${
            current === l.code ? 'bg-accent-soft text-navy' : 'text-muted hover:text-navy'
          }`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
