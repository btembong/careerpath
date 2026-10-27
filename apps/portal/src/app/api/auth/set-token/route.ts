import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/set-token
 * Sets the JWT as an HttpOnly cookie so JavaScript cannot read it.
 * The frontend calls this after receiving a token from the NestJS API.
 *
 * Body: { token: string, rememberMe?: boolean }
 */
export async function POST(req: NextRequest) {
  const { token, rememberMe } = await req.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = rememberMe ? 7 * 24 * 60 * 60 : undefined; // 7 days or session

  const res = NextResponse.json({ ok: true });
  res.cookies.set('cpa_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  });

  return res;
}
