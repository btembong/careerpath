import type { Metadata } from 'next';
import { PublicFooter, PublicHeader } from '@/components/public/PublicChrome';
import { CookieSettingsButton } from './CookieSettingsButton';

export const metadata: Metadata = {
  title: 'Cookies',
  description: 'The cookie and the few choices CareerPath Africa saves on your device, why, and how long they last. No ads, no tracking.',
};

const ROWS: [string, string, string, string][] = [
  ['cpa_token', 'Cookie', 'Keeps you signed in. Without it you’d have to sign in on every page.', 'Until you sign out, or 7 days'],
  ['cpa_consent', 'Cookie', 'Remembers your answer to the cookie notice, so we don’t ask again.', '1 year'],
  ['cpa_dark_mode, cpa_player_theme', 'Saved on your device', 'Your choice of dark mode and video player look.', 'Until you change it'],
  ['cpa:courses-country', 'Saved on your device', 'The country you picked on the course list, so it opens there next time.', 'Until you change it'],
  ['cpa_onboarded, cpa:pendingJoin, cpa_ref', 'Saved on your device', 'Small notes that make sign-up work: that you’ve seen the welcome, a school code or invite link you followed before signing up.', 'Until sign-up is done'],
  ['cpa_admin_trust', 'Saved on your device', 'For admins only: remembers this device after the two-step code, so you aren’t asked every time.', '30 days'],
];

/** What we store and why, in plain words */
export default function CookiesPage() {
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#3F6FE8]">Legal · November 2026</p>
          <h1 className="mt-1.5 text-[38px] font-extrabold leading-tight tracking-[-0.03em]">Cookies</h1>
          <p className="mt-2 max-w-[680px] text-[16px] leading-relaxed text-[#3A4A6B]">We use one cookie to keep you signed in and save a few choices on your device so the site remembers them. We don’t use advertising cookies, and we don’t track you across other websites.</p>
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead><tr>{['Name', 'Kind', 'What it’s for', 'How long'].map(h => <th key={h} className="border-b border-line px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
              <tbody>
                {ROWS.map(([n, k, w, h]) => (
                  <tr key={n}>
                    <td className="border-b border-line px-4 py-3 align-top font-mono text-[12.5px] text-navy">{n}</td>
                    <td className="border-b border-line px-4 py-3 align-top whitespace-nowrap text-ink2">{k}</td>
                    <td className="border-b border-line px-4 py-3 align-top text-ink2">{w}</td>
                    <td className="border-b border-line px-4 py-3 align-top whitespace-nowrap text-ink2">{h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 text-[15px] leading-relaxed text-[#3A4A6B]">
          <h2 className="text-[18px] font-extrabold text-navy">Your choice</h2>
          <p><b className="text-navy">Essential only</b> keeps the items above, because the site can’t work without them. <b className="text-navy">Accept all</b> also allows analytics that help us see which pages work well, if we add them later. Today nothing else changes. If we add analytics, we’ll list them here first.</p>
          <p>Services that run parts of the portal may set their own cookies when you use them: the payment page when you pay, and the video provider when you join a live class.</p>
          <div className="mt-1"><CookieSettingsButton /></div>
        </section>

        <p className="text-[14px] text-[#637090]">Questions? Write to <a href="mailto:support@careerpathafrica.com" className="font-bold text-[#2F57C9] hover:underline">support@careerpathafrica.com</a>. See also our <a href="/legal/privacy" className="font-bold text-[#2F57C9] hover:underline">Privacy Policy</a>.</p>
      </main>
      <PublicFooter />
    </div>
  );
}
