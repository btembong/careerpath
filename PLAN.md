# PLAN.md — School Portal Modernization

## 1. Project Summary

The client's existing platform is **CareerPath Africa** (careerpathafrica.com)
— a live WordPress site with a full course catalog already in place: Secondary
school, High school, University, Professional Licensure Exams, Career &
Mentorship, CPD, Language Proficiency, and International Exams. It already has
student registration, tutor/instructor registration, login, and instructor
profile pages — this is a working LMS, not just a bare onboarding flow, so the
scope here is adding real portal *functionality* on top of a catalog that
already exists, not building content structure from nothing.

This project adds three role-gated portal experiences — **Student**,
**Teacher**, **Admin** — inside a single Next.js application (one codebase,
one deployment; see §2), with live classes, paid packages,
quizzes/assignments, and a shared whiteboard, **without** migrating or
rebuilding the existing WordPress content.

**Non-goal:** rebuilding the public marketing site. `careerpathafrica.com`
(WordPress) stays exactly as it is; only its "log in / start learning" links
are repointed to the new portal.

**To confirm with the client (see §8):** which plugin currently powers course
delivery and registration (the URL patterns — `/courses/.../lessons/...`,
`/profile/name?view=instructor` — suggest a course plugin paired with
BuddyPress/BuddyBoss for profiles, but this needs wp-admin access to confirm
rather than guessing from the outside). This determines exactly how NestJS
reads course and role data from the WordPress REST API.

## 2. Architecture

```
careerpathafrica.com (WordPress, unchanged)          portal.careerpathafrica.com (Next.js)
   │  public site + wp-admin content              │
   └──────────────┬───────────────────────────────┘
                   │ both read/write the same WP data
                   ▼
        ┌─────────────────────────────┐
        │      NestJS API Gateway     │  ← auth, RBAC, gating, webhooks
        └─────────┬─────────┬─────────┘
                   │         │         │
                   ▼         ▼         ▼
             WordPress   Daily.co   Payment Gateway
             REST API   (live video) (checkout + webhook)
```

**Roles:**
- **WordPress** — content warehouse only (courses, lessons, user profiles/meta). Non-technical staff keep editing it directly.
- **NestJS** — the only thing that talks to WordPress, Daily.co, and the payment gateway. Owns its own Postgres DB for everything relational that WordPress can't model cleanly (cohorts, live sessions, assignments, quizzes, grading). Re-checks the JWT's role claim on every request — this is the real access-control boundary, not the frontend.
- **Next.js** — one codebase, one deployment, role-scoped routes rendered based on the JWT's role claim. Not five separate apps — hiding a route in the UI is convenience, not security. Five roles now share this app: `/student/*`, `/teacher/*`, `/admin/*` are full experiences; `/admin/country/*` and `/admin/reviews/*` give the Country Rep and Subject Reviewer roles scoped slices of the Admin route group rather than two more full portals (see §8).

## 3. Domains

| Domain | Purpose | Owner |
|---|---|---|
| `careerpathafrica.com` | Marketing + public onboarding (as-is) | WordPress |
| `portal.careerpathafrica.com` | Student / Teacher / Admin app | Next.js + NestJS |

Same underlying WordPress user/content data powers both — a user registered
on the marketing site already exists when they log into the portal.

## 4. Tech Stack

- **Backend:** NestJS, Prisma ORM, PostgreSQL
- **Frontend:** Next.js (React), Tailwind CSS, installable as a PWA for low-bandwidth resilience
- **File storage:** Cloudflare R2 (or S3-compatible) — teacher application documents and assignment submissions
- **Video:** Daily.co (WebRTC), token-gated per role
- **Whiteboard:** Excalidraw, synced via Daily.co data channels
- **Payments:** *(open decision — see §8)*
- **Currency normalization:** admin-maintained `ExchangeRate` table, USD as the reporting base currency (see §7)
- **Content source:** existing WordPress REST API

