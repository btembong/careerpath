'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface XPData { xpTotal: number; streak: number; badges: { badge: string }[] }

export function XPBar() {
  const [data, setData] = useState<XPData | null>(null);

  useEffect(() => {
    api.get('/gamification/me').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return null;

  const xpInLevel = data.xpTotal % 1000;
  const pct = (xpInLevel / 1000) * 100;
  const level = Math.floor(data.xpTotal / 1000) + 1;

  return (
    <div className="px-3 pb-3">
      <div className="bg-surface rounded-xl p-3 border border-cloud">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-azure uppercase tracking-wide">Level {level}</span>
            <span className="text-[10px] text-muted">· {data.xpTotal} XP</span>
          </div>
          {data.streak > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
              🔥 {data.streak}d
            </span>
          )}
        </div>
        <div className="h-1.5 bg-cloud rounded-full">
          <div className="h-1.5 bg-azure rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[9px] text-muted mt-1">{1000 - xpInLevel} XP to level {level + 1}</div>
      </div>
    </div>
  );
}
