'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

export interface ChecklistItem { key: string; label: string; ok: boolean; required: boolean; detail?: string; }
export interface Checklist { items: ChecklistItem[]; readyToSubmit: boolean; }

/** Loads /platform-courses/:id/checklist; `reloadKey` lets the parent refresh it after edits. */
export function useCourseChecklist(courseId: string, reloadKey: unknown = 0) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const reload = useCallback(() => {
    api.get(`/platform-courses/${courseId}/checklist`).then(r => setChecklist(r.data)).catch(() => setChecklist(null));
  }, [courseId]);
  useEffect(() => { reload(); }, [reload, reloadKey]);
  return { checklist, setChecklist, reload };
}

function Row({ item }: { item: ChecklistItem }) {
  const tone = item.ok ? 'text-emerald-600' : item.required ? 'text-red-500' : 'text-amber-500';
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className={`mt-0.5 flex-shrink-0 ${tone}`}>
        <Icon name={item.ok ? 'check' : item.required ? 'close' : 'alert'} size={14} />
      </span>
      <span className="min-w-0">
        <span className={`text-xs ${item.ok ? 'text-royal/60' : 'text-navy font-medium'}`}>{item.label}</span>
        {!item.ok && item.detail && <span className="block text-[11px] text-royal/50">{item.detail}</span>}
      </span>
    </li>
  );
}

export function CourseChecklistPanel({ checklist, compact = false }: { checklist: Checklist | null; compact?: boolean }) {
  if (!checklist) return null;
  const required = checklist.items.filter(i => i.required);
  const recommended = checklist.items.filter(i => !i.required);
  const done = required.filter(i => i.ok).length;

  return (
    <div className="rounded-2xl border border-cloud bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-navy">Course readiness</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${checklist.readyToSubmit ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {checklist.readyToSubmit ? 'Ready for review' : `${done}/${required.length} required`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-cloud overflow-hidden">
        <div className="h-full bg-azure transition-all" style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Required</p>
        <ul>{required.map(i => <Row key={i.key} item={i} />)}</ul>
      </div>
      {!compact && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Recommended</p>
          <ul>{recommended.map(i => <Row key={i.key} item={i} />)}</ul>
        </div>
      )}
    </div>
  );
}
