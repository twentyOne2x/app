import { kv } from '@vercel/kv'
import { randomUUID } from 'crypto'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import {
  extractSourcesBlock,
  parseMetadata,
  type ParsedMetadataEntryV2
} from '@/lib/utils'
import { putLocalChat } from '@/lib/local-chat-store'
import type { DiagnosticsPayload } from '@/lib/types'

export const maxDuration = 300

const KV_REST_API_URL = process.env.KV_REST_API_URL
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN
const isKvConfigured = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN)

interface ChatResponseDiagnostics extends DiagnosticsPayload {
  backend_status?: number
  backend_error?: string
  backend_url?: string
}

export async function POST(req: Request) {
  let json: any
  try {
    json = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { messages } = json
  const channelFilter = json.channel_filter ?? undefined
  const clientTraceId: string | null =
    typeof json.client_trace_id === 'string' && json.client_trace_id.trim().length
      ? json.client_trace_id.trim()
      : null
  const entryProfileCode: string | undefined =
    typeof json.entryProfileCode === 'string' && json.entryProfileCode.trim().length
      ? json.entryProfileCode.trim()
      : undefined
  const traceId = clientTraceId ?? (typeof json.id === 'string' ? String(json.id) : null) ?? randomUUID()

  const session = await auth()
  const userId = session?.user?.id ?? null

  console.debug('chat-route: request received', {
    traceId,
    clientTraceId,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    entryProfileCode,
    channelFilter: channelFilter ?? null,
    userId
  })

  const title = messages?.[0]?.content?.substring(0, 100) || 'New Chat'
  const id = json.id ?? nanoid()
  const createdAt = Date.now()
  const path = `/chat/${id}`

  const processResponseContent = (content: string): string =>
    (content || '')
      .replace(/ICM \(Internet Capital Markets\)/g, 'ICM')
      .replace(/Internet Capital Markets \(ICM\)/g, 'ICM')
      .replace(/Internet Capital Markets/g, 'ICM')

  const persistAndRespond = async (
    assistantContent: string,
    structuredMetadata: ParsedMetadataEntryV2[],
    diagnostics: ChatResponseDiagnostics | null,
    requestId: string | null,
    trace: string,
    clientTrace: string | null
  ): Promise<Response> => {
    const processedResponseContent = processResponseContent(assistantContent)
    const payload = {
      id,
      title,
      userId,
      createdAt,
      path,
      messages: [...(messages || []), { content: processedResponseContent, role: 'assistant' }],
      structured_metadata: structuredMetadata,
      entryProfileCode
    }

    if (userId && isKvConfigured) {
      try {
        await kv.hmset(`chat:${id}`, payload)
        await kv.zadd(`user:chat:${userId}`, { score: createdAt, member: `chat:${id}` })
      } catch (error) {
        console.error('chat-route: failed to persist chat metadata', { traceId: trace }, error)
        return new Response('Failed to persist chat', { status: 500 })
      }
    } else if (userId && !isKvConfigured) {
      console.warn('chat-route: KV not configured, caching chat in memory', { traceId: trace })
      putLocalChat(payload as any)
    }

    console.debug('chat-route: building response payload', {
      traceId: trace,
      metadataCount: structuredMetadata.length,
      diagnostics: Boolean(diagnostics),
      persisted: Boolean(userId && isKvConfigured)
    })

    const responsePayload = {
      id: payload.id,
      title: payload.title,
      userId: payload.userId,
      createdAt: payload.createdAt,
      path: payload.path,
      message: { content: processedResponseContent, role: 'assistant' },
      structured_metadata: payload.structured_metadata,
      entryProfileCode: payload.entryProfileCode,
      diagnostics,
      request_id: requestId,
      client_trace_id: clientTrace
    }

    return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } })
  }

  const backendBaseUrl =
    process.env.RAG_SERVICE_URL ?? process.env.NEXT_PUBLIC_RAG_API_URL ?? process.env.REACT_APP_BACKEND_URL

  if (!backendBaseUrl) {
    console.error('chat-route: missing RAG backend URL environment variable', { traceId })
    return persistAndRespond(
      'The retrieval service is not configured yet. Please try again later.',
      [],
      {
        backend_error: 'missing_backend_url'
      },
      null,
      traceId,
      clientTraceId
    )
  }

  const backendChatUrl = `${backendBaseUrl.replace(/\/$/, '')}/chat`
  console.debug('chat-route: forwarding request to backend', { traceId, backendChatUrl })

  let chatResponse: Response
  const backendRequestStartedAt = Date.now()
  try {
    chatResponse = await fetch(backendChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messages?.length ? messages[messages.length - 1].content : 'No messages yet.',
        chat_history: messages,
        entry_profile_code: entryProfileCode,
        channel_filter: channelFilter
      })
    })
  } catch (error) {
    console.error('chat-route: network error calling backend', { traceId }, error)
    return persistAndRespond(
      'We could not reach the retrieval service. Please retry in a moment.',
      [],
      {
        backend_error: error instanceof Error ? error.message : 'network_failure',
        backend_url: backendChatUrl
      },
      null,
      traceId,
      clientTraceId
    )
  }

  console.debug('chat-route: backend responded', {
    traceId,
    status: chatResponse.status,
    durationMs: Date.now() - backendRequestStartedAt
  })

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text().catch(() => chatResponse.statusText)
    console.error('chat-route: backend responded with error', {
      traceId,
      status: chatResponse.status,
      error: errorText
    })
    return persistAndRespond(
      `The retrieval service returned an error (HTTP ${chatResponse.status}). Please try again shortly.`,
      [],
      {
        backend_error: errorText,
        backend_status: chatResponse.status,
        backend_url: backendChatUrl
      },
      null,
      traceId,
      clientTraceId
    )
  }

  let responseBody: any
  try {
    responseBody = await chatResponse.json()
    console.debug('chat-route: backend json payload', {
      traceId,
      responseBody
    })
  } catch (error) {
    console.error('chat-route: failed to parse backend JSON', { traceId }, error)
    return persistAndRespond(
      'Received an unexpected response from the retrieval service.',
      [],
      {
        backend_error: 'invalid_json',
        backend_status: chatResponse.status,
        backend_url: backendChatUrl
      },
      null,
      traceId,
      clientTraceId
    )
  }

  const rawAnswer: string =
    typeof responseBody === 'string'
      ? responseBody
      : responseBody.response?.response ?? responseBody.response ?? ''

  if (!rawAnswer) {
    console.error('chat-route: backend returned empty response body', { traceId })
    return persistAndRespond(
      'The retrieval service responded without any content. Please retry.',
      [],
      {
        backend_error: 'empty_response',
        backend_status: chatResponse.status,
        backend_url: backendChatUrl
      },
      null,
      traceId,
      clientTraceId
    )
  }

  const diagnostics =
    typeof responseBody === 'object' ? ((responseBody.diagnostics as DiagnosticsPayload | undefined) ?? null) : null
  const requestId =
    typeof responseBody === 'object'
      ? (responseBody.request_id ?? diagnostics?.request_id ?? null)
      : null

  const finalKeptRaw =
    (diagnostics && (diagnostics as { final_kept?: unknown }).final_kept) ??
    (typeof responseBody === 'object' ? (responseBody.final_kept as unknown) : undefined)
  const finalKept = Array.isArray(finalKeptRaw) ? finalKeptRaw : []

  console.debug('chat-route: backend diagnostics snapshot', {
    traceId,
    requestId,
    finalKeptCount: Array.isArray(finalKept) ? finalKept.length : 0,
    sampleFinalKept: Array.isArray(finalKept) ? finalKept.slice(0, 2) : null
  })

  if (Array.isArray(finalKept)) {
    finalKept.forEach((node, index) => {
      console.debug('chat-route: final_kept node', {
        traceId,
        index,
        segmentId: (node as { segment_id?: string }).segment_id ?? null,
        parentId: (node as { parent_id?: string | null }).parent_id ?? null,
        videoId: (node as { video_id?: string | null }).video_id ?? null,
        clipUrl: (node as { clip_url?: string | null }).clip_url ?? null,
        url: (node as { url?: string | null }).url ?? null
      })
    })
  }

  let structuredMetadata: ParsedMetadataEntryV2[] = []
  try {
    const sourcesBlock = extractSourcesBlock(rawAnswer)
    if (sourcesBlock) {
      structuredMetadata = parseMetadata(sourcesBlock, rawAnswer)
    } else if (responseBody.formatted_metadata) {
      structuredMetadata = parseMetadata(String(responseBody.formatted_metadata), rawAnswer)
    }
  } catch (error) {
    console.error('chat-route: failed to parse structured metadata', { traceId }, error)
  }

  console.debug('chat-route: backend payload processed', {
    traceId,
    metadataCount: structuredMetadata.length,
    hasDiagnostics: Boolean(diagnostics),
    requestId
  })

  structuredMetadata.forEach((entry, entryIndex) => {
    const clips = entry.clips ?? []
    clips.forEach((clip, clipIndex) => {
      const hasStart =
        (typeof clip.startS === 'number' && Number.isFinite(clip.startS)) ||
        (typeof clip.startHMS === 'string' && clip.startHMS.trim().length > 0)
      const hasEnd =
        (typeof clip.endS === 'number' && Number.isFinite(clip.endS)) ||
        (typeof clip.endHMS === 'string' && clip.endHMS.trim().length > 0)
      if (!hasStart || !hasEnd) {
        console.warn('chat-route: clip missing timestamp metadata', {
          traceId,
          entryIndex,
          clipIndex,
          parentTitle: entry.parentTitle,
          clipTitle: clip.parentTitle,
          startS: clip.startS ?? null,
          startHMS: clip.startHMS ?? null,
          endS: clip.endS ?? null,
          endHMS: clip.endHMS ?? null,
          segmentId: clip.segmentId ?? null,
          videoId: clip.videoId ?? null
        })
      }
    })
  })

  console.debug('chat-route: final assistant answer', {
    traceId,
    requestId,
    answerPreview: rawAnswer.slice(0, 500),
    answerLength: rawAnswer.length,
    structuredMetadataCount: structuredMetadata.length
  })

  return persistAndRespond(
    rawAnswer,
    structuredMetadata,
    diagnostics as ChatResponseDiagnostics | null,
    requestId,
    traceId,
    clientTraceId
  )
}
