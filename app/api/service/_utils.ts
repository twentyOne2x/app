import { NextResponse } from 'next/server'

function ingestionBaseUrl() {
  return process.env.INGESTION_SERVICE_URL ?? process.env.NEXT_PUBLIC_INGESTION_API_URL ?? null
}

function ingestionAuthHeader() {
  const user = process.env.INGESTION_BASIC_AUTH_USER
  const password = process.env.INGESTION_BASIC_AUTH_PASSWORD
  if (!user || !password) return null
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
}

function ingestionHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  const auth = ingestionAuthHeader()
  if (auth) {
    headers.set('Authorization', auth)
  }
  return headers
}

function copyTrustedProxyHeaders(request: Request, headers: Headers) {
  const acpSharedSecret = request.headers.get('x-acp-shared-secret')
  if (acpSharedSecret) {
    headers.set('x-acp-shared-secret', acpSharedSecret)
  }

  const opsSharedSecret = request.headers.get('x-ops-shared-secret')
  if (opsSharedSecret) {
    headers.set('x-ops-shared-secret', opsSharedSecret)
  }

  const authorization = request.headers.get('authorization')
  if (authorization && !headers.has('Authorization')) {
    headers.set('Authorization', authorization)
  }
}

export function buildIngestionUrl(path: string) {
  const base = ingestionBaseUrl()
  if (!base) return null
  const trimmed = base.replace(/\/$/, '')
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`
}

export async function proxyJsonRequest(request: Request, path: string) {
  const ingestionUrl = buildIngestionUrl(path)
  if (!ingestionUrl) {
    return NextResponse.json(
      { ok: false, error: 'ingestion backend is not configured (missing INGESTION_SERVICE_URL)' },
      { status: 503 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
  }

  let response: Response
  try {
    const headers = ingestionHeaders({ 'Content-Type': 'application/json' })
    copyTrustedProxyHeaders(request, headers)
    response = await fetch(ingestionUrl, {
      method: request.method,
      headers,
      body: JSON.stringify(payload)
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

export async function proxyGetRequest(path: string, request?: Request) {
  const ingestionUrl = buildIngestionUrl(path)
  if (!ingestionUrl) {
    return NextResponse.json(
      { ok: false, error: 'ingestion backend is not configured (missing INGESTION_SERVICE_URL)' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    const headers = ingestionHeaders({ 'Content-Type': 'application/json' })
    if (request) {
      copyTrustedProxyHeaders(request, headers)
    }
    response = await fetch(ingestionUrl, {
      method: 'GET',
      headers
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

export async function proxyGetPassthrough(path: string) {
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
      headers: ingestionHeaders()
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
  for (const [key, value] of Array.from(response.headers.entries())) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    headers
  })
}
