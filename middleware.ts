// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { kv } from '@vercel/kv';
import { ENTRY_PROFILE_COOKIE, DEFAULT_ENTRY_PROFILE_CODE } from '@/lib/entry-profiles';

const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60;

export async function middleware(req: NextRequest) {
  const method = req.method ?? 'GET';
  const entryCookie = req.cookies.get(ENTRY_PROFILE_COOKIE);
  const response = NextResponse.next();

  if (!entryCookie) {
    response.cookies.set(ENTRY_PROFILE_COOKIE, DEFAULT_ENTRY_PROFILE_CODE, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.ip || 'unknown';

  if (ip !== 'unknown') {
    const now = Math.floor(Date.now() / 1000);
    const key = `rate-limit:${ip}:${now}`;
    try {
      const current = await kv.incr(key);
      if (current === 1) await kv.expire(key, RATE_LIMIT_WINDOW);
      if (current > RATE_LIMIT) return new NextResponse('Too Many Requests', { status: 429 });
    } catch {}
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)']
};
