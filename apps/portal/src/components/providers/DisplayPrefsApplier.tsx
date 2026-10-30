'use client';
import { useEffect } from 'react';

export const TEXT_SIZE_KEY = 'cpa:textSize';
const ZOOM: Record<string, string> = { small: '0.92', normal: '', large: '1.12' };

/** Settings → Language and display: text size is applied by zooming the page (most sizes are in px). */
export function applyTextSize(size: string) {
  if (typeof document === 'undefined') return;
  (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = ZOOM[size] ?? '';
}

export function DisplayPrefsApplier() {
  useEffect(() => {
    try { applyTextSize(localStorage.getItem(TEXT_SIZE_KEY) ?? 'normal'); } catch { /* storage blocked */ }
  }, []);
  return null;
}
