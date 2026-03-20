import { NextResponse } from 'next/server'

function ingestionBaseUrl() {
  return process.env.INGESTION_SERVICE_URL ?? process.env.NEXT_PUBLIC_INGESTION_API_URL ?? null
}

function buildIngestionUrl(path: string) {
  const base = ingestionBaseUrl()
  if (!base) return null
  const trimmed = base.replace(/\/$/, '')
  return `${trimmed}${path.startsWith('/') ? path : `/${path}`}`
}

export async function POST(request: Request) {
  const ingestionUrl = buildIngestionUrl('/index/youtube')
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
    response = await fetch(ingestionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.error('index-youtube-route: failed to reach ingestion backend', error)
    return NextResponse.json({ ok: false, error: 'failed to reach ingestion backend' }, { status: 502 })
  }

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: `ingestion backend error (${response.status})`, detail: text.slice(0, 4000) },
      { status: 502 }
    )
  }

  try {
    const data = text ? JSON.parse(text) : null
    return NextResponse.json(data ?? { ok: true }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: true, raw: text }, { status: 200 })
  }
}