## 5. Database Schema (Prisma)

```prisma
enum UserRole { ADMIN TEACHER STUDENT COUNTRY_REP SUBJECT_REVIEWER }
enum ApprovalStatus { PENDING APPROVED REJECTED }
enum ClassStatus { SCHEDULED ACTIVE COMPLETED }
enum QuestionType { MCQ WRITTEN }
enum SubmissionStatus { PENDING_REVIEW GRADED }

model UserProfile {
  id             String   @id @default(uuid())
  wpUserId       Int      @unique
  email          String   @unique
  role           UserRole @default(STUDENT)
  approvalStatus ApprovalStatus @default(APPROVED)
  countryId      String?          // student: for revenue attribution; country rep: which country they run
  purchases      PackagePurchase[]
  cohorts        CohortRoster[]
  submissions    Submission[]
  quizAttempts   QuizAttempt[]
  teacherApplication TeacherApplication?
  wallet         Wallet?
  country        Country? @relation(fields: [countryId], references: [id])
}

model Country {
  id                   String   @id @default(uuid())
  code                 String   @unique   // "NG", "CM", "GH", "ZA"
  name                 String
  currency             String            // "NGN", "XAF", "GHS", "ZAR"
  repCommissionPercent Float?            // % of in-country revenue paid to the rep
  perStudentBonus      Int?              // flat bonus per active student, minor units of `currency`
  reps                 UserProfile[]
}

model ExchangeRate {
  id        String   @id @default(uuid())
  currency  String   @unique             // "NGN", "XAF", "GHS", "ZAR", etc.
  toUsdRate Float                        // 1 unit of currency = this many USD; admin-updated periodically
  updatedAt DateTime @updatedAt
}

model Package {
  id           String   @id @default(uuid())
  name         String
  description  String?
  priceAmount  Int              // minor currency unit (e.g. cents, centimes)
  currency     String           // "XAF", "USD", etc.
  courseIds    String[]         // specific WordPress course/post IDs, and/or
  categoryTags String[]         // whole categories (e.g. "secondary-school", "cpd")
  validityDays Int?             // null = lifetime access once purchased
  isPublished  Boolean  @default(false)
  createdAt    DateTime @default(now())
  purchases    PackagePurchase[]
}

model PackagePurchase {
  id          String   @id @default(uuid())
  studentId   String
  packageId   String
  couponId    String?
  purchasedAt DateTime @default(now())
  expiresAt   DateTime?        // null = never expires
  student     UserProfile @relation(fields: [studentId], references: [id])
  package     Package     @relation(fields: [packageId], references: [id])
}

model TeacherApplication {
  id              String   @id @default(uuid())
  userId          String   @unique
  subjectAreas    String[]
  yearsExperience Int?
  bio             String
  documentUrl     String?
  submittedAt     DateTime @default(now())
  user            UserProfile @relation(fields: [userId], references: [id])
}

model Cohort {
  id          String   @id @default(uuid())
  name        String
  teacherId   String
  students    CohortRoster[]
  liveClasses LiveClass[]
  assignments Assignment[]
}

model CohortRoster {
  id        String @id @default(uuid())
  studentId String
  cohortId  String
  student   UserProfile @relation(fields: [studentId], references: [id])
  cohort    Cohort      @relation(fields: [cohortId], references: [id])
  @@unique([studentId, cohortId])
}

model LiveClass {
  id           String      @id @default(uuid())
  cohortId     String
  title        String
  dailyRoomUrl String
  scheduledAt  DateTime
  status       ClassStatus @default(SCHEDULED)
  cohort       Cohort      @relation(fields: [cohortId], references: [id])
}

model Assignment {
  id          String   @id @default(uuid())
  cohortId    String
  title       String
  description String
  maxPoints   Int
  dueDate     DateTime
  cohort      Cohort   @relation(fields: [cohortId], references: [id])
  submissions Submission[]
}

model Submission {
  id           String            @id @default(uuid())
  assignmentId String
  studentId    String
  fileUrl      String?
  grade        Int?
  feedback     String?
  status       SubmissionStatus  @default(PENDING_REVIEW)
  submittedAt  DateTime          @default(now())
  assignment   Assignment @relation(fields: [assignmentId], references: [id])
  student      UserProfile @relation(fields: [studentId], references: [id])
}

model QuestionBank {
  id            String       @id @default(uuid())
  courseId      String
  questionText  String
  type          QuestionType
  options       Json?
  correctAnswer String
}

model QuizAttempt {
  id            String   @id @default(uuid())
  studentId     String
  courseId      String
  autoScore     Int
  manualScore   Int      @default(0)
  finalScore    Int      @default(0)
  isFullyGraded Boolean  @default(false)
  answersJson   Json
  submittedAt   DateTime @default(now())
  student       UserProfile @relation(fields: [studentId], references: [id])
}

// --- Extended features (Phase 5, see §9) ---

enum PayoutStatus { PENDING PAID }
enum ReviewStatus { PENDING APPROVED REJECTED }
enum WalletTxType { CREDIT DEBIT }
enum WalletTxSource { COURSE_SALE COUNTRY_BONUS REVIEW_COMMISSION PAYOUT ADJUSTMENT }
enum PayoutRecipientType { TEACHER SUBJECT_REVIEWER COUNTRY_REP }

model CourseAssignment {
  id                    String   @id @default(uuid())
  courseId              String   @unique          // WordPress course/post ID — the real revenue unit
  teacherId             String?
  teacherCommissionPct  Float?                     // null = teacher paid outside the platform
  reviewerId            String?
  reviewerCommissionPct Float?                     // null = reviewer paid outside the platform
  reviewStatus          ReviewStatus @default(PENDING)
  reviewedAt            DateTime?
  reviewNotes           String?
  updatedAt             DateTime @updatedAt
}

model Wallet {
  id           String   @id @default(uuid())
  userId       String   @unique
  balance      Int      @default(0)      // minor currency unit, running total awaiting payout
  currency     String
  updatedAt    DateTime @updatedAt
  user         UserProfile @relation(fields: [userId], references: [id])
  transactions WalletTransaction[]
}

model WalletTransaction {
  id                String         @id @default(uuid())
  walletId          String
  type              WalletTxType
  source            WalletTxSource
  amount            Int                    // minor currency unit
  currency          String
  packagePurchaseId String?                // the sale this credit came from, when relevant
  courseId          String?                // which course generated it, when relevant
  description       String?
  createdAt         DateTime @default(now())
  wallet            Wallet @relation(fields: [walletId], references: [id])
}

model Certificate {
  id         String   @id @default(uuid())
  studentId  String
  courseId   String
  issuedAt   DateTime @default(now())
  verifyCode String   @unique   // public code used at /verify/:verifyCode
  pdfUrl     String
  student    UserProfile @relation(fields: [studentId], references: [id])
}

model MentorSlot {
  id        String   @id @default(uuid())
  teacherId String
  startsAt  DateTime
  endsAt    DateTime
  isBooked  Boolean  @default(false)
  booking   MentorBooking?
}

model MentorBooking {
  id        String   @id @default(uuid())
  slotId    String   @unique
  studentId String
  notes     String?
  bookedAt  DateTime @default(now())
  slot      MentorSlot @relation(fields: [slotId], references: [id])
}

model Coupon {
  id             String    @id @default(uuid())
  code           String    @unique
  percentOff     Int?
  amountOff      Int?             // alternative to percentOff, minor currency unit
  packageId      String?          // null = valid on any package
  maxRedemptions Int?
  redeemedCount  Int       @default(0)
  expiresAt      DateTime?
  isActive       Boolean   @default(true)
}

model OrgEnrollment {
  id               String   @id @default(uuid())
  organizationName String
  contactEmail     String
  packageId        String
  seatsPurchased   Int
  purchasedAt      DateTime @default(now())
  seats            OrgSeat[]
}

model OrgSeat {
  id              String    @id @default(uuid())
  orgEnrollmentId String
  inviteEmail     String
  studentId       String?          // filled once the invite is claimed
  claimedAt       DateTime?
  orgEnrollment   OrgEnrollment @relation(fields: [orgEnrollmentId], references: [id])
}

model PayoutStatement {
  id            String              @id @default(uuid())
  recipientId   String
  recipientType PayoutRecipientType
  periodStart   DateTime
  periodEnd     DateTime
  amount        Int
  currency      String
  status        PayoutStatus @default(PENDING)
  generatedAt   DateTime     @default(now())
}

model CourseDiscussionPost {
  id        String   @id @default(uuid())
  courseId  String
  authorId  String
  parentId  String?          // null = top-level post, else a reply
  body      String
  createdAt DateTime @default(now())
}

model SuccessStorySubmission {
  id               String       @id @default(uuid())
  studentId        String
  story            String
  consentToPublish Boolean      @default(false)
  status           ReviewStatus @default(PENDING)
  submittedAt      DateTime     @default(now())
}
```

