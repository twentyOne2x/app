// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { kv } from '@vercel/kv'
import { auth } from '@/auth'
import type { Chat } from '@/lib/types'
import { nanoid } from '@/lib/utils'
import { cookies } from 'next/headers'
import {
  ENTRY_PROFILE_COOKIE,
  getEntryProfileByCode,
  isValidEntryCode,
  normalizeEntryCode,
} from '@/lib/entry-profiles'

const API_URL = process.env.NEXT_PUBLIC_RAG_API_URL || "http://localhost:8000";

/** Helper: make a shallow Record copy suitable for hmset */
const toKV = (obj: unknown): Record<string, unknown> => ({ ...(obj as any) })

export async function getChats(userId?: string | null) {
  if (!userId) return []
  try {
    const chatKeys = (await kv.zrange(`user:chat:${userId}`, 0, -1, {
      rev: true
    })) as unknown as string[]

    if (!chatKeys?.length) return []

    const pipeline = kv.pipeline()
    for (const key of chatKeys) pipeline.hgetall(key)
    const results = (await pipeline.exec()) ?? []

    // Cast only at the boundary
    const chats = results
      .map((r: unknown) => (r ? (r as Chat) : null))
      .filter(Boolean) as Chat[]

    return chats
  } catch {
    return []
  }
}

export async function getChat(id: string, userId: string) {
  const raw = await kv.hgetall(`chat:${id}`)
  const chat = (raw || null) as Chat | null
  if (!chat || (userId && chat.userId !== userId)) return null
  return chat
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const uid = (await kv.hget(`chat:${id}`, 'userId')) as string | null
  if (uid !== session?.user?.id) return { error: 'Unauthorized' }

  await kv.del(`chat:${id}`)
  await kv.zrem(`user:chat:${session.user.id}`, `chat:${id}`)
  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const chats = (await kv.zrange(
    `user:chat:${session.user.id}`,
    0,
    -1
  )) as unknown as string[]

  if (!chats.length) return redirect('/')

  const pipeline = kv.pipeline()
  for (const chatKey of chats) {
    pipeline.del(chatKey)
    pipeline.zrem(`user:chat:${session.user.id}`, chatKey)
  }
  await pipeline.exec()
  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  const raw = await kv.hgetall(`chat:${id}`)
  const chat = (raw || null) as Chat | null
  if (!chat || !chat.sharePath) return null
  return chat
}

export async function shareChat(chat: Chat, useApiKeyAuth: boolean = false) {
  let userId: string
  if (!useApiKeyAuth) {
    const session = await auth()
    if (!session?.user?.id) return { error: 'Unauthorized' }
    userId = session.user.id
  } else {
    userId = process.env.APP_BACKEND_USER_ID || 'default-legacy-user-id'
  }

  if (chat.userId !== userId) return { error: 'Unauthorized' }

  const sharedChatId = nanoid()
  const sharedPayload: Chat = {
    ...chat,
    id: sharedChatId,
    originalChatId: chat.id,
    readOnly: true,
    sharePath: `/share/${sharedChatId}`,
  }

  await kv.hmset(`chat:${sharedChatId}`, toKV(sharedPayload))
  return sharedPayload
}

type EntryCodeFormState = { error: string | null }

const defaultEntryCodeFormState: EntryCodeFormState = { error: null }

export async function authorizeEntryCode(
  _prevState: EntryCodeFormState = defaultEntryCodeFormState,
  formData: FormData
): Promise<EntryCodeFormState | void> {
  const rawCode = formData.get('entryCode')
  if (typeof rawCode !== 'string') {
    return { error: 'Please enter an access code.' }
  }

  const normalized = normalizeEntryCode(rawCode)
  if (!normalized) {
    return { error: 'Please enter an access code.' }
  }

  if (!isValidEntryCode(normalized)) {
    return { error: 'That access code is not recognized.' }
  }

  const profile = getEntryProfileByCode(normalized)
  const nextPath = (() => {
    const rawNext = formData.get('next')
    if (typeof rawNext !== 'string') return '/'
    if (!rawNext.startsWith('/')) return '/'
    return rawNext === '/access' ? '/' : rawNext
  })()
  const cookieStore = cookies()
  cookieStore.set({
    name: ENTRY_PROFILE_COOKIE,
    value: profile.code,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  redirect(nextPath)
}
