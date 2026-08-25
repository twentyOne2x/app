import { NextResponse } from 'next/server'
import { internalServiceHeaders } from '@/lib/internal-service'
import { isProductionRuntime } from '@/lib/internal-service'

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
    return isProductionRuntime()
      ? NextResponse.json({ error: 'retrieval_service_unavailable' }, { status: 503 })
      : NextResponse.json({ channels: [] }, { status: 200 })
  }

  let response: Response
  try {
    response = await fetch(backendUrl, {
      method: 'GET',
      headers: internalServiceHeaders(request, { 'Content-Type': 'application/json' })
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

  const channelEntries = Array.isArray(data)
    ? data
    : Array.isArray((data as { channels?: unknown }).channels)
    ? (data as { channels: unknown[] }).channels
    : Array.isArray((data as { channelDetails?: unknown }).channelDetails)
    ? (data as { channelDetails: unknown[] }).channelDetails
    : []

  const channelNames = channelEntries
    .map((entry: any) => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry.name === 'string') return entry.name.trim()
      return ''
    })
    .filter(Boolean)

  const channels = Array.from(new Set(channelNames)).sort((a, b) => a.localeCompare(b))

  const defaultsSource =
    data && typeof data === 'object'
      ? ((data as { defaultSelected?: unknown }).defaultSelected ??
          (data as { default_selected?: unknown }).default_selected)
      : undefined
  const defaultSelected = Array.from(
    new Set(
      (Array.isArray(defaultsSource) ? defaultsSource : channels).map((name: any) =>
        typeof name === 'string' ? name.trim() : ''
      )
    )
  ).filter(Boolean)

  const responseBody = {
    scope:
      data && typeof (data as { scope?: unknown }).scope === 'string'
        ? ((data as { scope: string }).scope as string)
        : scope,
    channels,
    defaultSelected
  }

  return NextResponse.json(responseBody, { status: 200 })
}
