import { NextResponse } from 'next/server'
import { internalServiceHeaders, tenantScopedPayload } from '@/lib/internal-service'

const IDEMPOTENCY_KEY = /^[!-~]{1,255}$/

function forwardedIdempotencyKey(request: Request): string | null {
  const value = request.headers.get('idempotency-key')
  if (value === null) return null
  if (!IDEMPOTENCY_KEY.test(value) || value.includes(',')) {
    throw new Error('invalid_idempotency_key')
  }
  return value
}

function ingestionBaseUrl() {
  return process.env.INGESTION_SERVICE_URL ?? process.env.NEXT_PUBLIC_INGESTION_API_URL ?? null
}

export function buildIngestionUrl(path: string) {
  const base = ingestionBaseUrl()
  if (!base) return null
  const trimmed = base.replace(/\/$/, '')
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`
}

export async function proxyJsonRequest(request: Request, path: string) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
  }

  return proxyJsonPayload(request, path, tenantScopedPayload(request, payload))
}

export async function proxyJsonPayload(request: Request, path: string, payload: unknown) {
  const ingestionUrl = buildIngestionUrl(path)
  if (!ingestionUrl) {
    return NextResponse.json(
      { ok: false, error: 'ingestion backend is not configured (missing INGESTION_SERVICE_URL)' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    const idempotencyKey = forwardedIdempotencyKey(request)
    const headers = internalServiceHeaders(request, {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    })
    response = await fetch(ingestionUrl, {
      method: request.method,
      headers,
      body: JSON.stringify(payload),
      signal: request.signal
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_idempotency_key') {
      return NextResponse.json({ ok: false, error: 'invalid idempotency key' }, { status: 400 })
    }
    console.error(`service-route: failed to reach ingestion backend for ${path}`, error)
    return NextResponse.json({ ok: false, error: 'failed to reach ingestion backend' }, { status: 502 })
  }

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `ingestion backend error (${response.status})`,
        detail: text.slice(0, 4000)
      },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
    )
  }

  try {
    return NextResponse.json(text ? JSON.parse(text) : { ok: true }, { status: response.status })
  } catch {
    return NextResponse.json({ ok: true, raw: text }, { status: response.status })
  }
}

export async function proxyGetRequest(path: string, request: Request) {
  const ingestionUrl = buildIngestionUrl(path)
  if (!ingestionUrl) {
    return NextResponse.json(
      { ok: false, error: 'ingestion backend is not configured (missing INGESTION_SERVICE_URL)' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    const headers = internalServiceHeaders(request, { 'Content-Type': 'application/json' })
    response = await fetch(ingestionUrl, {
      method: 'GET',
      headers,
      signal: request.signal
    })
  } catch (error) {
    console.error(`service-route: failed to reach ingestion backend for ${path}`, error)
    return NextResponse.json({ ok: false, error: 'failed to reach ingestion backend' }, { status: 502 })
  }

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `ingestion backend error (${response.status})`,
        detail: text.slice(0, 4000)
      },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
    )
  }

  try {
    return NextResponse.json(text ? JSON.parse(text) : { ok: true }, { status: response.status })
  } catch {
    return NextResponse.json({ ok: true, raw: text }, { status: response.status })
  }
}

export async function proxyGetPassthrough(path: string, request: Request) {
  const ingestionUrl = buildIngestionUrl(path)
  if (!ingestionUrl) {
    return NextResponse.json(
      { ok: false, error: 'ingestion backend is not configured (missing INGESTION_SERVICE_URL)' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    response = await fetch(ingestionUrl, {
      method: 'GET',
      headers: internalServiceHeaders(request),
      signal: request.signal
    })
  } catch (error) {
    console.error(`service-route: failed to reach ingestion backend for ${path}`, error)
    return NextResponse.json({ ok: false, error: 'failed to reach ingestion backend' }, { status: 502 })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return NextResponse.json(
      {
        ok: false,
        error: `ingestion backend error (${response.status})`,
        detail: text.slice(0, 4000)
      },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
    )
  }

  const headers = new Headers()
  for (const key of [
    'accept-ranges',
    'cache-control',
    'content-disposition',
    'content-length',
    'content-type',
    'etag',
    'last-modified'
  ]) {
    const value = response.headers.get(key)
    if (value) headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    headers
  })
}
