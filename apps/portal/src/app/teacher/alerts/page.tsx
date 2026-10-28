'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { Icon } from '@/components/ui/Icon';

interface Alert {
  id: string;
  cohortId: string;
  type: string;
  threshold: number;
  isActive: boolean;
}

interface AtRiskStudent {
  studentId: string;
  name: string;
  email: string;
  riskLevel: 'high' | 'medium' | 'low';
  daysInactive: number | null;
  xpTotal: number;
}

interface Cohort { id: string; name: string; }

const ALERT_TYPES = [
  { value: 'INACTIVE', label: 'Inactivity', unit: 'days inactive' },
  { value: 'QUIZ_BELOW_THRESHOLD', label: 'Quiz Score Below', unit: '% score' },
  { value: 'ASSIGNMENT_OVERDUE', label: 'Assignment Overdue', unit: 'days overdue' },
];

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

export default function AlertsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohort, setSelectedCohort] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ type: 'INACTIVE', threshold: 7 });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'config' | 'risk'>('config');

  useEffect(() => {
    api.get('/portals/teacher/cohorts').then(r => {
      const list: Cohort[] = r.data ?? [];
      setCohorts(list);
      if (list.length) setSelectedCohort(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCohort) return;
    setLoading(true);
    Promise.all([
      api.get(`/alerts?cohortId=${selectedCohort}`),
      api.get(`/alerts/at-risk/${selectedCohort}`),
    ])
      .then(([aRes, rRes]) => {
        setAlerts(aRes.data ?? []);
        setAtRisk(rRes.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCohort]);

  async function saveAlert() {
    if (!selectedCohort) return;
    setSaving(true);
    try {
      const r = await api.post('/alerts', { cohortId: selectedCohort, ...form });
      setAlerts(a => [...a.filter(x => !(x.cohortId === selectedCohort && x.type === form.type)), r.data]);
      notify.success('Alert saved');
    } catch { notify.error('Failed to save alert'); }
    finally { setSaving(false); }
  }

  async function toggleAlert(alert: Alert) {
    try {
      const r = await api.patch(`/alerts/${alert.id}`, { isActive: !alert.isActive });
      setAlerts(a => a.map(x => x.id === alert.id ? r.data : x));
    } catch { notify.error('Failed to update alert'); }
  }

  async function deleteAlert(id: string) {
    await api.delete(`/alerts/${id}`).catch(() => {});
    setAlerts(a => a.filter(x => x.id !== id));
    notify.success('Alert deleted');
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Topbar title="Student Alerts" backHref="/teacher/dashboard" />
      <div className="flex-1 p-4 pb-28 lg:pb-4 max-w-2xl mx-auto w-full space-y-4">

        {/* Cohort selector */}
        <div className="bg-white rounded-2xl border border-cloud p-4">
          <label className="text-xs font-bold text-royal/50 uppercase tracking-wide block mb-2">Cohort</label>
          <div className="relative">
            <Icon name="mentorship" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
            <select
              value={selectedCohort}
              onChange={e => setSelectedCohort(e.target.value)}
              className="w-full appearance-none border border-cloud rounded-xl pl-9 pr-8 py-2.5 text-sm text-navy focus:outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer">
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['config', 'risk'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === t ? 'bg-azure text-white' : 'bg-white border border-cloud text-royal/50 hover:text-navy'}`}>
              {t === 'config' ? 'Alert Config' : `At-Risk Students${atRisk.length ? ` (${atRisk.length})` : ''}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'config' ? (
          <>
            {/* Create / update alert */}
            <div className="bg-white rounded-2xl border border-cloud p-5">
              <h3 className="font-bold text-navy mb-4">Configure Alert</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-royal/50 uppercase tracking-wide block mb-1">Alert type</label>
                  <div className="relative">
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full appearance-none border border-cloud rounded-xl pl-3 pr-8 py-2.5 text-sm text-navy focus:outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer">
                      {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-royal/50 uppercase tracking-wide block mb-1">
                    Threshold ({ALERT_TYPES.find(t => t.value === form.type)?.unit ?? 'value'})
                  </label>
                  <input type="number" min={1} value={form.threshold}
                    onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))}
                    className="w-full border border-cloud rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition" />
                </div>
              </div>
              <button onClick={saveAlert} disabled={saving || !selectedCohort}
                className="mt-4 w-full py-2.5 rounded-xl bg-azure text-white font-bold text-sm hover:bg-royal transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Alert'}
              </button>
            </div>

            {/* Existing alerts */}
            {alerts.length > 0 && (
              <div className="bg-white rounded-2xl border border-cloud p-5">
                <h3 className="font-bold text-navy mb-4">Active Alerts</h3>
                <div className="space-y-3">
                  {alerts.map(a => {
                    const info = ALERT_TYPES.find(t => t.value === a.type);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b border-cloud last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-navy">{info?.label ?? a.type}</p>
                          <p className="text-xs text-royal/50">Threshold: {a.threshold} {info?.unit}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleAlert(a)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-cloud text-royal/50'}`}>
                            {a.isActive ? 'Active' : 'Paused'}
                          </button>
                          <button onClick={() => deleteAlert(a.id)}
                            className="text-red-400 hover:text-red-600 transition">
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {alerts.length === 0 && (
              <p className="text-center text-sm text-royal/50 py-6">No alerts configured. Create one above.</p>
            )}
          </>
        ) : (
          /* At-risk students */
          <>
            {atRisk.length === 0 ? (
              <div className="text-center py-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 mx-auto mb-3">
                  <Icon name="check" size={24} className="text-green-500" />
                </div>
                <p className="font-bold text-navy">All students on track</p>
                <p className="text-sm text-royal/50 mt-1">No at-risk students detected in this cohort.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {atRisk.map(s => (
                  <div key={s.studentId} className="bg-white rounded-2xl border border-cloud p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-cloud rounded-full flex items-center justify-center text-sm font-bold text-navy flex-shrink-0">
                      {s.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{s.name || s.email}</p>
                      <p className="text-xs text-royal/50">
                        {s.daysInactive === null ? 'Never active' : s.daysInactive > 0 ? `Inactive ${s.daysInactive}d` : 'Active recently'} · {s.xpTotal} XP
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md flex-shrink-0 capitalize ${RISK_COLORS[s.riskLevel]}`}>
                      {s.riskLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
