import { clsx } from 'clsx';
import { bankById, bankByName, type Bank } from '@/lib/banks';

/** Which brand a payout account is, from its provider code or its label ("MTN Mobile Money", "Orange Money", a bank) */
export function providerOf(provider?: string | null, label?: string | null): 'MTN' | 'ORANGE' | 'BANK' | null {
  if (provider === 'MTN' || provider === 'ORANGE' || provider === 'BANK') return provider;
  if (/orange/i.test(label ?? '')) return 'ORANGE';
  if (/mtn|momo/i.test(label ?? '')) return 'MTN';
  if (bankByName(label)) return 'BANK';
  return null;
}

/** A bank's logo tile, or its initials in its colour when we have no logo */
export function BankLogo({ bank, size = 36, className }: { bank: Bank; size?: number; className?: string }) {
  if (bank.logo) return <img src={`/brand/banks/${bank.id}.png`} alt={bank.name} width={size} height={size} className={clsx('flex-shrink-0 rounded-lg border border-line bg-white', className)} style={{ width: size, height: size }} />;
  return (
    <span role="img" aria-label={bank.name} style={{ width: size, height: size, background: bank.colour, fontSize: Math.max(8, Math.round(size / (bank.short.length > 3 ? 4.2 : 3.3))) }}
      className={clsx('flex flex-shrink-0 items-center justify-center rounded-lg font-extrabold tracking-tight text-[#FFFFFF]', className)}>{bank.short}</span>
  );
}

/** The MTN MoMo, Orange Money or bank mark for a payout account; a plain franc sign for anything else */
export function ProviderLogo({ provider, label, bankId, size = 36, className }: { provider?: string | null; label?: string | null; bankId?: string | null; size?: number; className?: string }) {
  const p = providerOf(provider, label);
  if (p === 'BANK') {
    const bank = bankById(bankId) ?? bankByName(label);
    if (bank) return <BankLogo bank={bank} size={size} className={className} />;
  }
  if (p === 'MTN' || p === 'ORANGE') return <img src={p === 'MTN' ? '/brand/mtn-momo.svg' : '/brand/orange-money.svg'} alt={p === 'MTN' ? 'MTN Mobile Money' : 'Orange Money'} width={size} height={size} className={clsx('flex-shrink-0 rounded-lg', className)} style={{ width: size, height: size }} />;
  return <span style={{ width: size, height: size }} className={clsx('flex flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]', className)} aria-hidden>₣</span>;
}
