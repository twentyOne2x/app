// middleware.ts
import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ENTRY_PROFILE_COOKIE, DEFAULT_ENTRY_PROFILE_CODE } from '@/lib/entry-profiles'
import {
  resolveGatewayExternalIdentity
} from '@/lib/gateway-auth'
import { deriveGatewayScopedIdentity } from '@/lib/gateway-identity'

const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60;

const INTERNAL_IDENTITY_HEADERS = [
  'x-icmfyi-user-id',
  'x-icmfyi-tenant-id',
  'x-icmfyi-internal-secret',
  'x-acp-shared-secret',
  'x-ops-shared-secret'
]

function isProduction() {
  return process.env.ICMFYI_PRODUCTION === '1' || process.env.NODE_ENV === 'production'
}

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
  const requestHeaders = new Headers(req.headers)
  for (const name of INTERNAL_IDENTITY_HEADERS) requestHeaders.delete(name)

  const isPublicApi =
    req.nextUrl.pathname.startsWith('/api/auth/') || req.nextUrl.pathname === '/api/healthz'
  if (req.nextUrl.pathname.startsWith('/api/') && !isPublicApi) {
    if (isProduction()) {
      const authorization = req.headers.get('authorization')
      let externalIdentity
      try {
        externalIdentity = await resolveGatewayExternalIdentity(
          {
            authorization,
            method,
            pathname: req.nextUrl.pathname
          },
          {
            sessionIdentity: async () => {
              const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
              const subject = typeof token?.userId === 'string' ? token.userId : token?.sub
              return token && subject
                ? `${String(token.provider ?? 'unknown')}:${subject}`
                : null
            }
          }
        )
      } catch (error) {
        const status =
          error instanceof Error && 'code' in error && error.code === 'insufficient_scope'
            ? 403
            : 401
        const errorCode =
          status === 403
            ? 'insufficient_scope'
            : authorization === null
            ? 'authentication_required'
            : 'invalid_token'
        return NextResponse.json(
          { error: errorCode },
          { status }
        )
      }
      try {
        const identitySecret = process.env.ICMFYI_IDENTITY_HMAC_SECRET ?? ''
        const [userId, tenantId] = await Promise.all([
          deriveGatewayScopedIdentity(
            'usr',
            externalIdentity.identity,
            externalIdentity.realm,
            identitySecret
          ),
          deriveGatewayScopedIdentity(
            'ten',
            externalIdentity.identity,
            externalIdentity.realm,
            identitySecret
          )
        ])
        requestHeaders.set('x-icmfyi-user-id', userId)
        requestHeaders.set('x-icmfyi-tenant-id', tenantId)
      } catch (error) {
        console.error('gateway identity derivation failed', error)
        return NextResponse.json({ error: 'gateway_identity_unavailable' }, { status: 503 })
      }
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!entryCookie) {
    response.cookies.set(ENTRY_PROFILE_COOKIE, DEFAULT_ENTRY_PROFILE_CODE, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';

  if (ip !== 'unknown') {
    const current = await maybeRateLimit(ip);
    if (current && current > RATE_LIMIT) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|app/share/[^/]+/page|share.*|sign-in).*)']
};
