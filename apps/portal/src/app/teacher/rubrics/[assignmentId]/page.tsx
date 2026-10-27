'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { Icon } from '@/components/ui/Icon';

interface Criterion {
  id?: string;
  name: string;
  description: string;
  weight: number;
}

interface Rubric {
  id: string;
  assignmentId: string;
  criteria: (Criterion & { id: string })[];
}

const DEFAULT_CRITERION: Criterion = { name: '', description: '', weight: 25 };

export default function RubricBuilderPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([{ ...DEFAULT_CRITERION }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/rubrics/${assignmentId}`)
      .then(r => {
        setRubric(r.data);
        setCriteria(r.data.criteria ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assignmentId]);

  const totalWeight = criteria.reduce((s, c) => s + (c.weight || 0), 0);

  function updateCriterion(i: number, field: keyof Criterion, value: string | number) {
    setCriteria(cs => cs.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  function addCriterion() {
    setCriteria(cs => [...cs, { ...DEFAULT_CRITERION }]);
  }

  function removeCriterion(i: number) {
    setCriteria(cs => cs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (totalWeight !== 100) { notify.error('Total weight must equal 100%'); return; }
    if (criteria.some(c => !c.name.trim())) { notify.error('All criteria need a name'); return; }
    setSaving(true);
    try {
      const r = await api.post(`/rubrics/${assignmentId}`, { criteria });
      setRubric(r.data);
      setCriteria(r.data.criteria ?? criteria);
      notify.success('Rubric saved');
    } catch { notify.error('Failed to save rubric'); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Topbar title="Rubric Builder" backHref="/teacher/assignments" />
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-cloud p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-navy">Grading Criteria</h2>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${totalWeight === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  Total: {totalWeight}%
                </span>
              </div>

              <div className="space-y-4">
                {criteria.map((c, i) => (
                  <div key={i} className="bg-surface rounded-xl p-4 border border-cloud">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-azure">Criterion {i + 1}</span>
                      {criteria.length > 1 && (
                        <button onClick={() => removeCriterion(i)}
                          className="text-red-400 hover:text-red-600 transition">
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        placeholder="Criterion name (e.g. Content Quality)"
                        value={c.name}
                        onChange={e => updateCriterion(i, 'name', e.target.value)}
                        className="w-full border border-cloud rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure"
                      />
                      <textarea
                        placeholder="Description / rubric descriptors (optional)"
                        value={c.description}
                        onChange={e => updateCriterion(i, 'description', e.target.value)}
                        rows={2}
                        className="w-full border border-cloud rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure resize-none"
                      />
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-muted font-semibold flex-shrink-0">Weight (%)</label>
                        <input
                          type="number" min={1} max={100}
                          value={c.weight}
                          onChange={e => updateCriterion(i, 'weight', Number(e.target.value))}
                          className="w-24 border border-cloud rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure"
                        />
                        <div className="flex-1 h-2 bg-cloud rounded-full overflow-hidden">
                          <div className="h-full bg-azure rounded-full" style={{ width: `${Math.min(100, c.weight)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addCriterion}
                className="mt-4 w-full py-2.5 rounded-xl border-2 border-dashed border-cloud text-sm text-muted hover:border-azure hover:text-azure transition font-semibold">
                + Add Criterion
              </button>
            </div>

            {/* Scoring guide */}
            <div className="bg-azure/5 rounded-2xl border border-azure/20 p-4 text-xs text-navy/70 leading-relaxed">
              <p className="font-bold text-azure mb-1">Scoring Guide</p>
              Each criterion is scored 0–4: <strong>0</strong> = Not attempted, <strong>1</strong> = Below expectations,
              <strong> 2</strong> = Meets expectations, <strong>3</strong> = Exceeds expectations, <strong>4</strong> = Outstanding.
              The final grade is the weighted average.
            </div>

            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-xl bg-azure text-white font-bold text-sm hover:bg-royal transition disabled:opacity-50">
              {saving ? 'Saving…' : rubric ? 'Update Rubric' : 'Save Rubric'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
