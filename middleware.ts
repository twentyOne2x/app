// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { kv } from '@vercel/kv';
import { CookieSerializeOptions } from 'cookie';

// Rate limiting configuration
const RATE_LIMIT = 100; // Max requests per window
const RATE_LIMIT_WINDOW = 60; // Window size in seconds

export async function middleware(req: NextRequest) {
  const response = NextResponse.next();
  const host = req.headers.get('host') || '';
  const isMevMainDomain = host === 'mev.fyi' || host === `mev.fyi:${process.env.PORT}`;
  
  // Rate limiting
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.ip || 'unknown';

  if (ip !== 'unknown') {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const key = `rate-limit:${ip}:${now}`;

    try {
      const current = await kv.incr(key);
      if (current === 1) {
        // Set expiration for the key
        await kv.expire(key, RATE_LIMIT_WINDOW);
      }

      if (current > RATE_LIMIT) {
        // Exceeded rate limit
        return new NextResponse('Too Many Requests', { status: 429 });
      }
    } catch (error) {
      console.error('Rate limiting failed:', error);
      // Optionally, allow the request to proceed if rate limiting fails
    }
  }

  // Handle anonymous users for mev.fyi
  if (isMevMainDomain) {
    const anonymousIdCookie = req.cookies.get('anonymousId');

    if (!anonymousIdCookie) {
      const anonymousId = nanoid();

      // Define cookie options with correct sameSite type
      const cookieOptions: Partial<CookieSerializeOptions> = {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Correctly typed as 'lax'
        maxAge: 60 * 60 * 24 * 365, // 1 year
      };

      // Set the 'anonymousId' cookie
      response.cookies.set('anonymousId', anonymousId, cookieOptions);

      console.log(`Set anonymousId cookie for ${host}: ${anonymousId}`);
    } else {
      console.log(`Existing anonymousId cookie for ${host}: ${anonymousIdCookie.value}`);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Apply middleware to all paths except specific ones
    '/((?!api|_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)',
  ],
};
