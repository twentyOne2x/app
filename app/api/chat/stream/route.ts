import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  applyChatAccessResponse,
  beginChatAccess,
  finalizeChatAccess
} from '@/lib/chat-access'
import {
  authoritativeRequestUserId,
  internalServiceHeaders,
  isProductionRuntime,
  tenantScopedPayload,
  TrustedGatewayIdentityError
} from '@/lib/internal-service'
import { chatStore } from '@/lib/chat-store'
import { requestChatScope, type ChatScope } from '@/lib/chat-scope'
import type { Chat, DiagnosticsPayload } from '@/lib/types'
import {
  extractSourcesBlock,
  nanoid,
  normalizeMetadataEntries,
  parseMetadata,
  parseMetadataEntriesV2FromFinalKept,
  type ParsedMetadataEntryV2
} from '@/lib/utils'

export const maxDuration = 300

const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_CHAT_MESSAGES = 512
const MAX_MESSAGE_CHARACTERS = 1024 * 1024
const MAX_CHAT_HISTORY_CHARACTERS = 8 * 1024 * 1024
const MAX_SSE_STREAM_BYTES = 8 * 1024 * 1024
const MAX_SSE_EVENT_CHARACTERS = 4 * 1024 * 1024

type SseEvent = Record<string, unknown> & {
  type: 'progress' | 'result' | 'error'
}

type SseBoundary = Readonly<{ index: number; length: number }>

class StreamProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'StreamProtocolError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nextSseBoundary(buffer: string): SseBoundary | null {
  const lfIndex = buffer.indexOf('\n\n')
  const crlfIndex = buffer.indexOf('\r\n\r\n')
  if (lfIndex === -1 && crlfIndex === -1) return null
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 }
  }
  return { index: lfIndex, length: 2 }
}

function parseSseEvent(rawEvent: string): SseEvent {
  if (!rawEvent || rawEvent.length > MAX_SSE_EVENT_CHARACTERS) {
    throw new StreamProtocolError(
      'stream_event_too_large',
      'The retrieval stream produced an invalid event.'
    )
  }

  const lines = rawEvent.split(/\r?\n/)
  if (lines.length !== 1 || !lines[0].startsWith('data: ')) {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced an invalid event.'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(lines[0].slice('data: '.length))
  } catch {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced invalid JSON.'
    )
  }

  if (
    !isRecord(parsed) ||
    !['progress', 'result', 'error'].includes(String(parsed.type))
  ) {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced an unsupported event.'
    )
  }

  if (parsed.type === 'progress' && !isRecord(parsed.event)) {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced invalid progress data.'
    )
  }
  if (
    parsed.type === 'result' &&
    (typeof parsed.response !== 'string' || !parsed.response.trim())
  ) {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced an empty result.'
    )
  }
  if (
    parsed.type === 'error' &&
    (typeof parsed.error !== 'string' || !parsed.error.trim())
  ) {
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced an invalid error.'
    )
  }

  return parsed as SseEvent
}

function encodeSseEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function errorSseEvent(code: string, message: string): Uint8Array {
  return encodeSseEvent({ type: 'error', code, error: message })
}

function processResponseContent(content: string): string {
  return content
    .replace(/ICM \(Internet Capital Markets\)/g, 'ICM')
    .replace(/Internet Capital Markets \(ICM\)/g, 'ICM')
    .replace(/Internet Capital Markets/g, 'ICM')
}

function sanitizeMessages(value: unknown): Chat['messages'] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_CHAT_MESSAGES
  ) {
    return null
  }

  const allowedRoles = new Set<Chat['messages'][number]['role']>([
    'system',
    'user',
    'assistant',
    'data',
    'tool',
    'function'
  ])
  const sanitized: Chat['messages'] = []
  let totalCharacters = 0
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.role !== 'string' ||
      !allowedRoles.has(candidate.role as Chat['messages'][number]['role']) ||
      typeof candidate.content !== 'string' ||
      candidate.content.length > MAX_MESSAGE_CHARACTERS
    ) {
      return null
    }
    totalCharacters += candidate.content.length
    if (totalCharacters > MAX_CHAT_HISTORY_CHARACTERS) return null
    sanitized.push({
      role: candidate.role as Chat['messages'][number]['role'],
      content: candidate.content,
      ...(typeof candidate.id === 'string' && MESSAGE_ID.test(candidate.id)
        ? { id: candidate.id }
        : {})
    })
  }

  const last = sanitized[sanitized.length - 1]
  return last.role === 'user' && String(last.content).trim() ? sanitized : null
}

