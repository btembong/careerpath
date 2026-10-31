'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { AboutYou, type EditableProfile } from '@/components/profile/AboutYou';
import { PayoutCard, type Payout } from '@/components/payout/PayoutCard';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

export default function RepProfilePage() {
  const [p, setP] = useState<EditableProfile | null>(null);
  const [payout, setPayout] = useState<Payout | null | undefined>(undefined);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get('/auth/me/profile').then(r => setP(r.data)).catch(() => notify.error('Could not load your profile'));
    api.get('/payout-accounts/me').then(r => setPayout(r.data || null)).catch(() => setPayout(null));
    api.get('/auth/me/preferences').then(r => setCountries(r.data.countries ?? [])).catch(() => {});
  }, []);

  const c = p?.country;
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My profile" subtitle="Your details, terms and where you’re paid" />
      {!p ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7 lg:my-6" /> : (
        <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
          <div className="min-w-0 flex-[999_1_520px]">
            <AboutYou p={p} onSaved={setP} phoneLabel="Phone and WhatsApp" bioLabel="Shown to schools and parents"
              bioPlaceholder={`I help schools and families in ${c?.name ?? 'my country'} get started with CareerPath Africa. Call or WhatsApp me any weekday.`}
              extra={[{ label: 'Country', value: c?.name ?? 'Not assigned yet', hint: 'Set by an admin.' }]} />
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">Your terms</h3>
              {[
                ['Commission on sales', c?.repCommissionPercent != null ? `${c.repCommissionPercent}%` : 'not set'],
                ['Bonus per active student', c?.perStudentBonus ? `${money(c.perStudentBonus, c.currency)} a month` : 'none'],
                ['Paid', 'to your wallet, then monthly payout'],
              ].map(([l, v]) => <p key={l} className="flex justify-between gap-3 text-[13px]"><span className="text-ink2">{l}</span><strong className="text-right text-navy">{v}</strong></p>)}
              <p className="text-xs text-muted">Set by CareerPath. Contact your admin to change them.</p>
            </section>
            <PayoutCard payout={payout} countries={countries} onSaved={setPayout} highlight={payout === null} />
          </aside>
        </div>
      )}
    </div>
  );
}
