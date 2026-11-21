/**
 * Banks in Cameroon an earner can be paid into (the API keeps the same list). `code` is the first 5
 * digits of their RIB where we know it for sure; `logo` is a square tile in /brand/banks, otherwise
 * the bank shows as its initials in its colour.
 */
export interface Bank { id: string; name: string; short: string; code?: string; logo?: boolean; colour: string; main?: boolean; tile?: string; /** The logo file, when it isn't named after the id */ file?: string }

export const CM_BANKS: Bank[] = [
  { id: 'afriland', name: 'Afriland First Bank', short: 'AFB', code: '10005', logo: true, colour: '#E30613', main: true },
  { id: 'gbc', name: 'General Bank of Cameroon', short: 'GBC', colour: '#E9041E', main: true, tile: 'General Bank (ex-Société Générale)' },
  { id: 'afg', name: 'AFG Bank Cameroun', short: 'AFG', logo: true, colour: '#00A651', main: true },
  { id: 'cca', name: 'CCA-Bank', short: 'CCA', logo: true, colour: '#7B4FA0', main: true },
  { id: 'scb', name: 'SCB Cameroun', short: 'SCB', code: '10002', colour: '#C8102E', main: true },
  { id: 'bicec', name: 'BICEC', short: 'BICEC', code: '10001', logo: true, colour: '#E87722', main: true },
  { id: 'ecobank', name: 'Ecobank Cameroun', short: 'ECO', logo: true, colour: '#005B82', main: true },
  { id: 'uba', name: 'UBA Cameroon', short: 'UBA', logo: true, colour: '#E30613', main: true },
  { id: 'access', name: 'Access Bank Cameroon', short: 'ACC', logo: true, colour: '#F37021', main: true },
  { id: 'bgfi', name: 'BGFIBank Cameroun', short: 'BGFI', logo: true, colour: '#0A3D62', main: true },
  { id: 'cbc', name: 'Commercial Bank Cameroon (CBC)', short: 'CBC', colour: '#003B71' },
  { id: 'ubc', name: 'Union Bank of Cameroon (UBC)', short: 'UBC', colour: '#00703C' },
  { id: 'stanchart', name: 'Standard Chartered Cameroon', short: 'SC', logo: true, colour: '#0072AA' },
  { id: 'citi', name: 'Citibank Cameroon', short: 'CITI', colour: '#003B70' },
  { id: 'nfc', name: 'NFC Bank', short: 'NFC', colour: '#1B4F9C' },
  { id: 'bcpme', name: 'BC-PME', short: 'PME', colour: '#00843D' },
  { id: 'regionale', name: 'La Régionale Bank', short: 'LRB', colour: '#B5121B' },
  { id: 'bange', name: 'BANGE Bank Cameroun', short: 'BGE', colour: '#006837' },
  { id: 'agb', name: 'Africa Golden Bank', short: 'AGB', colour: '#B8860B' },
];

