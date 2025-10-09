// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { kv } from '@vercel/kv';
import { CookieSerializeOptions } from 'cookie';

const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60;

export async function middleware(req: NextRequest) {
  const response = NextResponse.next();

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

  const anonymousIdCookie = req.cookies.get('anonymousId');
  if (!anonymousIdCookie) {
    const anonymousId = nanoid();
    const cookieOptions: Partial<CookieSerializeOptions> = {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    };
    response.cookies.set('anonymousId', anonymousId, cookieOptions);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)'],
};
