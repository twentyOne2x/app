// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ENTRY_PROFILE_COOKIE, DEFAULT_ENTRY_PROFILE_CODE } from '@/lib/entry-profiles';

const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60;

async function maybeRateLimit(_ip: string): Promise<number | null> {
  // IMPORTANT:
  // Next.js middleware runs in the Edge Runtime, and importing `@vercel/kv`
  // causes build-time Edge runtime incompatibility errors for this app.
  // For local bring-up (and until we rework rate limiting into a Node runtime),
  // keep this as a no-op.
  return null;
}

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
    const current = await maybeRateLimit(ip);
    if (current && current > RATE_LIMIT) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)']
};
