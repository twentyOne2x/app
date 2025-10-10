// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { kv } from '@vercel/kv';
import { ENTRY_PROFILE_COOKIE } from '@/lib/entry-profiles';

const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60;

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const method = req.method ?? 'GET';
  const entryCookie = req.cookies.get(ENTRY_PROFILE_COOKIE);
  const isAccessPath = pathname === '/access' || pathname.startsWith('/access/');
  const isMethodSafe = method === 'GET' || method === 'HEAD';
  const isAssetRequest = pathname.includes('.') && !pathname.endsWith('.well-known');

  if (!entryCookie && !isAccessPath && isMethodSafe && !isAssetRequest) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/access';
    redirectUrl.search = '';
    const nextParam = `${pathname}${req.nextUrl.search ?? ''}`;
    if (nextParam && nextParam !== '/') {
      redirectUrl.searchParams.set('next', nextParam);
    }
    redirectUrl.hash = '';
    return NextResponse.redirect(redirectUrl);
  }

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

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)'],
};
