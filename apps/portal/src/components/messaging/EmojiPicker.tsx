'use client';
import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { Categories, EmojiStyle, SuggestionMode, Theme, SkinTonePickerLocation } from 'emoji-picker-react';

// Loaded only when someone opens it, so chats stay quick
const Picker = dynamic(() => import('emoji-picker-react'), { ssr: false, loading: () => <div className="h-[380px] w-[340px] animate-pulse rounded-xl bg-subtle" /> });

/** Grouped and ordered like WhatsApp */
const GROUPS = [
  { category: Categories.SUGGESTED, name: 'Recently used' },
  { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
  { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
  { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
  { category: Categories.ACTIVITIES, name: 'Activity' },
  { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
  { category: Categories.OBJECTS, name: 'Objects' },
  { category: Categories.SYMBOLS, name: 'Symbols' },
  { category: Categories.FLAGS, name: 'Flags' },
];

/**
 * Every emoji, WhatsApp-style: recently used first, the same groups in the same order, search, and skin tones.
 * Emoji are drawn in the device's own emoji style.
 */
export function EmojiPicker({ onPick, onClose, className }: { onPick: (e: string) => void; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label="Emoji" className={clsx('z-40 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl shadow-xl', className)}>
      <Picker
        onEmojiClick={d => onPick(d.emoji)}
        categories={GROUPS}
        emojiStyle={EmojiStyle.NATIVE}
        theme={typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
        suggestedEmojisMode={SuggestionMode.RECENT}
        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
        searchPlaceHolder="Search emoji"
        previewConfig={{ showPreview: false }}
        lazyLoadEmojis
        width={340}
        height={380}
      />
    </div>
  );
}