function parseStructuredMetadata(event: SseEvent): ParsedMetadataEntryV2[] {
  try {
    if (event.structured_metadata !== undefined) {
      if (!Array.isArray(event.structured_metadata)) {
        throw new StreamProtocolError(
          'stream_malformed_event',
          'The retrieval stream produced invalid structured metadata.'
        )
      }
      if (event.structured_metadata.length > 0) {
        if (!event.structured_metadata.every(isRecord)) {
          throw new StreamProtocolError(
            'stream_malformed_event',
            'The retrieval stream produced invalid structured metadata.'
          )
        }
        return normalizeMetadataEntries(
          event.structured_metadata as unknown as ParsedMetadataEntryV2[]
        )
      }
    }

    const diagnostics = isRecord(event.diagnostics)
      ? (event.diagnostics as DiagnosticsPayload)
      : null
    const finalKeptRaw = diagnostics?.final_kept ?? event.final_kept
    if (Array.isArray(finalKeptRaw) && finalKeptRaw.length > 0) {
      const parsed = parseMetadataEntriesV2FromFinalKept(finalKeptRaw as any)
      if (parsed.length) return parsed
    }

    const response = String(event.response ?? '')
    const sourcesBlock = extractSourcesBlock(response)
    if (sourcesBlock) {
      const parsed = parseMetadata(sourcesBlock, response)
      if (parsed.length) return parsed
    }
    if (typeof event.formatted_metadata === 'string') {
      return parseMetadata(event.formatted_metadata, response)
    }
    return []
  } catch (error) {
    if (error instanceof StreamProtocolError) throw error
    console.error('chat-stream: failed to parse structured metadata', error)
    throw new StreamProtocolError(
      'stream_malformed_event',
      'The retrieval stream produced invalid structured metadata.'
    )
  }
}

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

