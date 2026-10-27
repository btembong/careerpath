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
    <div className="flex items-center gap-1 rounded-xl border border-cloud bg-white p-1">
      {LOCALES.map(l => (
        <button key={l.code} onClick={() => switchLocale(l.code)}
          title={l.full}
          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
            current === l.code ? 'bg-azure text-white' : 'text-royal/50 hover:text-navy'
          }`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
