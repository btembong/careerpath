'use client';
import { useEffect, useState } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  // Initialise from localStorage on mount (client only)
  useEffect(() => {
    const stored = localStorage.getItem('cpa_dark_mode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enabled = stored !== null ? stored === 'true' : prefersDark;
    setDark(enabled);
    document.documentElement.classList.toggle('dark', enabled);
  }, []);

  function toggle() {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('cpa_dark_mode', String(next));
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }

  return { dark, toggle };
}