function buildBackendPayload(json: any, messages: Chat['messages']) {
  const lastMessage = messages.length ? messages[messages.length - 1] : null
  const messageContent =
    typeof lastMessage?.content === 'string'
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

  const messages = sanitizeMessages(json?.messages)
  if (!messages) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const id = json.id ?? nanoid()
  if (typeof id !== 'string' || !CHAT_ID.test(id)) {
    return NextResponse.json({ error: 'invalid_chat_id' }, { status: 400 })
  }
  const title =
    typeof messages[0]?.content === 'string'
      ? messages[0].content.substring(0, 100) || 'New Chat'
      : 'New Chat'
  const createdAt = Date.now()
  const path = `/chat/${id}`
  const entryProfileCode =
    typeof json.entryProfileCode === 'string' && json.entryProfileCode.trim()
      ? json.entryProfileCode.trim()
      : undefined

  const session = await auth()
  let userId: string | null
  try {
    userId = authoritativeRequestUserId(request, session?.user?.id)
  } catch (error) {
    if (error instanceof TrustedGatewayIdentityError) {
      return NextResponse.json({ error: 'invalid_gateway_identity' }, { status: 401 })
    }
    throw error
  }
  const gatewayScope = requestChatScope(request)
  if (
    isProductionRuntime() &&
    (!userId || !gatewayScope || gatewayScope.userId !== userId)
  ) {
    return NextResponse.json({ error: 'invalid_gateway_identity' }, { status: 401 })
  }
  const persistenceScope: ChatScope | null =
    gatewayScope ?? (userId ? { userId, tenantId: `local:${userId}` } : null)

  const accessCheck = await beginChatAccess(request, userId)
  if (!accessCheck.ok) {
    return accessCheck.response
  }
  if (!userId || !persistenceScope || persistenceScope.userId !== userId) {
    return applyChatAccessResponse(
      NextResponse.json(
        {
          error: 'persistence_identity_required',
          message: 'A durable chat identity is required.'
        },
        { status: 401 }
      ),
      accessCheck.context,
      accessCheck.state
    )
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
        body: JSON.stringify(
          tenantScopedPayload(request, buildBackendPayload(json, messages))
        )
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

  const backendContentType = backendResponse.headers.get('content-type') ?? ''
  if (!/^text\/event-stream(?:\s*;|$)/i.test(backendContentType)) {
    await backendResponse.body.cancel().catch(() => undefined)
    return applyChatAccessResponse(
      NextResponse.json(
        {
          error: 'invalid_stream_content_type',
          message: 'Retrieval service returned an invalid stream.'
        },
        { status: 502 }
      ),
      accessCheck.context,
      accessCheck.state
    )
  }

  const accessState = await finalizeChatAccess(accessCheck.context)

  let backendReader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      backendReader = backendResponse.body!.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let buffer = ''
      let streamBytes = 0
      let terminalEvent: SseEvent | null = null

      const enqueue = (value: Uint8Array) => {
        if (!cancelled) controller.enqueue(value)
      }

      const consumeBufferedEvents = () => {
        while (true) {
          const boundary = nextSseBoundary(buffer)
          if (!boundary) break

          const rawEvent = buffer.slice(0, boundary.index)
          buffer = buffer.slice(boundary.index + boundary.length)
          const event = parseSseEvent(rawEvent)

          if (terminalEvent) {
            if (event.type === 'result' || event.type === 'error') {
              throw new StreamProtocolError(
                'stream_duplicate_terminal',
                'The retrieval stream produced multiple terminal events.'
              )
            }
            throw new StreamProtocolError(
              'stream_event_after_terminal',
              'The retrieval stream continued after its terminal event.'
            )
          }

          if (event.type === 'progress') {
            enqueue(encodeSseEvent(event))
          } else {
            terminalEvent = event
          }
        }

        if (buffer.length > MAX_SSE_EVENT_CHARACTERS) {
          throw new StreamProtocolError(
            'stream_event_too_large',
            'The retrieval stream produced an oversized event.'
          )
        }
      }

      try {
        while (true) {
          const { value, done } = await backendReader.read()
          if (done) break
          if (!value) continue
          streamBytes += value.byteLength
          if (streamBytes > MAX_SSE_STREAM_BYTES) {
            throw new StreamProtocolError(
              'stream_too_large',
              'The retrieval stream exceeded its size limit.'
            )
          }
          try {
            buffer += decoder.decode(value, { stream: true })
          } catch {
            throw new StreamProtocolError(
              'stream_malformed_event',
              'The retrieval stream was not valid UTF-8.'
            )
          }
          consumeBufferedEvents()
        }

        try {
          buffer += decoder.decode()
        } catch {
          throw new StreamProtocolError(
            'stream_malformed_event',
            'The retrieval stream was not valid UTF-8.'
          )
        }
        consumeBufferedEvents()

        if (buffer.length !== 0) {
          throw new StreamProtocolError(
            'stream_malformed_event',
            'The retrieval stream ended with an incomplete event.'
          )
        }
        if (!terminalEvent) {
          throw new StreamProtocolError(
            'stream_no_terminal_result',
            'The retrieval stream ended without a terminal result.'
          )
        }

        const completedEvent = terminalEvent as SseEvent
        if (completedEvent.type === 'error') {
          enqueue(
            encodeSseEvent({
              type: 'error',
              error: completedEvent.error,
              ...(typeof completedEvent.code === 'string'
                ? { code: completedEvent.code }
                : {})
            })
          )
          return
        }

        const processedResponse = processResponseContent(
          String(completedEvent.response)
        )
        const structuredMetadata = parseStructuredMetadata(completedEvent)
        const payload: Chat = {
          id,
          title,
          userId,
          createdAt,
          path,
          messages: [
            ...messages,
            { content: processedResponse, role: 'assistant' }
          ],
          structured_metadata: structuredMetadata,
          entryProfileCode
        }

        let committedChat: Chat
        try {
          committedChat = await chatStore().put(persistenceScope, payload)
        } catch (error) {
          console.error('chat-stream: failed to persist terminal result', error)
          throw new StreamProtocolError(
            'chat_persistence_failed',
            'Failed to persist chat.'
          )
        }

        const committedAssistant =
          committedChat.messages[committedChat.messages.length - 1]
        if (
          committedChat.id !== id ||
          committedChat.userId !== userId ||
          !committedAssistant ||
          committedAssistant.role !== 'assistant' ||
          typeof committedAssistant.content !== 'string' ||
          !Array.isArray(committedChat.structured_metadata)
        ) {
          throw new StreamProtocolError(
            'chat_persistence_failed',
            'Failed to verify the persisted chat.'
          )
        }

        enqueue(
          encodeSseEvent({
            type: 'result',
            response: committedAssistant.content,
            structured_metadata: committedChat.structured_metadata,
            diagnostics: isRecord(completedEvent.diagnostics)
              ? completedEvent.diagnostics
              : null,
            ...(typeof completedEvent.message_id === 'string'
              ? { message_id: completedEvent.message_id }
              : {})
          })
        )
      } catch (error) {
        await backendReader.cancel().catch(() => undefined)
        if (!cancelled) {
          const code =
            error instanceof StreamProtocolError
              ? error.code
              : 'stream_upstream_failure'
          const message =
            error instanceof StreamProtocolError
              ? error.message
              : 'The retrieval stream failed.'
          console.error('chat-stream: terminal stream failure', { code }, error)
          enqueue(errorSseEvent(code, message))
        }
      } finally {
        if (!cancelled) controller.close()
      }
    },
    async cancel(reason) {
      cancelled = true
      await backendReader?.cancel(reason).catch(() => undefined)
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
