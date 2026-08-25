import { NextResponse, type NextRequest } from 'next/server'
import { internalServiceHeaders } from '@/lib/internal-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  if (!CLIP_SERVICE_URL) {
    return NextResponse.json({ error: 'Clip service unavailable' }, { status: 503 })
  }

  const { id } = context.params
  const base = CLIP_SERVICE_URL.replace(/\/$/, '')
  const target = new URL(`${base}/clips/${id}/file`)
  const incoming = new URL(request.url)
  if (incoming.search) {
    target.search = incoming.search
  }

  let response: Response
  try {
    response = await fetch(target.toString(), {
      method: 'GET',
      headers: internalServiceHeaders(request, {
        ...(request.headers.get('range') ? { Range: request.headers.get('range') as string } : {}),
        ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch clip content'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => '')
    return NextResponse.json(
      { error: message || `Clip service returned status ${response.status}` },
      { status: response.status }
    )
  }

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  return new NextResponse(response.body, {
    status: response.status,
    headers
  })
}
