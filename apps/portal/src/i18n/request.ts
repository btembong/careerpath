import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  // Read locale from cookie; fall back to 'en'
  const cookieStore = await cookies();
  const locale = cookieStore.get('cpa_locale')?.value ?? 'en';
  const validLocales = ['en', 'fr'];
  const resolved = validLocales.includes(locale) ? locale : 'en';

  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
