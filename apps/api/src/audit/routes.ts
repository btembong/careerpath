import type { Area } from './audit.service';

/**
 * What a change made through a staff route means, for the Activity log. Keyed by "METHOD /path" with the route's
 * own pattern (no /api/v1). `{x}` in a sentence is the item's name; `target` says which item it is.
 * Routes that write a detailed entry themselves (with before and after) aren't needed here: when a request has
 * already been logged, the automatic entry is skipped.
 */
export interface RouteRule {
  area: Area;
  say: (x: { label: string; body: any; result: any }) => string;
  target?: { type: string; param?: string; fromResult?: boolean };
  /** Several saves in a row (editing lessons) become one entry per 15 minutes */
  dedupe?: boolean;
}

const q = (s: unknown) => (typeof s === 'string' && s.trim() ? `“${s.trim().slice(0, 80)}”` : '');
const n = (x: unknown) => (Array.isArray(x) ? x.length : 0);
const course = (param = 'id') => ({ type: 'PlatformCourse', param });
const content = (verb = 'Edited the content of'): RouteRule => ({ area: 'Courses', target: course(), dedupe: true, say: ({ label }) => `${verb} ${label}` });

export const ROUTE_RULES: Record<string, RouteRule> = {
  // ── Selling ──
  'POST /admin/packages': { area: 'Selling', target: { type: 'Package', fromResult: true }, say: ({ label }) => `Created the package ${label}` },
  'PATCH /admin/packages/:id': { area: 'Selling', target: { type: 'Package', param: 'id' }, say: ({ label, body }) => body?.isPublished === true ? `Published the package ${label}` : body?.isPublished === false ? `Unpublished the package ${label}` : `Edited the package ${label}` },
  'POST /admin/coupons': { area: 'Selling', target: { type: 'Coupon', fromResult: true }, say: ({ label }) => `Created the coupon ${label}` },
  'PATCH /admin/coupons/:id': { area: 'Selling', target: { type: 'Coupon', param: 'id' }, say: ({ label, body }) => body?.isActive === false ? `Turned off the coupon ${label}` : body?.isActive === true ? `Turned on the coupon ${label}` : `Edited the coupon ${label}` },
  'PUT /payments/admin/add-ons/:kind/:id': { area: 'Selling', say: ({ body }) => `Changed add-on prices${body?.price != null ? '' : ''}` },
  'POST /org/admin/organisations': { area: 'Selling', say: ({ body }) => `Added the school ${q(body?.name)}` },
  'POST /org/admin/organisations/:id/packages': { area: 'Selling', say: () => 'Gave a school a package' },
  'POST /org/admin/org-enrollments': { area: 'Selling', say: () => 'Enrolled a school' },
  'POST /org/admin/org-enrollments/:id/seats': { area: 'Selling', say: () => 'Changed a school’s seats' },

  // ── People ──
  'PATCH /portals/admin/teachers/:id/suspend': { area: 'People', target: { type: 'UserProfile', param: 'id' }, say: ({ label, body }) => body?.suspend === false ? `Restored ${label}’s account` : `Suspended ${label}` },
  'POST /account/admin/deletions/:id': { area: 'People', target: { type: 'UserProfile', param: 'id' }, say: ({ label }) => `Finished deleting the account of ${label}` },
  'POST /portals/admin/sync/wp-users': { area: 'People', say: () => 'Pulled people from careerpathafrica.com' },
  'PATCH /teachers/admin/:id/video': { area: 'People', target: { type: 'UserProfile', param: 'id' }, say: ({ label, body }) => `${body?.status === 'REJECTED' || body?.approved === false ? 'Sent back' : 'Approved'} ${label}’s intro video` },
  'POST /portals/admin/cohorts': { area: 'People', say: ({ body }) => `Created the cohort ${q(body?.name)}` },
  'PATCH /portals/admin/cohorts/:id': { area: 'People', target: { type: 'Cohort', param: 'id' }, say: ({ label }) => `Edited the cohort ${label}` },
  'POST /portals/admin/cohorts/:id/students': { area: 'People', target: { type: 'Cohort', param: 'id' }, say: ({ label, body }) => `Added ${n(body?.studentIds) || 'a'} student${n(body?.studentIds) > 1 ? 's' : ''} to ${label}` },
  'DELETE /portals/admin/cohorts/:id/students/:studentId': { area: 'People', target: { type: 'Cohort', param: 'id' }, say: ({ label }) => `Removed a student from ${label}` },
  'POST /live/cohorts': { area: 'People', say: ({ body }) => `Created the cohort ${q(body?.name)}` },
  'POST /live/cohorts/:cohortId/classes': { area: 'People', target: { type: 'Cohort', param: 'cohortId' }, say: ({ label, body }) => `Scheduled the live class ${q(body?.title)} for ${label}` },
  'POST /live/cohorts/:cohortId/classes/series': { area: 'People', target: { type: 'Cohort', param: 'cohortId' }, say: ({ label }) => `Scheduled a series of live classes for ${label}` },
  'POST /live/cohorts/:cohortId/students': { area: 'People', target: { type: 'Cohort', param: 'cohortId' }, say: ({ label }) => `Added students to ${label}` },
  'DELETE /live/cohorts/:cohortId/students/:studentId': { area: 'People', target: { type: 'Cohort', param: 'cohortId' }, say: ({ label }) => `Removed a student from ${label}` },
  'POST /certificates/admin/issue': { area: 'People', say: () => 'Issued a certificate' },
  'DELETE /certificates/admin/:id': { area: 'People', say: () => 'Revoked a certificate' },
  'PATCH /support/admin/tickets/:id': { area: 'People', say: ({ body }) => body?.reply ? 'Answered a support ticket' : 'Updated a support ticket' },
  'PATCH /mentorship/admin/bookings/:bookingId/cancel': { area: 'People', say: () => 'Cancelled a mentoring session' },
  'DELETE /community/admin/discussions/:id': { area: 'People', say: () => 'Removed a community post' },
  'PATCH /community/admin/success-stories/:id': { area: 'People', say: () => 'Edited a success story' },
  'POST /org/school/invite': { area: 'People', say: ({ body }) => `Invited ${n(body?.emails) || 'a'} student${n(body?.emails) > 1 ? 's' : ''} to the school` },
  'POST /org/school/seats/:id/remind': { area: 'People', say: () => 'Reminded a student to join the school' },
  'DELETE /org/school/seats/:id': { area: 'People', say: () => 'Removed a student from the school' },
  'PATCH /org/school/settings': { area: 'Settings', say: () => 'Changed the school’s settings' },

  // ── Courses ──
  'POST /platform-courses/:id/publish': { area: 'Courses', target: course(), say: ({ label }) => `Published ${label}` },
  'POST /platform-courses/:id/reject': { area: 'Courses', target: course(), say: ({ label, body }) => `Sent ${label} back${body?.reason ? `: ${q(body.reason)}` : ''}` },
  'POST /platform-courses/:id/archive': { area: 'Courses', target: course(), say: ({ label }) => `Archived ${label}` },
  'PATCH /reviewer/courses/:courseId/review': { area: 'Courses', target: course('courseId'), say: ({ label, body }) => `${/approve/i.test(String(body?.decision ?? body?.status ?? '')) ? 'Approved' : 'Reviewed'} ${label}` },
  'POST /admin/courses/:courseId/assign': { area: 'Courses', target: course('courseId'), say: ({ label }) => `Assigned a teacher to ${label}` },
  'PATCH /platform-courses/bulk-assign': { area: 'Courses', say: ({ body }) => `Assigned a teacher to ${n(body?.courseIds)} courses` },
  'PATCH /platform-courses/bulk-price': { area: 'Courses', say: ({ body }) => `Changed the price of ${n(body?.courseIds)} courses` },
  'POST /platform-courses/:id/price-proposal/decision': { area: 'Courses', target: course(), say: ({ label, body }) => `${body?.approve === false || body?.decision === 'reject' ? 'Turned down' : 'Approved'} the price proposed for ${label}` },
  'PATCH /platform-courses/:id/commission': { area: 'Money', target: course(), say: ({ label }) => `Changed the teacher’s share on ${label}` },
  'POST /admin/wp-pull/apply': { area: 'Courses', say: ({ result }) => `Applied changes from careerpathafrica.com${result?.created != null ? `: ${result.created} new, ${result.updated ?? 0} changed, ${(result.hidden ?? 0) + (result.archived ?? 0)} gone` : ''}` },
  'PATCH /admin/wp-pull/settings': { area: 'Settings', say: () => 'Changed the WordPress pull settings' },
  'PUT /admin/wp-pull/categories/:termId': { area: 'Courses', say: () => 'Matched a WordPress category to an exam and subject' },
  'POST /admin/tutor-import/queue': { area: 'Courses', say: ({ body }) => `Queued ${n(body?.courseIds) || 'a'} course${n(body?.courseIds) > 1 ? 's' : ''} for import from Tutor LMS` },
  'POST /admin/tutor-import/cancel': { area: 'Courses', say: () => 'Cancelled an import from Tutor LMS' },
  'POST /platform-courses/:id/modules': content(),
  'PATCH /platform-courses/:id/modules/:moduleId': content(),
  'DELETE /platform-courses/:id/modules/:moduleId': content(),
  'POST /platform-courses/:id/modules/reorder': content(),
  'POST /platform-courses/:id/modules/:moduleId/lessons': content(),
  'PATCH /platform-courses/:id/modules/:moduleId/lessons/:lessonId': content(),
  'DELETE /platform-courses/:id/modules/:moduleId/lessons/:lessonId': content(),
  'POST /platform-courses/:id/modules/:moduleId/lessons/reorder': content(),
  'POST /platform-courses/:id/modules/:moduleId/lessons/:lessonId/attachments': content(),
  'POST /platform-courses/:id/lessons/:lessonId/questions': content(),
  'PATCH /platform-courses/:id/lessons/:lessonId/questions/:questionId': content(),
  'DELETE /platform-courses/:id/lessons/:lessonId/questions/:questionId': content(),
  'PATCH /platform-courses/:id/lessons/:lessonId/quiz-config': content(),
  'POST /platform-courses/:id/apply-template': content('Applied a template to'),
  'DELETE /platform-courses/attachments/:attachmentId': { area: 'Courses', dedupe: true, say: () => 'Removed a lesson attachment' },
  'POST /quiz/questions': { area: 'Courses', dedupe: true, say: () => 'Added questions' },
  'PATCH /quiz/questions/:id': { area: 'Courses', dedupe: true, say: () => 'Edited questions' },
  'DELETE /quiz/questions/:id': { area: 'Courses', dedupe: true, say: () => 'Deleted a question' },

  // ── Money ──
  'POST /payouts/admin/payouts/generate': { area: 'Money', say: () => 'Worked out this month’s payouts' },
  'POST /payouts/admin/payouts/month': { area: 'Money', say: () => 'Worked out a month’s payouts' },
  'POST /payouts/admin/payouts/remind': { area: 'Money', say: () => 'Reminded people to add a payout account' },
  'PATCH /payouts/admin/payouts/:id/mark-paid': { area: 'Money', say: () => 'Marked a payout as paid' },
  'POST /admin/settlements/withdrawals/:id/approve': { area: 'Money', say: () => 'Approved a withdrawal' },
  'POST /admin/settlements/withdrawals/:id/paid': { area: 'Money', say: () => 'Marked a withdrawal as paid' },
  'POST /admin/settlements/withdrawals/:id/reject': { area: 'Money', say: ({ body }) => `Turned down a withdrawal${body?.reason ? `: ${q(body.reason)}` : ''}` },
  'POST /admin/settlements/withdrawals/:id/refresh': { area: 'Money', dedupe: true, say: () => 'Checked a withdrawal with Tranzak' },
  'POST /admin/settlements/topup': { area: 'Money', say: () => 'Topped up the payout account' },
  'POST /admin/settlements/code': { area: 'Sign-in', say: () => 'Asked for a code to approve payouts' },
  'PATCH /admin/settlements/rules': { area: 'Money', say: () => 'Changed the withdrawal rules' },
  'POST /admin/payments/:id/check': { area: 'Money', dedupe: true, say: () => 'Checked a payment with the payment provider' },
  'POST /admin/payments/check-all': { area: 'Money', dedupe: true, say: () => 'Checked all pending payments' },
  'POST /payout-accounts/admin/:id/verify': { area: 'Money', say: () => 'Verified a payout account' },

  // ── Settings ──
  'PATCH /platform-courses/price-defaults': { area: 'Settings', say: () => 'Changed the default course prices' },
  'POST /platform-courses/price-defaults/apply': { area: 'Settings', say: () => 'Applied the default prices to courses' },
  'PATCH /platform-courses/pricing-settings': { area: 'Settings', say: () => 'Changed the pricing settings' },
  'POST /platform-courses/pricing-settings/apply-commission': { area: 'Money', say: () => 'Applied the default teacher share to courses' },
  'POST /countries/admin/countries': { area: 'Settings', say: ({ body }) => `Added the country ${q(body?.name)}` },
  'PATCH /countries/admin/countries/:id': { area: 'Settings', target: { type: 'Country', param: 'id' }, say: ({ label }) => `Edited the country ${label}` },
  'POST /notifications/admin/broadcasts': { area: 'Settings', say: ({ body }) => `Sent the announcement ${q(body?.title)} to ${String(body?.audience ?? 'ALL').toLowerCase().replace('_', ' ')}` },
  'PUT /onboarding-video/admin': { area: 'Settings', say: () => 'Changed the onboarding video' },
  'POST /reports/admin/reports/exchange-rates': { area: 'Settings', say: () => 'Updated the exchange rates' },
  'PATCH /errors/admin/:id': { area: 'Settings', dedupe: true, say: () => 'Marked an error as handled' },
  'POST /admin/taxonomy/programmes': { area: 'Settings', say: ({ body }) => `Added the exam ${q(body?.name)}` },
  'PATCH /admin/taxonomy/programmes/:id': { area: 'Settings', say: () => 'Edited an exam' },
  'POST /admin/taxonomy/subjects': { area: 'Settings', say: ({ body }) => `Added the subject ${q(body?.name)}` },
  'PATCH /admin/taxonomy/subjects/:id': { area: 'Settings', say: () => 'Edited a subject' },
  'DELETE /admin/taxonomy/subjects/:id': { area: 'Settings', say: () => 'Deleted a subject' },
  'POST /admin/taxonomy/subjects/:id/merge': { area: 'Settings', say: () => 'Merged two subjects' },
  'POST /admin/taxonomy/systems': { area: 'Settings', say: ({ body }) => `Added the exam system ${q(body?.name)}` },
  'PATCH /admin/taxonomy/systems/:id': { area: 'Settings', say: () => 'Edited an exam system' },
  'POST /admin/taxonomy/systems/:id/levels': { area: 'Settings', say: ({ body }) => `Added the level ${q(body?.name)}` },
  'PATCH /admin/taxonomy/levels/:id': { area: 'Settings', say: () => 'Edited a level' },
  'DELETE /admin/taxonomy/levels/:id': { area: 'Settings', say: () => 'Deleted a level' },
  'PUT /admin/taxonomy/systems/:id/levels/order': { area: 'Settings', say: () => 'Reordered levels' },
};

