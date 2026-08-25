import { NextResponse } from 'next/server'
import { z } from 'zod'

import { internalServiceHeaders, isProductionRuntime } from '@/lib/internal-service'

const CLIP_ID = /^[0-9a-f]{32}$/
const REQUEST = z
  .object({
    idempotencyKey: z.string().min(1).max(200).regex(/^[!-~]+$/)
  })
  .strict()

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function sanitizeStatus(status: unknown) {
  const candidate = typeof status === 'string' ? status.toLowerCase() : ''
  if (
    candidate === 'queued' ||
    candidate === 'processing' ||
    candidate === 'ready' ||
    candidate === 'expired' ||
    candidate === 'error'
  ) {
    return candidate
  }
  return 'queued'
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!CLIP_ID.test(params.id)) {
    return NextResponse.json({ error: 'Invalid clip id' }, { status: 404 })
  }
  const raw = await request.json().catch(() => null)
  const parsed = REQUEST.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid clip retry payload' }, { status: 400 })
  }
  if (!CLIP_SERVICE_URL) {
    return NextResponse.json(
      { error: isProductionRuntime() ? 'Clip service unavailable' : 'Clip retry unavailable' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    response = await fetch(
      `${CLIP_SERVICE_URL.replace(/\/$/, '')}/clips/${params.id}/retry`,
      {
        method: 'POST',
        headers: internalServiceHeaders(request, {
          'Idempotency-Key': parsed.data.idempotencyKey,
          ...(CLIP_SERVICE_TOKEN
            ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` }
            : {})
        }),
        signal: request.signal
      }
    )
  } catch (error) {
    console.error('clip-retry: failed to reach clip service', error)
    return NextResponse.json({ error: 'Failed to reach clip service' }, { status: 502 })
  }

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Clip service retry error (${response.status})`,
        detail: text.slice(0, 4000)
      },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
    )
  }
  let body: Record<string, unknown>
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid clip retry response' }, { status: 502 })
  }
  const clipId = typeof body.clipId === 'string' ? body.clipId : ''
  if (!CLIP_ID.test(clipId)) {
    return NextResponse.json({ error: 'Invalid clip retry identity' }, { status: 502 })
  }
  return NextResponse.json(
    {
      id: clipId,
      status: sanitizeStatus(body.status)
    },
    { status: response.status }
  )
}