## 6. API Surface

**Auth (`/api/v1/auth`)**
- `POST /register/student` — single-step: name, email, phone, password, country (required — feeds country-level revenue attribution), optional program track
- `POST /register/teacher` — one payload covering the full application (basic info, subject areas, experience, bio, document URL); sets `approvalStatus: PENDING`
- `POST /login` — validate against WordPress, issue role-aware JWT; blocked with a clear message if `approvalStatus` is still `PENDING`
- `POST /forgot-password` / `POST /reset-password` — bridges to WordPress's own reset flow rather than reinventing it
- `GET /me` — current profile + active packages (derived from unexpired `PackagePurchase` rows, not a stored flag) + wallet balance, where the role has one

**Countries (`/api/v1/countries`)**
- `GET /admin/countries` — list, with each country's commission and bonus settings
- `POST /admin/countries` — [admin] add a country of operation
- `PATCH /admin/countries/:id` — [admin] set `repCommissionPercent`, `perStudentBonus`, assign/reassign the rep
- `GET /country-rep/dashboard` — the logged-in rep's own country: revenue, active student count, wallet

**Courses & review (`/api/v1/courses`)**
- `POST /admin/courses/:courseId/assign` — [admin] set a course's teacher, reviewer, and their commission percentages
- `GET /reviewer/queue` — [subject reviewer] courses awaiting their review
- `PATCH /reviewer/courses/:courseId/review` — [subject reviewer] approve or reject, with notes; a package can't be published while any of its courses are still `PENDING` or `REJECTED` (see §7)

