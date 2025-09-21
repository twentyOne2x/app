// actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { kv } from '@vercel/kv'

import { auth } from '@/auth'
import { type Chat } from '@/lib/types'
import { nanoid } from '@/lib/utils'

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const pipeline = kv.pipeline()
    const chats: string[] = await kv.zrange(`user:chat:${userId}`, 0, -1, {
      rev: true
    })

    for (const chat of chats) {
      pipeline.hgetall(chat)
    }

    const results = await pipeline.exec()

    return results as Chat[]
  } catch (error) {
    return []
  }
}

export async function getChat(id: string, userId: string) {
  const chat = await kv.hgetall<Chat>(`chat:${id}`)

  if (!chat || (userId && chat.userId !== userId)) {
    console.log("Chat not found or userId mismatch:", id, userId);
    return null
  }

  console.log("Chat found:", chat);
  return chat
}


export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()

  if (!session) {
    return {
      error: 'Unauthorized'
    }
  }

  const uid = await kv.hget<string>(`chat:${id}`, 'userId')

  if (uid !== session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  await kv.del(`chat:${id}`)
  await kv.zrem(`user:chat:${session.user.id}`, `chat:${id}`)

  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  const chats: string[] = await kv.zrange(`user:chat:${session.user.id}`, 0, -1)
  if (!chats.length) {
    return redirect('/')
  }
  const pipeline = kv.pipeline()

  for (const chat of chats) {
    pipeline.del(chat)
    pipeline.zrem(`user:chat:${session.user.id}`, chat)
  }

  await pipeline.exec()

  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  const chat = await kv.hgetall<Chat>(`chat:${id}`)

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(chat: Chat, useApiKeyAuth: boolean = false) {
  // Ensure userId is always a string
  let userId: string;
  if (!useApiKeyAuth) {
    const session = await auth();
    userId = session?.user?.id ?? 'default-legacy-user-id'; // Ensure userId is string
  } else {
    userId = process.env.APP_BACKEND_USER_ID || 'default-legacy-user-id';
  }
  console.log("Entering shareChat function");

  let isAuthorized = chat.userId === userId;

  if (!isAuthorized) {
    console.error("Unauthorized access attempt in shareChat: chat.userId:", chat.userId, "userId:", userId);
    return {
      error: 'Unauthorized'
    };
  }

  // Generate a new ID for the shared chat
  const sharedChatId = nanoid();
  const sharedPayload = {
    ...chat,
    id: sharedChatId,
    originalChatId: chat.id, // Reference to the original chat
    readOnly: true, // Mark as read-only
    sharePath: `/share/${sharedChatId}`
  };

  // console.log("Payload for shared chat:", sharedPayload);

  try {
    await kv.hmset(`chat:${sharedChatId}`, sharedPayload);
    console.log("Shared chat stored successfully");
  } catch (error) {
    console.error("Error in storing shared chat:", error);
    return { error: 'Internal Server Error' };
  }

  return sharedPayload;
}