/** Nigeria: banks and wallets paid by NUBAN (10 digits); code = the CBN sort code. The API keeps the same list. */
export const NG_BANKS: Bank[] = [
  { id: 'ng-gtbank', name: 'GTBank', short: 'GT', code: '058', logo: true, colour: '#E2591F', main: true },
  { id: 'ng-access', name: 'Access Bank', short: 'ACC', code: '044', logo: true, colour: '#F37021', main: true },
  { id: 'ng-zenith', name: 'Zenith Bank', short: 'ZB', code: '057', logo: true, colour: '#D71920', main: true },
  { id: 'ng-firstbank', name: 'First Bank', short: 'FBN', code: '011', logo: true, colour: '#003B71', main: true },
  { id: 'ng-uba', name: 'UBA', short: 'UBA', code: '033', logo: true, colour: '#D42E12', main: true },
  { id: 'ng-opay', name: 'OPay', short: 'OP', logo: true, colour: '#1DCF9F', main: true },
  { id: 'ng-moniepoint', name: 'Moniepoint', short: 'MP', logo: true, colour: '#0357EE', main: true },
  { id: 'ng-palmpay', name: 'PalmPay', short: 'PP', logo: true, colour: '#7B2CF5', main: true },
  { id: 'ng-kuda', name: 'Kuda', short: 'K', logo: true, colour: '#40196D', main: true },
  { id: 'ng-fidelity', name: 'Fidelity Bank', short: 'FID', code: '070', colour: '#002D72', main: true },
  { id: 'ng-fcmb', name: 'FCMB', short: 'FCMB', code: '214', logo: true, colour: '#5C2D91' },
  { id: 'ng-stanbic', name: 'Stanbic IBTC', short: 'SIB', code: '221', logo: true, colour: '#0033A1' },
  { id: 'ng-sterling', name: 'Sterling Bank', short: 'STR', code: '232', logo: true, colour: '#DB353A' },
  { id: 'ng-union', name: 'Union Bank', short: 'UB', code: '032', logo: true, colour: '#00AEEF' },
  { id: 'ng-wema', name: 'Wema Bank (ALAT)', short: 'WEM', code: '035', logo: true, colour: '#990D81' },
  { id: 'ng-ecobank', name: 'Ecobank Nigeria', short: 'ECO', code: '050', logo: true, colour: '#005B82' },
  { id: 'ng-polaris', name: 'Polaris Bank', short: 'PB', code: '076', logo: true, colour: '#5C2D91' },
  { id: 'ng-keystone', name: 'Keystone Bank', short: 'KS', code: '082', logo: true, colour: '#0B2A63' },
];
/** Kenya: bank accounts (M-Pesa and Airtel Money are separate, below) */
export const KE_BANKS: Bank[] = [
  { id: 'ke-equity', name: 'Equity Bank', short: 'EQ', colour: '#A32A29', main: true },
  { id: 'ke-kcb', name: 'KCB', short: 'KCB', logo: true, colour: '#00753B', main: true },
  { id: 'ke-coop', name: 'Co-operative Bank', short: 'COOP', logo: true, colour: '#00573F', main: true },
  { id: 'ke-ncba', name: 'NCBA', short: 'NCBA', logo: true, colour: '#1A1A1A', main: true },
  { id: 'ke-absa', name: 'Absa Kenya', short: 'A', logo: true, colour: '#DC0032', main: true },
  { id: 'ke-stanbic', name: 'Stanbic Bank Kenya', short: 'SB', logo: true, colour: '#0033A1' },
  { id: 'ke-stanchart', name: 'Standard Chartered Kenya', short: 'SC', logo: true, colour: '#0072AA' },
  { id: 'ke-im', name: 'I&M Bank', short: 'I&M', logo: true, colour: '#1F3C88' },
  { id: 'ke-dtb', name: 'Diamond Trust Bank (DTB)', short: 'DTB', colour: '#E4002B' },
  { id: 'ke-family', name: 'Family Bank', short: 'FB', logo: true, colour: '#1E4E9C' },
];
/** Kenya's mobile money */
export const KE_MOBILE: Bank[] = [
  { id: 'MPESA', name: 'M-Pesa', short: 'M-PESA', colour: '#3EA343', main: true },
  { id: 'AIRTEL', name: 'Airtel Money', short: 'AM', logo: true, file: 'ke-airtel', colour: '#E40000', main: true },
];
/** South Africa: branch = the bank's universal branch code */
export const ZA_BANKS: (Bank & { branch: string })[] = [
  { id: 'za-capitec', name: 'Capitec', short: 'CAP', branch: '470010', logo: true, colour: '#1A1A1A', main: true },
  { id: 'za-fnb', name: 'FNB', short: 'FNB', branch: '250655', logo: true, colour: '#00A3AD', main: true },
  { id: 'za-standard', name: 'Standard Bank', short: 'SB', branch: '051001', logo: true, colour: '#0033A1', main: true },
  { id: 'za-absa', name: 'Absa', short: 'A', branch: '632005', logo: true, colour: '#DC0032', main: true },
  { id: 'za-nedbank', name: 'Nedbank', short: 'NED', branch: '198765', logo: true, colour: '#006341', main: true },
  { id: 'za-tyme', name: 'TymeBank', short: 'TY', branch: '678910', logo: true, colour: '#00B5E2', main: true },
  { id: 'za-discovery', name: 'Discovery Bank', short: 'DB', branch: '679000', logo: true, colour: '#B48B5B', main: true },
  { id: 'za-african', name: 'African Bank', short: 'AB', branch: '430000', logo: true, colour: '#00A0DF', main: true },
  { id: 'za-investec', name: 'Investec', short: 'INV', branch: '580105', logo: true, colour: '#1A1A1A', main: true },
  { id: 'za-bankzero', name: 'Bank Zero', short: 'B0', branch: '888000', logo: true, colour: '#1A1A1A', main: true },
];
/** The bank lists by country; Kenya's mobile money is listed separately */
export const BANKS_BY_COUNTRY: Record<string, Bank[]> = { NG: NG_BANKS, KE: KE_BANKS, ZA: ZA_BANKS };
const ALL_BANKS: Bank[] = [...CM_BANKS, ...NG_BANKS, ...KE_BANKS, ...KE_MOBILE, ...ZA_BANKS];

export const bankById = (id?: string | null) => ALL_BANKS.find(b => b.id === id) ?? null;
export const bankByName = (label?: string | null) => (label ? ALL_BANKS.find(b => label.startsWith(b.name)) ?? null : null);

/** A CEMAC RIB: bank (5) + branch (5) + account (11) + key (2); key = 97 − ((89·bank + 15·branch + 3·account) mod 97) */
export function ribKey(bank: string, branch: string, account: string): string | null {
  if (!/^\d{5}$/.test(bank) || !/^\d{5}$/.test(branch) || !/^\d{11}$/.test(account)) return null;
  // Largest sum is about 3·10¹¹, well inside exact integer range
  const k = 97 - ((89 * Number(bank) + 15 * Number(branch) + 3 * Number(account)) % 97);
  return String(k).padStart(2, '0');
}