**Packages (`/api/v1/packages`)**
- `GET /packages` — published packages, for the student-facing pricing/browse screen
- `POST /admin/packages` — [admin] create a package: name, price, currency, included courses or category tags, validity
- `PATCH /admin/packages/:id` — [admin] edit a package, including publish/unpublish (publish is blocked until every included course is review-approved)
- `GET /admin/packages/:id/sales` — [admin] purchase count and revenue for one package, feeding the Financial dashboard

**Files (`/api/v1/files`)**
- `POST /upload` — used by the teacher application wizard (credentials) and assignment submissions; returns a URL stored on `TeacherApplication.documentUrl` or `Submission.fileUrl`

**Portals (`/api/v1/portals`)**
- `GET /student/courses` — paid course content from WP
- `GET /teacher/rosters/:cohortId`
- `GET /admin/billing/stats`
- `GET /admin/teachers/pending` — teacher signups awaiting approval
- `PATCH /admin/teachers/:id/approve` — [admin] approve or reject, sets `approvalStatus`

**Live video (`/api/v1/live`)**
- `POST /rooms/create` — [teacher/admin] create expiring Daily.co room
- `POST /rooms/token` — issue owner/read-only token, blocks unpaid students before a token is ever generated

**Education (`/api/v1/education`)**
- `POST /quizzes/submit` — server-side MCQ grading, flags written items for review
- `PATCH /submissions/:id/grade` — [teacher] manual grade + feedback

