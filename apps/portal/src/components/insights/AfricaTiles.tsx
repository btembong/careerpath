'use client';
import { clsx } from 'clsx';

/** Africa as equal squares, each placed roughly where the country is: [code, name, column, row] */
export const AFRICA: [string, string, number, number][] = [
  ['MA', 'Morocco', 2, 0], ['DZ', 'Algeria', 3, 0], ['TN', 'Tunisia', 4, 0], ['LY', 'Libya', 5, 0], ['EG', 'Egypt', 6, 0],
  ['MR', 'Mauritania', 1, 1], ['ML', 'Mali', 2, 1], ['NE', 'Niger', 3, 1], ['TD', 'Chad', 4, 1], ['SD', 'Sudan', 5, 1], ['ER', 'Eritrea', 6, 1],
  ['SN', 'Senegal', 0, 2], ['GN', 'Guinea', 1, 2], ['BF', 'Burkina Faso', 2, 2], ['NG', 'Nigeria', 3, 2], ['CF', 'Central African Republic', 4, 2], ['SS', 'South Sudan', 5, 2], ['ET', 'Ethiopia', 6, 2], ['DJ', 'Djibouti', 7, 2],
  ['GM', 'The Gambia', 0, 1], ['SL', 'Sierra Leone', 0, 3], ['CI', 'Côte d’Ivoire', 1, 3], ['GH', 'Ghana', 2, 3], ['CM', 'Cameroon', 3, 3], ['CD', 'DR Congo', 4, 3], ['UG', 'Uganda', 5, 3], ['KE', 'Kenya', 6, 3], ['SO', 'Somalia', 7, 3],
  ['LR', 'Liberia', 0, 4], ['TG', 'Togo', 1, 4], ['BJ', 'Benin', 2, 4], ['GA', 'Gabon', 3, 4], ['CG', 'Congo', 4, 4], ['RW', 'Rwanda', 5, 4], ['TZ', 'Tanzania', 6, 4], ['BI', 'Burundi', 5, 5],
  ['GQ', 'Equatorial Guinea', 2, 5], ['AO', 'Angola', 3, 5], ['ZM', 'Zambia', 4, 5], ['MW', 'Malawi', 6, 5], ['MZ', 'Mozambique', 6, 6], ['MG', 'Madagascar', 7, 6],
  ['NA', 'Namibia', 3, 6], ['BW', 'Botswana', 4, 6], ['ZW', 'Zimbabwe', 5, 6], ['ZA', 'South Africa', 4, 7], ['LS', 'Lesotho', 3, 7], ['SZ', 'Eswatini', 5, 7],
];
export const RAMP = ['#DCE6FD', '#AFC6FA', '#7FA3F4', '#4F7EEA', '#2F57C9', '#1C3A93'];
/** Square-root steps so one big country doesn't wash out the rest */
export const shade = (v: number, max: number) => (v > 0 ? RAMP[Math.min(5, Math.floor(Math.sqrt(v / Math.max(1, max)) * 5.99))] : null);

export function AfricaTiles({ value, label, selected, onSelect }: { value: (code: string) => number; label: (code: string) => string; selected: string | null; onSelect: (code: string) => void }) {
  const max = Math.max(1, ...AFRICA.map(([c]) => value(c)));
  const S = 50, GX = 64, GY = 54;
  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width: 8 * GX + 16, height: 8 * GY + 8 }}>
        {AFRICA.map(([code, name, x, y]) => {
          const v = value(code), c = shade(v, max), dark = c ? RAMP.indexOf(c) >= 3 : false;
          return (
            <button key={code} type="button" onClick={() => onSelect(code)} title={`${name}: ${label(code)}`} aria-label={`${name}: ${label(code)}`} aria-pressed={selected === code}
              className={clsx('absolute rounded-md text-xs font-extrabold transition-shadow', !c && 'border border-[#D3DBEA] bg-subtle text-[#9AA6C2]', selected === code && 'ring-2 ring-navy ring-offset-2')}
              style={{ left: 8 + x * GX, top: y * GY, width: S, height: S, ...(c ? { background: c, color: dark ? '#FFFFFF' : '#072061' } : {}) }}>
              {code}
            </button>
          );
        })}
      </div>
    </div>
  );
}
