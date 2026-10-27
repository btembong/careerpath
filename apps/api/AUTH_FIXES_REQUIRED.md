# Backend Auth Fixes Required (NestJS)

These are security and logic gaps that require NestJS-side changes.
The frontend fixes are already applied.

---

## Fix #2 — Dev bypass must NEVER reach production

**File:** `apps/api/src/wordpress/wordpress.service.ts` (line 45-48)

**Problem:** If `WP_ADMIN_USER` is empty or `'your_wp_admin_username'`, the dev bypass
activates and **any password is accepted**. If this config leaks to production, every
account is open.

**Fix:** Add a hard guard at startup:

```typescript
// In WordPressService constructor, AFTER reading config:
if (this.devBypass && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: WP_ADMIN_USER is not configured. Cannot start in production with dev bypass enabled.',
  );
}
```

This crashes the server at boot if WP creds are missing in production.
Additionally, log a warning in dev mode:

```typescript
if (this.devBypass) {
  this.logger.warn('WordPress dev bypass is ACTIVE — accepting any password. DO NOT use in production.');
}
```

---

## Fix #6 — WP authors should NOT be auto-approved as teachers

**File:** `apps/api/src/auth/auth.service.ts` (line 83-94)

**Problem:** When a WP author logs into the portal for the first time, their profile
is created with `approvalStatus: APPROVED`. They skip the entire teacher review process.

**Current code (line 88):**
```typescript
approvalStatus: ApprovalStatus.APPROVED,
```

**Fix:** Set approval status based on role:

```typescript
approvalStatus: wpDerivedRole === UserRole.TEACHER
  ? ApprovalStatus.PENDING
  : ApprovalStatus.APPROVED,
```

This means a WP author who logs in for the first time will:
1. Have their profile created with `PENDING` status
2. See the "under review" message (same as portal-registered teachers)
3. Need admin approval before they can access the teacher dashboard

If you want certain WP authors to be pre-approved, add a whitelist or a WP user meta
field (e.g., `cpa_approved: true`) that the mu-plugin returns.

---

## Fix #7 — Role should sync both directions (up AND down)

**File:** `apps/api/src/auth/auth.service.ts` (line 96-114)

**Problem:** If a WP admin is demoted to subscriber, their portal role stays ADMIN forever.
Role only syncs upward (`derivedPriority > currentPriority`), never downward.

**Fix:** Change the comparison to always sync when different:

```typescript
if (!isPortalOnly && wpDerivedRole !== profile.role) {
  profile = await this.prisma.userProfile.update({
    where: { id: profile.id },
    data: {
      role: wpDerivedRole,
      // If demoted from TEACHER, also reset approval
      ...(wpDerivedRole === UserRole.STUDENT && profile.role === UserRole.TEACHER
        ? { approvalStatus: ApprovalStatus.APPROVED }
        : {}),
    },
  });
}
```

This ensures:
- WP subscriber -> STUDENT (always)
- WP author -> TEACHER (always, but PENDING if new)
- WP administrator -> ADMIN (always)
- COUNTRY_REP / SUBJECT_REVIEWER are never touched (portal-only)

---

## Fix #10 — Google SSO users need real WP accounts

**File:** `apps/api/src/auth/auth.service.ts` (Google SSO handler)

**Problem:** Google SSO creates users with `wpUserId: -(Date.now())` — a negative sentinel.
These users have no WP account. Password reset won't work for them.

**Fix options:**

**Option A (recommended):** Create a real WP user during Google SSO:
```typescript
const wpUserId = await this.wp.createUser({
  email: googleUser.email,
  firstName: googleUser.given_name,
  lastName: googleUser.family_name,
  username: googleUser.email.split('@')[0] + '_g',
  password: crypto.randomBytes(32).toString('hex'), // random, user won't use it
  wpRole: 'subscriber',
});
```

**Option B (simpler):** Keep the sentinel but show a "Set password" flow instead
of "Reset password" for users who don't have a WP account.

---

## Fix #12 — Add per-account lockout (not just per-IP)

**File:** `apps/api/src/auth/auth.service.ts` (login method)

**Problem:** The NestJS throttler is IP-based. A distributed attack from multiple IPs
against one account bypasses it. The frontend has client-side lockout, but that can be
bypassed with curl.

**Fix:** Add account-level lockout using Redis:

```typescript
// At the top of the login method:
const lockKey = `auth:lock:${dto.email}`;
const failKey = `auth:fails:${dto.email}`;

const isLocked = await this.redis.get(lockKey);
if (isLocked) {
  throw new TooManyRequestsException(
    'Too many failed login attempts. Please try again later.',
  );
}

// After catch (password verification failed):
const fails = await this.redis.incr(failKey);
await this.redis.expire(failKey, 900); // 15 min window

if (fails >= 5) {
  const lockDuration = Math.min(30 * Math.pow(2, fails - 5), 900);
  await this.redis.set(lockKey, '1', lockDuration);
}

// After successful login:
await this.redis.del(failKey);
await this.redis.del(lockKey);
```

---

## Summary

| Fix | Severity | Effort |
|-----|----------|--------|
| #2 Dev bypass guard | CRITICAL | 5 min |
| #6 WP author approval | MEDIUM | 5 min |
| #7 Bidirectional role sync | MEDIUM | 10 min |
| #10 Google SSO WP accounts | LOW | 30 min |
| #12 Per-account lockout | MEDIUM | 20 min |
