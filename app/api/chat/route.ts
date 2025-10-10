import { kv } from '@vercel/kv'
import { Configuration } from 'openai-edge'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import { extractSourcesBlock, parseMetadata, type ParsedMetadataEntryV2 } from '@/lib/utils'

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  let json: any
  try { json = await req.json() } catch { return new Response('Bad request', { status: 400 }) }

  const { messages, previewToken } = json
  const channelFilter = json.channel_filter ?? undefined
  const entryProfileCode: string | undefined =
    typeof json.entryProfileCode === 'string' && json.entryProfileCode.trim().length
      ? json.entryProfileCode.trim()
      : undefined
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = session.user.id

  if (previewToken) configuration.apiKey = previewToken

  const mostRecentMessageContent = messages?.length > 0 ? messages[messages.length - 1].content : 'No messages yet.'
  const backendChatUrl = `${process.env.REACT_APP_BACKEND_URL}/chat`

  let chatResponse: Response
  try {
    chatResponse = await fetch(backendChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: mostRecentMessageContent,
        chat_history: messages,
        entry_profile_code: entryProfileCode,
        channel_filter: channelFilter
      })
    })
  } catch { return new Response('Internal Server Error', { status: 500 }) }

  if (!chatResponse.ok) {
    return new Response(`Error from backend service: ${chatResponse.statusText}`, { status: chatResponse.status })
  }

  const responseBody = await chatResponse.json()
  const rawAnswer: string =
    typeof responseBody === 'string'
      ? responseBody
      : (responseBody.response?.response ?? responseBody.response ?? '')
  const diagnostics = typeof responseBody === 'object' ? (responseBody.diagnostics ?? null) : null
  const requestId =
    typeof responseBody === 'object' ? (responseBody.request_id ?? diagnostics?.request_id ?? null) : null

  let structuredMetadata: ParsedMetadataEntryV2[] = []
  const sourcesBlock = extractSourcesBlock(rawAnswer)
  if (sourcesBlock) {
    structuredMetadata = parseMetadata(sourcesBlock, rawAnswer)
  } else if (responseBody.formatted_metadata) {
    structuredMetadata = parseMetadata(String(responseBody.formatted_metadata), rawAnswer)
  }

  const title = messages?.[0]?.content?.substring(0, 100) || 'New Chat'
  const id = json.id ?? nanoid()
  const createdAt = Date.now()
  const path = `/chat/${id}`

  const processResponseContent = (content: string): string =>
    (content || '')
      .replace(/ICM \(Internet Capital Markets\)/g, 'ICM')
      .replace(/Internet Capital Markets \(ICM\)/g, 'ICM')
      .replace(/Internet Capital Markets/g, 'ICM')

  const processedResponseContent = processResponseContent(rawAnswer)

  const payload = {
    id, title, userId, createdAt, path,
    messages: [ ...(messages || []), { content: processedResponseContent, role: 'assistant' } ],
    structured_metadata: structuredMetadata,
    entryProfileCode
  }

  try {
    await kv.hmset(`chat:${id}`, payload)
    await kv.zadd(`user:chat:${session.user.id}`, { score: createdAt, member: `chat:${id}` })
  } catch { return new Response('Internal Server Error', { status: 500 }) }

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
    request_id: requestId
  }

  return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } })
}
