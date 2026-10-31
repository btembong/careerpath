import { minorToMajor } from '@cpa/shared';

/** "GHS 1,240" from an amount in minor units */
export const money = (amount: number, currency: string) =>
  `${currency} ${minorToMajor(amount, currency).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
