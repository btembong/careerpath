# CLAUDE.md — Working Guide for This Repo

This file orients an AI coding assistant (or a new developer) working in
this codebase. Read `PLAN.md` first for the full architecture, schema, and
API surface; this file is conventions and guardrails while writing code
here. If the two ever disagree, `PLAN.md` is the source of truth — update
this file to match it, not the other way around.

## What this repo is

A NestJS API gateway + a single Next.js frontend, sitting in front of an
**existing, untouched** WordPress site (careerpathafrica.com). WordPress is
never modified structurally — it's read and written only via its REST API,
and stays the system of record for user identity and course content. See
`PLAN.md` §2 for the full diagram.

**This is one frontend app, not five.** Student, Teacher, and Admin get
full route groups (`/student/*`, `/teacher/*`, `/admin/*`). Country Rep and
Subject Reviewer are scoped slices of the Admin group instead of two more
full portals (`/admin/country/*`, `/admin/reviews/*`) — cheaper to build,
and each still only ever sees data belonging to their own country or
review queue. All five share one codebase, one deployment. The frontend
hiding a route is UX only — the actual security boundary is NestJS
re-checking the JWT's role claim on every request. Never build a feature
that only checks role or access on the frontend.

## Repo layout (target)

```
/apps
  /api        → NestJS gateway
  /portal     → Next.js frontend (student/teacher/admin, RBAC-routed)
/packages
  /shared     → shared types (DTOs, enums) between api and portal
prisma/
  schema.prisma
PLAN.md
CLAUDE.md
```

## Domains at a glance

Matches `PLAN.md` §6. When adding an endpoint, extend the matching domain
rather than inventing a new prefix:

| Domain | Covers |
|---|---|
| `/auth` | Login, student/teacher registration, password reset |
| `/files` | Uploads — teacher application documents, assignment submissions |
| `/countries` | Country CRUD, commission/bonus config, a rep's own dashboard |
| `/courses` | Course-to-teacher/reviewer assignment, the reviewer's approval queue |
| `/portals` | Per-role dashboard reads (student courses, teacher rosters, admin stats/teacher approval) |
| `/packages` | Package browsing (student) and package CRUD/publishing (admin) |
| `/payments` | Checkout session creation (with optional coupon), gateway webhook |
| `/live` | Daily.co room creation and token issuance |
| `/education` | Quiz submission/grading, assignment grading |
| `/certificates` | Student's own certificates, public verification |
| `/mentorship` | Mentor availability slots, booking |
| `/coupons` | Admin coupon creation |
| `/org` | Bulk/organizational enrollment and seat claiming |
| `/wallets` | Live running balance for teachers, reviewers, country reps |
| `/payouts` | Generating and marking paid periodic payout statements |
| `/reports` | Admin-only, USD-normalized revenue by course/teacher/country |
| `/community` | Per-course discussion, success-story submission/review |

## Hard rules

1. **Never call the WordPress REST API from the frontend.** All WP access
   goes through NestJS. The frontend only ever talks to `/api/v1/*`.
2. **Never trust a frontend-supplied role, payment, or approval status.**
   Every guard re-verifies against the NestJS DB (or a fresh WordPress
   lookup) — not a client-sent claim. This includes `approvalStatus` on
   login (a `PENDING` teacher must get a clear rejection, not a token) and
   package access (checked against unexpired `PackagePurchase` rows, never
   a cached flag).
3. **Correct quiz answers never leave the server.** `GET` endpoints for
   quizzes must strip `correctAnswer` before responding.
4. **Daily.co room tokens are generated per-request, per-user.** Never
   reuse or cache a token across users; never return a raw, unscoped room
   URL to a student. This applies equally to a class room and a 1-on-1
   mentorship room — a booking is just a `LiveClass` with one student.
5. **Payment webhook signatures are verified before any DB write.** No
   exceptions, even in local/dev — use the gateway's sandbox keys and
   sandbox signing secret. The same applies to coupon math: a discount is
   always calculated server-side in the checkout-session endpoint, never
   accepted as a client-supplied total.
