// app/api/create-shared-chat/route.ts
import { kv } from '@vercel/kv';
import { shareChat } from '@/app/actions';
import { nanoid } from '@/lib/utils';
import { parseMetadata, type ParsedMetadataEntryV2 } from '@/lib/utils';
import { type Message } from 'ai';
import { auth } from '@/auth';
import type { Chat } from '@/lib/types';

const API_KEY = process.env.BACKEND_API_KEY;
const APP_USER_ID = process.env.APP_BACKEND_USER_ID || 'defaultUserId';

export async function POST(request: Request) {
  console.log(`Received request on /api/create-shared-chat with method: ${request.method}`);

  if (request.headers.get('x-api-key') !== API_KEY) {
    console.error('Unauthorized attempt on /api/create-shared-chat');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const session = await auth();
  if (!session?.user) {
    console.error('Unauthenticated access to /api/create-shared-chat');
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }

  const requestData = await request.json();
  if (!requestData.response) {
    console.error(`Missing 'response' in request body: ${JSON.stringify(requestData)}`);
    return new Response(JSON.stringify({ error: 'Missing required field: response' }), { status: 400 });
  }

  try {
    const createdAt = Date.now(); // number (ms)
    const chatId = nanoid();
    const path = `/chat/${chatId}`;
    const title = String(requestData.response).substring(0, 150) || 'New Chat';

    let structuredMetadata: ParsedMetadataEntryV2[] = [];
    if (requestData.formatted_metadata) {
      structuredMetadata = parseMetadata(
        String(requestData.formatted_metadata),
        String(requestData.response)
      );
      console.log('route.ts: Parsed metadata (v2):', structuredMetadata);
    }

    const messageId = nanoid();
    const newMessage: Message = {
      id: messageId,
      content: String(requestData.response),
      role: 'assistant',
    };

    const newChat: Chat = {
      id: chatId,
      title,
      userId: session.user.id || APP_USER_ID,
      createdAt,
      path,
      messages: [newMessage],
      structured_metadata: structuredMetadata,
    };

    // hmset expects Record<string, unknown>
    const kvPayload: Record<string, unknown> = { ...newChat };

    await kv.hmset(`chat:${chatId}`, kvPayload);
    await kv.zadd(`user:chat:${session.user.id || APP_USER_ID}`, {
      score: createdAt,
      member: `chat:${chatId}`,
    });

    const sharedChat = await shareChat(newChat, true);

    if ('sharePath' in sharedChat) {
      const shareUrl = `icm.fyi${sharedChat.sharePath}`;
      return new Response(
        JSON.stringify({ message: 'Shared chat created successfully', sharedChatLink: shareUrl }),
        { status: 200 }
      );
    } else {
      return new Response(JSON.stringify({ error: 'Failed to create shared chat' }), { status: 500 });
    }
  } catch (error) {
    console.error(`Caught error in /api/create-shared-chat: ${error}`);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