**Payments (`/api/v1/payments`)**
- `POST /create-checkout-session` — accepts an optional `couponCode`, applied server-side, never trusting a client-calculated discount
- `POST /webhook` — signature-verified, updates NestJS DB + WordPress user-meta

**Certificates (`/api/v1/certificates`)**
- `GET /certificates` — the student's own issued certificates
- `GET /verify/:verifyCode` — public, no auth: confirms a certificate is genuine

**Mentorship (`/api/v1/mentorship`)**
- `GET /mentors/:teacherId/slots` — a teacher's open availability
- `POST /mentors/slots` — [teacher] add availability
- `POST /bookings` — [student] book an open slot

**Coupons (`/api/v1/coupons`)**
- `POST /admin/coupons` — [admin] create a coupon (percent or fixed amount off, optionally scoped to one package)

**Organizational enrollment (`/api/v1/org`)**
- `POST /admin/org-enrollments` — [admin] record a bulk seat purchase for an organization
- `POST /org-enrollments/:id/claim` — an invited person claims one seat with their own account

**Wallets (`/api/v1/wallets`)**
- `GET /me/wallet` — the logged-in teacher, reviewer, or country rep's own balance and transaction history
- `GET /admin/wallets` — [admin] all wallets, for oversight

**Payouts (`/api/v1/payouts`)**
- `POST /admin/payouts/generate` — [admin] roll up unpaid wallet transactions for a period into `PayoutStatement` rows, one per recipient
- `PATCH /admin/payouts/:id/mark-paid` — [admin] confirm a statement was actually paid, settling those wallet transactions
- `GET /me/payouts` — a teacher, reviewer, or country rep's own statements

**Reports (`/api/v1/reports`)** — all admin-only, all USD-normalized via `ExchangeRate` for cross-country comparison
- `GET /admin/reports/courses` — revenue generated per course
- `GET /admin/reports/teachers` — revenue and payout totals per teacher
- `GET /admin/reports/countries` — revenue per country and each country's % of total

**Community (`/api/v1/community`)**
- `GET /courses/:id/discussion` / `POST /courses/:id/discussion` — per-course Q&A
- `POST /success-stories` — student submits a story
- `GET /admin/success-stories` / `PATCH /admin/success-stories/:id` — [admin] review queue

## 7. Core Workflows

**Auth & signup — where it actually lives:** login and registration UI move
entirely to the portal (`portal.careerpathafrica.com/login`,
`/register`). On `careerpathafrica.com`, the existing "Login/register" link
and the student/tutor registration pages are repointed (a link change, not a
rebuild) to those portal URLs, so nobody types credentials into the old
WordPress screens anymore. WordPress stays the system of record for identity
— the portal is just a new front door to the same accounts:

- **Student sign-up** is a single short form (name, email, phone, password,
  country, optional program track) — low friction, immediate `APPROVED`
  access. Country is required, not optional, since it's the basis for
  country-level revenue reporting and the country rep's commission — it's
  asked directly rather than inferred from a phone number or payment
  method, which isn't reliable enough to pay someone's commission against.
- **Teacher sign-up is a multi-step wizard**, because it's really an
  application: basic info → subject areas & experience → credential
  upload → review & submit. The wizard is frontend-only UX; NestJS receives
  one complete payload at the end and stores it on `TeacherApplication`.
- **Existing users:** NestJS validates the submitted password against
  WordPress itself, server-to-server, via a small bridging endpoint (a
  lightweight JWT-auth plugin or a purpose-built mu-plugin — WordPress's
  default REST API has no built-in way to check an arbitrary password).
  This means no forced password reset for anyone already registered.
