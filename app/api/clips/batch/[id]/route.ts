import { NextResponse } from 'next/server'

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL
const CLIP_SERVICE_TOKEN = process.env.CLIP_SERVICE_TOKEN

function serviceUrl(path: string) {
  if (!CLIP_SERVICE_URL) return null
  return `${CLIP_SERVICE_URL.replace(/\/$/, '')}${path}`
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const url = serviceUrl(`/clips/batch/${params.id}`)
  if (!url) {
    return NextResponse.json(
      { error: 'not_implemented', message: 'Clip service URL not configured.' },
      { status: 501 }
    )
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
      }
    })
  } catch (error) {
    console.error('clips-batch: poll error', error)
    return NextResponse.json(
      { error: 'network_error', message: 'Failed to reach clip service.' },
      { status: 502 }
    )
  }

  const text = await response.text()
  const headers = { 'Content-Type': response.headers.get('content-type') ?? 'application/json' }

  if (!response.ok) {
    if (response.status === 404) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (response.status === 405 || response.status === 501) {
      return NextResponse.json(
        { error: 'not_implemented', message: 'Batch polling not supported by clip service.' },
        { status: 501 }
      )
    }
    console.error('clips-batch: backend poll error', response.status, text)
    return new NextResponse(text || response.statusText, { status: response.status, headers })
  }

  return new NextResponse(text, { status: response.status, headers })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = serviceUrl(`/clips/batch/${params.id}`)
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
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(CLIP_SERVICE_TOKEN ? { Authorization: `Bearer ${CLIP_SERVICE_TOKEN}` } : {})
      },
      body: JSON.stringify(body)
    })
  } catch (error) {
    console.error('clips-batch: retry network error', error)
    return NextResponse.json(
      { error: 'network_error', message: 'Failed to reach clip service.' },
      { status: 502 }
    )
  }

  const text = await response.text()
  const headers = { 'Content-Type': response.headers.get('content-type') ?? 'application/json' }

  if (!response.ok) {
    if (response.status === 404) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (response.status === 405 || response.status === 501) {
      return NextResponse.json(
        { error: 'not_implemented', message: 'Clip service does not support retry.' },
        { status: 501 }
      )
    }
    console.error('clips-batch: retry backend error', response.status, text)
    return new NextResponse(text || response.statusText, { status: response.status, headers })
  }

  return new NextResponse(text, { status: response.status, headers })
}
