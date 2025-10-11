import { NextResponse } from 'next/server'

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function serviceUrl(path: string) {
  if (!CLIP_SERVICE_URL) return null
  return `${CLIP_SERVICE_URL.replace(/\/$/, '')}${path}`
}

export async function POST(request: Request) {
  const url = serviceUrl('/clips/batch')
  if (!url) {
    return NextResponse.json(
      { error: 'not_implemented', message: 'Clip service URL not configured.' },
      { status: 501 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
      },
      body: JSON.stringify(body)
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
