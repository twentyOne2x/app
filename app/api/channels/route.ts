import { NextResponse } from 'next/server'

function backendBaseUrl() {
  return (
    process.env.RAG_SERVICE_URL ??
    process.env.NEXT_PUBLIC_RAG_API_URL ??
    process.env.REACT_APP_BACKEND_URL ??
    null
  )
}

function buildBackendUrl(scope: string) {
  const base = backendBaseUrl()
  if (!base) return null
  const trimmed = base.replace(/\/$/, '')
  const params = new URLSearchParams()
  if (scope) params.set('scope', scope)
  params.set('namespace', scope)
  return `${trimmed}/channels?${params.toString()}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'videos'

  const backendUrl = buildBackendUrl(scope)
  if (!backendUrl) {
    return NextResponse.json({ channels: [] }, { status: 200 })
  }

  let response: Response
  try {
    response = await fetch(backendUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('channels-route: failed to reach backend', error)
    return NextResponse.json({ channels: [] }, { status: 200 })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => null)
    console.error('channels-route: backend error', response.status, text)
    return NextResponse.json({ channels: [] }, { status: 200 })
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    console.error('channels-route: invalid json from backend', error)
    return NextResponse.json({ channels: [] }, { status: 200 })
  }

  let channels: string[] = []
  if (Array.isArray(data)) {
    channels = data.filter((value): value is string => typeof value === 'string')
  } else if (data && typeof data === 'object') {
    const maybeChannels =
      (data as { channels?: unknown }).channels ??
      (data as { data?: unknown }).data ??
      (data as { results?: unknown }).results
    if (Array.isArray(maybeChannels)) {
      channels = maybeChannels.filter((value): value is string => typeof value === 'string')
    }
  }

  channels = Array.from(new Set(channels.map((channel) => channel.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )

  return NextResponse.json({ channels }, { status: 200 })
}
