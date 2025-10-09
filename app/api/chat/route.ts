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
  const session = await auth()

  const isAnonymous = !session?.user?.id || session.user.id === null
  const userId = isAnonymous ? 'anonymous' : session.user.id

  if (previewToken) configuration.apiKey = previewToken

  const mostRecentMessageContent = messages?.length > 0 ? messages[messages.length - 1].content : 'No messages yet.'
  const backendChatUrl = `${process.env.REACT_APP_BACKEND_URL}/chat`

  let chatResponse: Response
  try {
    chatResponse = await fetch(backendChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mostRecentMessageContent, chat_history: messages })
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
    structured_metadata: structuredMetadata
  }

  try {
    await kv.hmset(`chat:${id}`, payload)
    if (!isAnonymous) await kv.zadd(`user:chat:${session!.user!.id}`, { score: createdAt, member: `chat:${id}` })
  } catch { return new Response('Internal Server Error', { status: 500 }) }

  const responsePayload = {
    id: payload.id, title: payload.title, userId: payload.userId, createdAt: payload.createdAt, path: payload.path,
    message: { content: processedResponseContent, role: 'assistant' },
    structured_metadata: payload.structured_metadata
  }

  return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } })
}
