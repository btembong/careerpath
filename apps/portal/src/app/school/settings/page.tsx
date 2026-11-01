'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { notify } from '@/lib/notify';
import type { SchoolDashboard } from '@/lib/school';
import api from '@/lib/api';

export default function SchoolSettingsPage() {
  const { user } = useAuth();
  const [d, setD] = useState<SchoolDashboard | null>(null);
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/org/school').then(r => { setD(r.data); setDomain(r.data.org.emailDomain ?? ''); }).catch(() => notify.error('Could not load your school')); }, []);

  async function save() {
    setSaving(true);
    try { const r = await api.patch('/org/school/settings', { emailDomain: domain.trim() || null }); setDomain(r.data.emailDomain ?? ''); notify.success('Saved'); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Settings" subtitle={d?.org.name ?? 'Your school'} />
      <div className="flex max-w-[760px] flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Who can join</h2>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Only emails ending in</span>
            <div className="flex items-center gap-2"><span className="text-[14px] text-muted">@</span><input value={domain} onChange={e => setDomain(e.target.value.replace(/^@/, ''))} placeholder="e.g. achimota.edu.gh — leave empty for anyone" className="input-base flex-1" /></div></label>
          <p className="text-[12.5px] text-muted">Applies to your join link and to email invites. Leave it empty if students use personal emails.</p>
          <div className="flex justify-end"><Button size="sm" onClick={save} loading={saving} disabled={!d || domain.trim() === (d.org.emailDomain ?? '')}>Save</Button></div>
        </section>
        <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-[18px]">
          <h2 className="text-[16px] font-bold text-navy">Signing in</h2>
          <p className="text-[13.5px] text-ink2">You sign in as <strong className="text-navy">{user?.email}</strong> with a code we email you each time — no password to remember.</p>
          <p className="text-[12.5px] text-muted">To add another admin for your school, more seats or another package, contact CareerPath Africa.</p>
        </section>
      </div>
    </div>
  );
}
