import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Paths that redirect logged-in users to their dashboard
const PUBLIC_PATHS = [
  '/login', '/register', '/verify', '/apply', '/join',
  '/packages/success', '/apply/pending', '/forgot-password', '/reset-password',
];
// Paths accessible without auth
// The legal pages are linked from sign-up, so visitors must be able to read them
const OPEN_PATHS = ['/packages', '/courses', '/offline', '/legal'];
// Logged-in students get sent to in-app equivalents
const STUDENT_REDIRECT: Record<string, string> = {
  '/courses': '/student/catalogue',
};

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'COUNTRY_REP' | 'SUBJECT_REVIEWER' | 'ORG_ADMIN';

interface JwtPayload {
  role: Role;
  sub: string;
  exp: number;
  onboardingCompleted: boolean;
}

const ROLE_HOME: Record<Role, string> = {
  STUDENT:          '/student/dashboard',
  TEACHER:          '/teacher/dashboard',
  ADMIN:            '/admin/dashboard',
  COUNTRY_REP:      '/country-rep/dashboard',
  SUBJECT_REVIEWER: '/reviewer/dashboard',
  ORG_ADMIN:        '/school/dashboard',
};

// Encode the JWT secret for jose (must be Uint8Array)
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? 'changeme';
  return new TextEncoder().encode(secret);
}

/**
 * An address on this site as the visitor reached it. Behind Caddy the portal itself only sees localhost:3000,
 * so redirects built from request.url would send people to their own computer.
 */
function at(request: NextRequest, path: string) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  return new URL(path, host ? `${proto}://${host}` : request.url);
}

/** Sign in, then come back here: links in emails land on the page they point to */
function signInFirst(request: NextRequest) {
  const url = at(request, '/login');
  const here = request.nextUrl.pathname + request.nextUrl.search;
  if (here !== '/') url.searchParams.set('next', here);
  return url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('cpa_token')?.value;

  // The home page is open to everyone; signed-in people go to their dashboard
  const isPublic = pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isOpen   = OPEN_PATHS.some((p) => pathname.startsWith(p));

  if (!token) {
    if (isPublic || isOpen) return NextResponse.next();
    return NextResponse.redirect(signInFirst(request));
  }

  try {
    // Cryptographic verification — reject if signature is invalid
    const { payload: verified } = await jwtVerify(token, getSecret());
    const payload = verified as unknown as JwtPayload;

    // Reject expired tokens
    if (!payload.exp || payload.exp * 1000 < Date.now()) {
      const res = NextResponse.redirect(signInFirst(request));
      res.cookies.delete('cpa_token');
      return res;
    }

    // Reject tokens without a recognised role
    if (!payload.role || !(payload.role in ROLE_HOME)) {
      const res = NextResponse.redirect(at(request, '/login'));
      res.cookies.delete('cpa_token');
      return res;
    }

    // A signed-in student opening their school's join link takes the seat straight away
    if (pathname.startsWith('/join/school/') && payload.role === 'STUDENT') {
      return NextResponse.redirect(new URL(`/student/join/${pathname.split('/')[3] ?? ''}`, request.url));
    }

    // Redirect logged-in users away from auth pages
    if (isPublic) {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }

    // Redirect logged-in students from public storefronts
    const studentDest = STUDENT_REDIRECT[pathname];
    if (studentDest && payload.role === 'STUDENT') {
      return NextResponse.redirect(at(request, studentDest));
    }

    // Redirect students who haven't completed onboarding
    const isStudentArea = pathname.startsWith('/student') || pathname.includes('/checkout');
    if (
      payload.role === 'STUDENT' &&
      !payload.onboardingCompleted &&
      !pathname.startsWith('/student/onboarding') &&
      isStudentArea
    ) {
      return NextResponse.redirect(at(request, '/student/onboarding'));
    }

    // ── Role-based route ownership ──────────────────────────────────────────
    // Each protected prefix is only accessible by its owning role.
    // Real RBAC is enforced by NestJS on every API call; this is a UI-level guard.

    if (pathname.startsWith('/student') && payload.role !== 'STUDENT') {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
    if (pathname.startsWith('/teacher') && payload.role !== 'TEACHER') {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
    if (pathname.startsWith('/admin') && payload.role !== 'ADMIN') {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
    if (pathname.startsWith('/school') && payload.role !== 'ORG_ADMIN') {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
    if (pathname.startsWith('/country-rep') && payload.role !== 'COUNTRY_REP') {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
    if (
      pathname.startsWith('/reviewer') &&
      payload.role !== 'SUBJECT_REVIEWER' &&
      payload.role !== 'ADMIN'
    ) {
      return NextResponse.redirect(at(request, ROLE_HOME[payload.role]));
    }
  } catch {
    const res = NextResponse.redirect(signInFirst(request));
    res.cookies.delete('cpa_token');
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Files every visitor needs, signed in or not: the service worker can't be redirected (browsers refuse it)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|icons/|demo/).*)'],
};
