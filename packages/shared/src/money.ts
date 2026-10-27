/** ISO 4217 currencies with no minor unit — amounts are stored as whole units, not ×100. */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Convert a stored amount (minor units) to the human amount, e.g. 15000 GHS pesewas → 150. */
export function minorToMajor(amount: number, currency: string | null | undefined): number {
  return currency && ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? amount : amount / 100;
}