- **New signups:** NestJS creates the user directly in WordPress via its
  REST API (using an admin application password), sets their role, then
  issues its own JWT — so every account, old or new, ends up as a real
  WordPress user underneath.
- **wp-admin login is untouched.** That stays exactly as-is for staff
  editing content — this change is only about the student/teacher-facing
  login and signup screens.
- **Tutor approval is an Admin Portal workflow.** Teacher/tutor signups from
  the portal land with `approvalStatus: PENDING` and cannot log in yet. An
  admin reviews and approves (or rejects) them from the Admin Portal's user
  management screen — this never routes through wp-admin. Student signups
  default to `APPROVED` immediately; there's no equivalent review step for
  them. `POST /login` checks `approvalStatus` before issuing a JWT — a
  pending teacher gets a clear "still under review" response, not a silent
  failure.

**Package bundling & purchase:** an admin builds a package in the Admin
Portal — name, price, and either specific WordPress courses or whole
category tags (e.g. every "CPD" course), plus a validity period (lifetime
or a fixed number of days). It stays a draft (`isPublished: false`) until
the admin is ready, so it can be built and previewed before students ever
see it. **Publishing is blocked until every included course has an
`APPROVED` `CourseAssignment.reviewStatus`** — a package can't go on sale
built from unreviewed content. Editing a published package (adding a
course to it, say) applies immediately to everyone who already holds it —
a package is a live definition, not a snapshot frozen at purchase time,
which keeps "what does this package include" answerable in one place
rather than duplicated per purchase. A purchase creates one
`PackagePurchase` row with an `expiresAt` computed from the package's
`validityDays`; access-checking (`PackageGuard`) queries this directly
rather than trusting a cached flag, so an expired package silently stops
granting access without any cleanup job needed.

**Payment → unlock:** checkout session → gateway webhook hits NestJS →
signature verified → a `PackagePurchase` row is created/renewed in Postgres
→ WordPress user-meta is updated with a simple "has active access" flag for
content-side gating → frontend reflects "Unlocked" instantly.

**Live class lifecycle:** teacher schedules for a cohort → ~15 min before
start, NestJS creates a private, time-boxed Daily.co room (`nbf`/`exp` set) →
join requests get a scoped token only if `Cohort_ID` matches and (for
students) they hold an unexpired `PackagePurchase` covering the required
package → on end, NestJS force-closes the room and logs attendance from
Daily.co's webhooks.

**Quiz grading:** MCQ answers never expose correct answers to the client;
NestJS scores them on submit. Written answers flag `PENDING_REVIEW` and
surface in the teacher's grading queue; final score = auto + manual.

**Whiteboard:** Excalidraw canvas state is broadcast peer-to-peer over
Daily.co's data channels — no custom WebSocket server needed.

**Certificates & verification:** issued automatically when a student's
progress on a course crosses 100% (or passes its final quiz, if it has
one) — a PDF is generated, stored in file storage, and a short
`verifyCode` is attached. The student's dashboard shows progress toward
this, not just a pass/fail at the end. Anyone with the certificate can
have it checked at `/verify/:code` — a public page with no login required,
which is the entire point: it's a trust signal for someone *other* than
the student (an employer, another institution) to confirm it's real.

**Mentorship booking:** a teacher marks themselves available by creating
`MentorSlot` rows (a simple calendar); a student with an active
mentorship-package purchase books an open slot, which creates a
`MentorBooking` and marks the slot unavailable to anyone else. This reuses
the existing Daily.co room infrastructure for the actual session — a
booked mentorship slot is just a `LiveClass` with one student instead of a
cohort.

**Course review — the quality gate:** every course gets a
`CourseAssignment` naming its teacher and (if assigned) a subject reviewer,
each with their own commission percentage — `null` on either means that
person is paid outside the platform entirely, so revenue-share is opt-in
per role per course, never assumed. A reviewer works through their queue
(`GET /reviewer/queue`) and approves or rejects; a course stuck at
`PENDING` or `REJECTED` simply can't be part of a published package (see
above). Courses already live on the current site are treated as
grandfathered-`APPROVED` at migration time, not retroactively blocked —
this only gates courses going forward (confirm this is the wanted
transition behavior; see §8).

