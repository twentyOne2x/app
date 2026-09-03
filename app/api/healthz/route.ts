import { NextResponse } from 'next/server'
import { chatAccessStoreHealth } from '@/lib/chat-access'
import { chatStoreHealth } from '@/lib/chat-store'
import { isProductionRuntime } from '@/lib/internal-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const production = isProductionRuntime()
  const configured =
    !production ||
    Boolean(
      process.env.NEXTAUTH_SECRET &&
        process.env.INTERNAL_SERVICE_SECRET &&
        process.env.ICMFYI_IDENTITY_HMAC_SECRET &&
        process.env.ICMFYI_IDENTITY_HMAC_SECRET.length >= 32 &&
        process.env.ICMFYI_MCP_AUDIENCE &&
        process.env.ICMFYI_MCP_OAUTH_ISSUER &&
        process.env.ICMFYI_MCP_OAUTH_JWKS_URL &&
        process.env.APP_DATABASE_URL &&
        process.env.APP_REDIS_URL &&
        process.env.RAG_SERVICE_URL &&
        process.env.INGESTION_SERVICE_URL &&
        process.env.CLIP_SERVICE_URL
    )
  if (!configured) {
    return NextResponse.json(
      { ok: false, service: 'icmfyi-app' },
      { status: 503 }
    )
  }
  try {
    await Promise.all([chatStoreHealth(), chatAccessStoreHealth()])
    return NextResponse.json({ ok: true, service: 'icmfyi-app' })
  } catch (error) {
    console.error(
      'icmfyi-app dependency health failed',
      error instanceof Error ? error.message : 'dependency_unavailable'
    )
    return NextResponse.json(
      { ok: false, service: 'icmfyi-app' },
      { status: 503 }
    )
  }
}
