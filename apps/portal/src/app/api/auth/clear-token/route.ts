import { NextResponse } from 'next/server';

/**
 * POST /api/auth/clear-token
 * Removes the HttpOnly cpa_token cookie (logout).
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('cpa_token');
  return res;
}