**Revenue split, wallets, and payouts — the whole earnings chain:** this
is the mechanism behind "how much does each course/teacher/country make,"
and it runs in four steps on every successful sale:

1. **Split the sale across its courses.** A `PackagePurchase` for a
   package containing more than one course splits the sale amount evenly
   across `courseIds` for attribution purposes (the simplest, most
   defensible default — a single-course package has no split to make at
   all).
2. **Credit the teacher and reviewer.** For each course's share, NestJS
   looks up its `CourseAssignment` and writes a `WalletTransaction`
   (`source: COURSE_SALE` / `REVIEW_COMMISSION`) crediting the teacher's
   and reviewer's wallets by their respective percentages, in the
   currency the student actually paid in.
3. **Credit the country rep.** Using the *purchasing student's*
   `countryId`, NestJS credits that country's rep wallet by
   `Country.repCommissionPercent` of the sale (`source: COUNTRY_BONUS`).
   The per-student bonus is calculated separately and periodically (at
   payout-generation time), counting students in that country with a
   currently-active (unexpired) `PackagePurchase` — not all-time signups.
4. **Settle on a schedule, not per-sale.** Wallet balances accrue live,
   but nobody gets paid per-transaction. An admin runs
   `POST /admin/payouts/generate` for a period; it totals each wallet's
   unsettled credits into one `PayoutStatement` per teacher, reviewer, and
   country rep. Marking a statement paid writes a matching `DEBIT`
   transaction, so the wallet balance always reflects "what's still owed,"
   never a number that can silently drift from the transaction log.

**Cross-country reporting.** Nigeria, Cameroon, Ghana, and South Africa
each transact in their own currency (NGN, XAF, GHS, ZAR), so wallets and
transactions are always recorded in their native, actual currency — no
conversion happens on the money itself. Reporting is where normalization
happens: `GET /admin/reports/*` converts every figure to USD on the fly
using the admin-maintained `ExchangeRate` table, purely for comparison
(e.g. "Ghana is 18% of total revenue this month"). This keeps the ledger
itself simple and exact, and confines any exchange-rate assumption to
reporting, where being approximate is acceptable.

**Coupons:** a coupon is validated and applied entirely server-side at
`POST /create-checkout-session` — the discounted total is calculated by
NestJS, never trusted from the client, and `redeemedCount` is checked
against `maxRedemptions` atomically to prevent a code being over-used by
concurrent checkouts.

**Bulk/organizational enrollment:** an admin records an `OrgEnrollment`
for a company buying, say, 50 seats of one package — this doesn't create
50 `PackagePurchase` rows upfront. Instead, 50 `OrgSeat` invite rows are
created (by email), and each becomes a real `PackagePurchase` only once
the invited person actually claims their seat and creates or links an
account — so an unclaimed seat doesn't clutter reporting as an "active
student."