6. **WordPress credentials and all third-party API keys live in NestJS
   env vars only** — never committed, never sent to the frontend bundle.
   This includes the WP admin application password used to create users
   and the bridging endpoint used to verify existing users' passwords.
7. **A `Package` is a live definition, not a purchase-time snapshot.**
   Editing a published package's contents applies immediately to everyone
   who holds it. Don't build a feature that silently snapshots package
   contents at purchase time — that contradicts the documented design (see
   `PLAN.md` §7 and the related Open Decision).
8. **An `OrgSeat` is not a student until claimed.** Don't count unclaimed
   seats as enrolled students in any dashboard or report — only a claimed
   seat has a `studentId` and a real `PackagePurchase`.
9. **A package can't publish with unreviewed courses.** Publishing (see
   `PATCH /admin/packages/:id`) must check every `courseId` it includes has
   `CourseAssignment.reviewStatus: APPROVED` first. Don't let a package go
   live as a side effect of some other change without re-checking this.
10. **Never write revenue money math on the frontend.** Sale-splitting
    across a package's courses, commission percentages, and country-bonus
    calculations all happen in NestJS when a `PackagePurchase` is created —
    the frontend only ever displays numbers it was given, never computes
    a payout or a split itself.
11. **A wallet's balance is derived from its transactions, never edited
    directly.** Every credit or debit is a `WalletTransaction` row first;
    `Wallet.balance` is a cached total that must be recomputed or adjusted
    only by writing a transaction, never by a raw balance update. This is
    what keeps "what's owed" auditable.
12. **Money amounts are never mixed across currencies without going
    through `ExchangeRate`.** A wallet holds one currency; don't sum
    `WalletTransaction.amount` across rows with different `currency`
    values without converting first. Reporting endpoints do this
    conversion explicitly — nothing else should.

## Conventions

- **Auth:** login and registration UIs live only in the portal — never
  reintroduce a WordPress-side login form for students/teachers.
  Existing WordPress users are authenticated via a small bridging
  endpoint (WordPress has no built-in way to verify an arbitrary
  password); new users are created directly in WordPress via its REST API
  so every account, old or new, is a real WP user. Teacher registration is
  a multi-step wizard on the frontend but a single payload to
  `POST /auth/register/teacher` — don't design the backend around "steps."
- **Database:** Prisma models per `PLAN.md` §5. Migrations live in
  `prisma/migrations`; never hand-edit generated SQL. There is no
  `activePackages` field anywhere — access is always derived by querying
  `PackagePurchase` for an unexpired row.
- **Naming:** REST routes follow `/api/v1/<domain>/<resource>` — see the
  domain table above and `PLAN.md` §6 for the full current surface.
- **Live class state machine:** `SCHEDULED → ACTIVE → COMPLETED` only.
  Rooms are created ~15 min pre-class and force-closed on completion —
  don't add a "permanent room" mode.
- **Revenue-share is opt-in per course, not global.**
  `CourseAssignment.teacherCommissionPct` / `reviewerCommissionPct` are
  nullable; `null` means that person is paid outside the platform and no
  `WalletTransaction` should ever be generated for them from that course.
  Don't assume every teacher or reviewer is on revenue-share.

## Before adding a feature

Check `PLAN.md` §8 (Open Decisions) first — several things are still
pending client confirmation, including: which plugin currently powers
WordPress course/registration data, whether removing a course from a
published package should affect existing holders, whether course review
should be retroactive for already-live content, and whether USD/periodic
exchange rates (vs. a live FX provider) are acceptable for cross-country
reporting. Don't hard-code an assumption on any of these without flagging
it in the PR description.

## Commands

*(fill in once the repo is scaffolded — placeholders below)*

```bash
# API
cd apps/api && npm run start:dev
npx prisma migrate dev

# Portal
cd apps/portal && npm run dev
```
