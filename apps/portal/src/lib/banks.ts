/**
 * Banks in Cameroon an earner can be paid into (the API keeps the same list). `code` is the first 5
 * digits of their RIB where we know it for sure; `logo` is a square tile in /brand/banks, otherwise
 * the bank shows as its initials in its colour.
 */
export interface Bank { id: string; name: string; short: string; code?: string; logo?: boolean; colour: string; main?: boolean; tile?: string }

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

export const bankById = (id?: string | null) => CM_BANKS.find(b => b.id === id) ?? null;
export const bankByName = (label?: string | null) => (label ? CM_BANKS.find(b => label.startsWith(b.name)) ?? null : null);

/** A CEMAC RIB: bank (5) + branch (5) + account (11) + key (2); key = 97 − ((89·bank + 15·branch + 3·account) mod 97) */
export function ribKey(bank: string, branch: string, account: string): string | null {
  if (!/^\d{5}$/.test(bank) || !/^\d{5}$/.test(branch) || !/^\d{11}$/.test(account)) return null;
  // Largest sum is about 3·10¹¹, well inside exact integer range
  const k = 97 - ((89 * Number(bank) + 15 * Number(branch) + 3 * Number(account)) % 97);
  return String(k).padStart(2, '0');
}
