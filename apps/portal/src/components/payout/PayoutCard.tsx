'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ProviderLogo } from '@/components/payout/ProviderLogo';

export interface Payout { bankName: string; accountNumber: string; bankCode: string | null; country: string; isVerified: boolean; nameCheck?: string | null; holderName?: string | null }

const card = 'flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]';

/**
 * Where earnings are paid, on the profile pages. Changing it happens in Get paid, on the earnings page,
 * where it needs a code from email and sets the withdrawal PIN. `payout` undefined = still loading.
 */
export function PayoutCard({ payout, highlight = false }: { payout: Payout | null | undefined; countries?: { id: string; name: string }[]; onSaved?: (p: Payout) => void; highlight?: boolean }) {
  const home = `/${(usePathname() ?? '/teacher').split('/')[1] || 'teacher'}/wallet`;
  return (
    <section className={clsx(card, highlight && 'border-azure')}>
      <div>
        <h2 className="text-base font-bold text-navy">Payout account</h2>
        <p className="mt-0.5 text-[13px] text-ink2">Where your earnings are sent when you withdraw.</p>
      </div>
      {payout === undefined ? <div className="h-12 animate-pulse rounded-md bg-subtle" />
        : payout ? (
          <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
            <ProviderLogo label={payout.bankName} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-navy">{payout.bankName} ·· {payout.accountNumber.replace(/\D/g, '').slice(-3)}</p>
              <p className="text-xs text-muted">{payout.nameCheck === 'match' ? `Registered to ${payout.holderName}` : payout.isVerified ? 'Confirmed by our team' : 'Being checked'}</p>
            </div>
          </div>
        ) : <p className="text-[13px] text-ink2">No payout account yet.</p>}
      <Link href={home} className="inline-flex h-[34px] items-center self-start rounded-md bg-azure-strong px-3.5 text-[13px] font-semibold text-on-accent">{payout ? 'Change it in Get paid' : 'Set it up in Get paid'}</Link>
    </section>
  );
}
