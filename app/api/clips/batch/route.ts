import { NextResponse } from 'next/server'
import { createLocalBatch } from './local-service'
import { internalServiceHeaders, isProductionRuntime, tenantScopedPayload } from '@/lib/internal-service'

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function serviceUrl(path: string) {
  if (!CLIP_SERVICE_URL) return null
  return `${CLIP_SERVICE_URL.replace(/\/$/, '')}${path}`
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const url = serviceUrl('/clips/batch')
  if (!url) {
    if (isProductionRuntime()) {
      return NextResponse.json({ error: 'clip_service_unavailable' }, { status: 503 })
    }
    try {
      const response = createLocalBatch(body as any)
      return NextResponse.json(response, { status: 200 })
    } catch (error) {
      console.error('clips-batch: local error', error)
      return NextResponse.json(
        { error: 'local_batch_error', message: error instanceof Error ? error.message : 'Failed to create local batch.' },
        { status: 400 }
      )
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: internalServiceHeaders(request, {
        'Content-Type': 'application/json',
        ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
      }),
      body: JSON.stringify(tenantScopedPayload(request, body))
    })
  } catch (error) {
    console.error('clips-batch: network error', error)
    return NextResponse.json(
      { error: 'network_error', message: 'Failed to reach clip service.' },
      { status: 502 }
    )
  }

  if (response.status === 404) {
    return NextResponse.json(
      { error: 'not_found', message: 'Batch endpoint not available on clip service.' },
      { status: 501 }
    )
  }

  const text = await response.text()
  const headers = { 'Content-Type': response.headers.get('content-type') ?? 'application/json' }

  if (!response.ok) {
    console.error('clips-batch: backend error', response.status, text)
    return new NextResponse(text || response.statusText, { status: response.status, headers })
  }

  return new NextResponse(text, { status: response.status, headers })
}
