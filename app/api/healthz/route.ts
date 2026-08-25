import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const production = process.env.ICMFYI_PRODUCTION === '1'
  const configured =
    !production ||
    Boolean(
      process.env.NEXTAUTH_SECRET &&
        process.env.INTERNAL_SERVICE_SECRET &&
        process.env.ICMFYI_MCP_AUDIENCE &&
        process.env.ICMFYI_MCP_OAUTH_ISSUER &&
        process.env.ICMFYI_MCP_OAUTH_JWKS_URL &&
        process.env.RAG_SERVICE_URL &&
        process.env.INGESTION_SERVICE_URL &&
        process.env.CLIP_SERVICE_URL
    )
  return NextResponse.json(
    { ok: configured, service: 'icmfyi-app' },
    { status: configured ? 200 : 503 }
  )
}
