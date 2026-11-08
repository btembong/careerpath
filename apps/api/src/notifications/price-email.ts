import type { NoticeEmail } from './notifications.service';

/** The email a teacher gets when an admin decides on their proposed course price */
export function priceEmail(title: string, approved: boolean, price?: string): NoticeEmail {
  return approved
    ? {
      subject: `Price approved: "${title}"`, badge: 'Courses', title: 'Your price is approved',
      text: `"${title}" can now be bought on its own, as well as in its packages.`,
      details: price ? [['Price', price]] : undefined, cta: 'See the pricing',
    }
    : {
      subject: `Price not approved: "${title}"`, badge: 'Courses', title: 'Your price wasn’t approved',
      text: `the price you proposed for "${title}" wasn't approved, so it isn't sold on its own for now. It stays in its packages.`,
      cta: 'See the pricing', footnote: 'You can propose a different price from the same page.',
    };
}