/** Staff routes that aren't changes worth logging: their own learning, messages, preferences, reading */
export const SKIP = [
  /^\/auth\//, /^\/messages/, /^\/notifications\/(?!admin)/, /^\/files\//, /^\/calls/, /^\/ai\//, /^\/presence/,
  /\/progress\//, /\/quiz\/submit$/, /\/practice\/submit$/, /\/discussions$/, /\/enroll$/, /^\/flashcards/, /^\/rubrics\/peer/,
  /^\/teachers\/:id\/reviews$/, /^\/mentorship\/bookings\/:bookingId\/review$/, /^\/org\/join/, /claim-mine$/, /^\/push/,
  /^\/payout-accounts\/me/, /^\/notes/, /^\/study/, /^\/tests?\//, /^\/test-centre/, /\/watch$/,
];

/** The area for a staff route that isn't in the map */
export function areaOfPath(path: string): Area {
  if (/payout|settlement|wallet|payment|commission|refund/.test(path)) return 'Money';
  if (/package|coupon|org\//.test(path)) return 'Selling';
  if (/course|lesson|module|question|quiz|mock|wp-pull|tutor-import|classify/.test(path)) return 'Courses';
  if (/user|teacher|people|cohort|account|certificate|support|mentorship|community/.test(path)) return 'People';
  return 'Settings';
}
