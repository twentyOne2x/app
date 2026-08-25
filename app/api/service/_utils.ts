import { NextResponse } from 'next/server'
import { internalServiceHeaders, tenantScopedPayload } from '@/lib/internal-service'

const IDEMPOTENCY_KEY = /^[!-~]{1,255}$/
const MAX_SERVICE_JSON_RESPONSE_BYTES = 1024 * 1024

export class BoundedJsonBodyError extends Error {}

export async function readBoundedJsonBody(
  request: Request,
  maximumBytes: number
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('maximum JSON body size is invalid')
  }
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType)) {
    throw new BoundedJsonBodyError('content type must be application/json')
  }
  const contentEncoding = request.headers.get('content-encoding')?.toLowerCase() ?? 'identity'
  if (contentEncoding !== 'identity') {
    throw new BoundedJsonBodyError('encoded request bodies are unsupported')
  }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new BoundedJsonBodyError('request body is too large')
  }
  if (!request.body) throw new BoundedJsonBodyError('request body is absent')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined)
        throw new BoundedJsonBodyError('request body is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new BoundedJsonBodyError('request body is not valid UTF-8 JSON')
  }
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const declared = response.headers.get('content-length')
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_SERVICE_JSON_RESPONSE_BYTES)
  ) {
    throw new Error('service response exceeded the JSON limit')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_SERVICE_JSON_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('service response exceeded the JSON limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

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

  let text: string
  try {
    text = await readBoundedResponseText(response)
  } catch (error) {
    console.error(`service-route: invalid response from ingestion backend for ${path}`, error)
    return NextResponse.json({ ok: false, error: 'invalid ingestion backend response' }, { status: 502 })
  }
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
