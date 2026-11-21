/**
 * Where earners outside Cameroon can be paid (the portal keeps the same lists, with logos).
 * code = the bank's CBN sort code in Nigeria; branch = the universal branch code in South Africa.
 * These are paid by hand by our team until a payout partner covers the country.
 */
export interface PayoutBank { id: string; name: string; code?: string; branch?: string }

export const NG_BANKS: PayoutBank[] = [
  { id: 'ng-gtbank', name: 'GTBank', code: '058' }, { id: 'ng-access', name: 'Access Bank', code: '044' }, { id: 'ng-zenith', name: 'Zenith Bank', code: '057' },
  { id: 'ng-firstbank', name: 'First Bank', code: '011' }, { id: 'ng-uba', name: 'UBA', code: '033' }, { id: 'ng-opay', name: 'OPay' },
  { id: 'ng-fidelity', name: 'Fidelity Bank', code: '070' }, { id: 'ng-fcmb', name: 'FCMB', code: '214' }, { id: 'ng-stanbic', name: 'Stanbic IBTC', code: '221' },
  { id: 'ng-sterling', name: 'Sterling Bank', code: '232' }, { id: 'ng-union', name: 'Union Bank', code: '032' }, { id: 'ng-wema', name: 'Wema Bank (ALAT)', code: '035' },
  { id: 'ng-ecobank', name: 'Ecobank Nigeria', code: '050' }, { id: 'ng-polaris', name: 'Polaris Bank', code: '076' }, { id: 'ng-keystone', name: 'Keystone Bank', code: '082' },
  { id: 'ng-kuda', name: 'Kuda' }, { id: 'ng-palmpay', name: 'PalmPay' }, { id: 'ng-moniepoint', name: 'Moniepoint' },
];

export const KE_BANKS: PayoutBank[] = [
  { id: 'ke-equity', name: 'Equity Bank' }, { id: 'ke-kcb', name: 'KCB' }, { id: 'ke-coop', name: 'Co-operative Bank' }, { id: 'ke-ncba', name: 'NCBA' },
  { id: 'ke-stanbic', name: 'Stanbic Bank Kenya' }, { id: 'ke-absa', name: 'Absa Kenya' }, { id: 'ke-stanchart', name: 'Standard Chartered Kenya' },
  { id: 'ke-im', name: 'I&M Bank' }, { id: 'ke-dtb', name: 'Diamond Trust Bank (DTB)' }, { id: 'ke-family', name: 'Family Bank' },
];

export const ZA_BANKS: PayoutBank[] = [
  { id: 'za-capitec', name: 'Capitec', branch: '470010' }, { id: 'za-fnb', name: 'FNB', branch: '250655' }, { id: 'za-standard', name: 'Standard Bank', branch: '051001' },
  { id: 'za-absa', name: 'Absa', branch: '632005' }, { id: 'za-nedbank', name: 'Nedbank', branch: '198765' }, { id: 'za-tyme', name: 'TymeBank', branch: '678910' },
  { id: 'za-discovery', name: 'Discovery Bank', branch: '679000' }, { id: 'za-african', name: 'African Bank', branch: '430000' }, { id: 'za-investec', name: 'Investec', branch: '580105' },
  { id: 'za-bankzero', name: 'Bank Zero', branch: '888000' },
];

export const BANKS_BY_COUNTRY: Record<string, PayoutBank[]> = { NG: NG_BANKS, KE: KE_BANKS, ZA: ZA_BANKS };
export const KE_MOBILE: Record<string, string> = { MPESA: 'M-Pesa', AIRTEL: 'Airtel Money' };
