// app/api/create-shared-chat/route.ts
import { nanoid } from '@/lib/utils'
import { parseMetadata, type ParsedMetadataEntryV2 } from '@/lib/utils'
import { type Message } from '@/lib/types'
import { auth } from '@/auth'
import type { Chat } from '@/lib/types'
import { chatStore } from '@/lib/chat-store'
import { requestChatScope, type ChatScope } from '@/lib/chat-scope'
import { isProductionRuntime } from '@/lib/internal-service'
import { newPublicShareId } from '@/lib/chat-id'

const API_KEY = process.env.BACKEND_API_KEY

export async function POST(request: Request) {
  console.log(
    `Received request on /api/create-shared-chat with method: ${request.method}`
  )

  if (
    !API_KEY ||
    API_KEY.length < 32 ||
    request.headers.get('x-api-key') !== API_KEY
  ) {
    console.error('Unauthorized attempt on /api/create-shared-chat')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401
    })
  }

  const session = await auth()
  if (!session?.user) {
    console.error('Unauthenticated access to /api/create-shared-chat')
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401
    })
  }
  const gatewayScope = requestChatScope(request)
  if (isProductionRuntime() && !gatewayScope) {
    return new Response(
      JSON.stringify({ error: 'Canonical gateway scope required' }),
      { status: 401 }
    )
  }
  if (!session.user.id) {
    return new Response(
      JSON.stringify({ error: 'Authenticated user id required' }),
      { status: 401 }
    )
  }
  const scope: ChatScope = gatewayScope ?? {
    userId: session.user.id,
    tenantId: `local:${session.user.id}`
  }

  const requestData = await request.json()
  if (!requestData.response) {
    console.error(
      `Missing 'response' in request body: ${JSON.stringify(requestData)}`
    )
    return new Response(
      JSON.stringify({ error: 'Missing required field: response' }),
      { status: 400 }
    )
  }

  try {
    const createdAt = Date.now() // number (ms)
    const chatId = nanoid()
    const path = `/chat/${chatId}`
    const title = String(requestData.response).substring(0, 150) || 'New Chat'

    let structuredMetadata: ParsedMetadataEntryV2[] = []
    if (requestData.formatted_metadata) {
      structuredMetadata = parseMetadata(
        String(requestData.formatted_metadata),
        String(requestData.response)
      )
      console.log('route.ts: Parsed metadata (v2):', structuredMetadata)
    }

    const messageId = nanoid()
    const newMessage: Message = {
      id: messageId,
      content: String(requestData.response),
      role: 'assistant'
    }

    const newChat: Chat = {
      id: chatId,
      title,
      userId: scope.userId,
      createdAt,
      path,
      messages: [newMessage],
      structured_metadata: structuredMetadata
    }

    const store = chatStore()
    await store.put(scope, newChat)
    const sharedChatId = newPublicShareId()
    const sharedChat: Chat = {
      ...newChat,
      id: sharedChatId,
      originalChatId: newChat.id,
      readOnly: true,
      sharePath: `/share/${sharedChatId}`
    }
    await store.putShared(scope, sharedChat)
    const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin
    const shareUrl = new URL(sharedChat.sharePath!, baseUrl).toString()
    return new Response(
      JSON.stringify({
        message: 'Shared chat created successfully',
        sharedChatLink: shareUrl
      }),
      { status: 200 }
    )
  } catch (error) {
    console.error(`Caught error in /api/create-shared-chat: ${error}`)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500
    })
  }
}
