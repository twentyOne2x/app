import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  applyChatAccessResponse,
  beginChatAccess,
  finalizeChatAccess
} from '@/lib/chat-access'
import { internalServiceHeaders, tenantScopedPayload } from '@/lib/internal-service'

export const maxDuration = 300

function getBackendBaseUrl() {
  return (
    process.env.RAG_SERVICE_URL ??
    process.env.NEXT_PUBLIC_RAG_API_URL ??
    process.env.REACT_APP_BACKEND_URL ??
    null
  )
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function backendStreamCandidates(baseUrl: string): string[] {
  const base = trimTrailingSlashes(baseUrl.trim())
  if (!base) return []

  const lower = base.toLowerCase()
  if (lower.endsWith('/chat/stream')) return [base]
  if (lower.endsWith('/chat')) return [`${base}/stream`]

  return [`${base}/chat/stream`]
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

  const session = await auth()
  const userId = session?.user?.id ?? null
  const accessCheck = await beginChatAccess(request, userId)
  if (!accessCheck.ok) {
    return accessCheck.response
  }

  const backendBaseUrl = getBackendBaseUrl()
  if (!backendBaseUrl) {
    return applyChatAccessResponse(
      NextResponse.json(
        { error: 'missing_backend_url', message: 'Retrieval service is not configured.' },
        { status: 500 }
      ),
      accessCheck.context,
      accessCheck.state
    )
  }

  const backendCandidates = backendStreamCandidates(backendBaseUrl)
  if (!backendCandidates.length) {
    return applyChatAccessResponse(
      NextResponse.json(
        { error: 'missing_backend_url', message: 'Retrieval service is not configured.' },
        { status: 500 }
      ),
      accessCheck.context,
      accessCheck.state
    )
  }

  let backendResponse: Response | null = null
  let backendStreamUrl = backendCandidates[0]
  let lastErrorText: string | null = null

  for (let i = 0; i < backendCandidates.length; i += 1) {
    const candidateUrl = backendCandidates[i]
    const isLast = i === backendCandidates.length - 1
    backendStreamUrl = candidateUrl
    try {
      const response = await fetch(candidateUrl, {
        method: 'POST',
        headers: internalServiceHeaders(request, {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        }),
        body: JSON.stringify(tenantScopedPayload(request, buildBackendPayload(json)))
      })
      if (response.status === 404 && !isLast) {
        const text = await response.text().catch(() => response.statusText)
        lastErrorText = text || response.statusText
        console.warn('chat-stream: backend candidate returned 404, trying fallback', {
          candidateUrl
        })
        continue
      }
      backendResponse = response
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network_failure'
      lastErrorText = message
      if (!isLast) {
        console.warn('chat-stream: backend candidate network failure, trying fallback', {
          candidateUrl,
          error: message
        })
        continue
      }
    }
  }

  if (!backendResponse) {
    console.error('chat-stream: network error calling backend', {
      backendCandidates,
      error: lastErrorText
    })
    return applyChatAccessResponse(
      NextResponse.json(
        { error: 'network_error', message: 'Failed to reach retrieval service.' },
        { status: 502 }
      ),
      accessCheck.context,
      accessCheck.state
    )
  }

  if (!backendResponse.ok || !backendResponse.body) {
    const text = await backendResponse.text().catch(() => backendResponse.statusText)
    console.error(
      'chat-stream: backend responded with error',
      backendResponse.status,
      text,
      { backendStreamUrl }
    )
    return applyChatAccessResponse(
      NextResponse.json(
        {
          error: 'backend_error',
          message: text || backendResponse.statusText || 'Backend returned an error.',
          status: backendResponse.status
        },
        { status: backendResponse.status }
      ),
      accessCheck.context,
      accessCheck.state
    )
  }

  const accessState = await finalizeChatAccess(accessCheck.context)

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

  return applyChatAccessResponse(new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  }), accessCheck.context, accessState)
}