**Course discussion & success stories:** both are simple, moderated
content types — a discussion post needs no admin approval to appear (it's
low-stakes, course-scoped Q&A), while a success-story submission sits in
`PENDING` until an admin approves it, since publishing it (and the
student's name) to the public success-stories section is a one-way,
public action.

## 8. Open Decisions

- **Payment gateway — dual market:** the site's public contact details list a
  Texas, US address alongside African-market branding and course content.
  This likely means both a US-facing rail (Stripe/PayPal) and African rails
  (Paystack, MTN MoMo, Orange Money) are needed from the start, rather than
  picking just one. Confirm the actual split of the student base with the
  client before building the checkout module.
- **Current LMS/registration plugin:** needs identifying from wp-admin access
  (see §1) — changes exactly how NestJS reads course, enrollment, and role
  data from WordPress.
- **Attendance tracking:** Daily.co webhooks can auto-log join/leave times.
  Decide if this is in v1 scope — it adds a field set to `LiveClass`.
- **MCQ time limits:** hard server-side cutoff vs. soft warning — affects the
  quiz-submission endpoint's validation.
- **Whiteboard permissions:** teacher-only drawing vs. students-can-draw-too
  — affects the Excalidraw `viewModeEnabled` prop and access token scope.
- **Package edits affecting existing holders:** removing a course from a
  published package currently means everyone holding it loses access to
  that course immediately (a package is a live definition, not a snapshot
  — see §7). Confirm this is the wanted behavior, or whether removals
  should only apply to purchases made after the edit.
- **Instructor pay model — resolved with a default:** revenue-share is now
  opt-in per course via `CourseAssignment` (`null` commission = paid
  outside the platform), so this no longer blocks the schema either way.
  Still needs a real answer per teacher before Phase 6, since it decides
  which teachers actually get a `Wallet`/`PayoutStatement` at all.
- **Multi-course revenue split:** an even split across a package's
  `courseIds` is the adopted default (see §7) — flag if a weighted split
  (by each course's standalone price) is wanted instead, since that's a
  bigger change once purchases exist.
- **Course review — retroactive or forward-only:** currently-live courses
  are grandfathered as `APPROVED` rather than blocked pending review.
  Confirm this is acceptable, or whether existing content should be queued
  for review too before the reviewer role goes live.
- **Currency normalization:** USD as the reporting base, via an
  admin-maintained `ExchangeRate` table updated periodically rather than a
  live FX API (see §7) — simpler and cheaper, at the cost of rates lagging
  the real market slightly between updates. Confirm this trade-off is
  acceptable, or whether a live-rate provider is worth the added
  dependency.
- **Country rep / reviewer portal depth:** the plan assumes both get
  scoped views inside the existing Admin route group (a rep sees only
  their own country's data; a reviewer sees only their queue) rather than
  two entirely separate portal experiences — cheaper to build, and
  consistent with the "one app, role-gated" architecture in §2. Flag if a
  fuller, dedicated experience is wanted instead.

## 9. Delivery Phases

| Phase | Weeks | Milestone |
|---|---|---|
| Foundation & Auth | 1–3 | Login returns a role-aware JWT from WordPress-backed credentials |
| Payments & Gating | 4–6 | A published package can be purchased and a matching `PackagePurchase` unlocks its courses within seconds |
| Portals & Quiz Engine | 7–9 | Students take a quiz; MCQs auto-grade, written ones queue for teachers |
| Live Video & Whiteboard | 10–12 | Teacher opens a room, draws, students see it with no lag |
| Extended Features | 13–15 | Certificates issue and verify publicly; a mentorship slot can be booked; a coupon and a bulk org-enrollment both work end to end |
| Multi-Role Revenue & Country Ops | 16–18 | A test sale correctly splits and credits the teacher, reviewer, and country-rep wallets; a generated payout statement matches the wallet transactions it settles |

Low-bandwidth resilience (see §10) isn't a separate phase — it's applied
incrementally: the PWA shell and downloadable materials land in Phase 1–2,
the Daily.co audio-only fallback lands alongside Phase 4's video work.

## 10. Non-Functional Requirements

- NestJS caches WordPress reads to avoid hammering the WP DB under concurrent logins.
- All secrets (Daily.co key, gateway key, WP service credentials) live in NestJS env vars — never reach the browser.
- Route guards enforce role + payment status server-side; frontend checks are UX-only, never the security boundary.
- **Low-bandwidth resilience** — given the actual student base, this earns priority over most visual polish:
  - The portal is installable as a PWA (offline-capable shell, works on a weak connection without feeling broken)
  - Lesson materials are downloadable for offline review, not just streamed
  - Live classes fall back to audio-only automatically when Daily.co's connection quality drops, rather than freezing on video
