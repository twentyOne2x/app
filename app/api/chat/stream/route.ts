import { NextResponse } from 'next/server'

function getBackendBaseUrl() {
  return (
    process.env.RAG_SERVICE_URL ??
    process.env.NEXT_PUBLIC_RAG_API_URL ??
    process.env.REACT_APP_BACKEND_URL ??
    null
  )
}

function buildBackendPayload(json: any) {
  const messages = Array.isArray(json?.messages) ? json.messages : []
  const lastMessage = messages.length ? messages[messages.length - 1] : null
  const messageContent =
    typeof json?.message === 'string'
      ? json.message
      : typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : 'No messages yet.'

  const payload: Record<string, unknown> = {
    message: messageContent,
    chat_history: messages
  }

  if (typeof json?.entryProfileCode === 'string' && json.entryProfileCode.trim()) {
    payload.entry_profile_code = json.entryProfileCode.trim()
  }

  if (json?.channel_filter) {
    payload.channel_filter = json.channel_filter
  }

  if (json?.scope) {
    payload.scope = json.scope
  }

  if (typeof json?.definition === 'boolean') {
    payload.definition = json.definition
  }

  return payload
}

export async function POST(request: Request) {
  let json: any
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const backendBaseUrl = getBackendBaseUrl()
  if (!backendBaseUrl) {
    return NextResponse.json(
      { error: 'missing_backend_url', message: 'Retrieval service is not configured.' },
      { status: 500 }
    )
  }

  const backendStreamUrl = `${backendBaseUrl.replace(/\/$/, '')}/chat/stream`

  let backendResponse: Response
  try {
    backendResponse = await fetch(backendStreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(buildBackendPayload(json))
    })
  } catch (error) {
    console.error('chat-stream: network error calling backend', error)
    return NextResponse.json(
      { error: 'network_error', message: 'Failed to reach retrieval service.' },
      { status: 502 }
    )
  }

  if (!backendResponse.ok || !backendResponse.body) {
    const text = await backendResponse.text().catch(() => backendResponse.statusText)
    console.error(
      'chat-stream: backend responded with error',
      backendResponse.status,
      text
    )
    return NextResponse.json(
      {
        error: 'backend_error',
        message: text || backendResponse.statusText || 'Backend returned an error.',
        status: backendResponse.status
      },
      { status: backendResponse.status }
    )
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = backendResponse.body!.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) controller.enqueue(value)
        }
      } catch (error) {
        console.error('chat-stream: error piping backend stream', error)
        controller.error(error)
      } finally {
        controller.close()
      }
    },
    cancel() {
      backendResponse.body?.cancel().catch(() => {})
    }
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
