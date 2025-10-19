// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { kv } from '@vercel/kv'
import auth, { E2E_AUTH_COOKIE, IS_E2E_MODE } from '@/auth'
import type { Chat } from '@/lib/types'
import { nanoid } from '@/lib/utils'
import { cookies } from 'next/headers'
import {
  ENTRY_PROFILE_COOKIE,
  getEntryProfileByCode,
  isValidEntryCode,
  normalizeEntryCode,
} from '@/lib/entry-profiles'
import {
  E2E_SAMPLE_CHATS,
  E2E_USER_ID,
  buildSampleChatsForUser
} from '@/lib/sample-chats'
import {
  listLocalChats,
  getLocalChat,
  deleteLocalChat,
  clearLocalChats,
  putLocalChat,
  putLocalSharedChat,
  getLocalSharedChat
} from '@/lib/local-chat-store'

const API_URL = process.env.NEXT_PUBLIC_RAG_API_URL || "http://localhost:8000";
const E2E_SAMPLE_CHATS_COOKIE = 'e2e-sample-chats'
const isKvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

/** Helper: make a shallow Record copy suitable for hmset */
const toKV = (obj: unknown): Record<string, unknown> => ({ ...(obj as any) })

export async function getChats(userId?: string | null) {
  if (!userId) return []
  if (IS_E2E_MODE) {
    const cookieStore = cookies()
    const enabled = cookieStore.get(E2E_SAMPLE_CHATS_COOKIE)?.value === '1'
    if (enabled && userId === E2E_USER_ID) {
      return E2E_SAMPLE_CHATS
    }
    return []
  }
  if (!isKvConfigured) {
    return listLocalChats(userId)
  }
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
    return listLocalChats(userId)
  }
}

export async function getChat(id: string, userId: string) {
  if (IS_E2E_MODE) {
    const sampleChats =
      userId === E2E_USER_ID ? E2E_SAMPLE_CHATS : buildSampleChatsForUser(userId)
    return sampleChats.find((chat) => chat.id === id) ?? null
  }
  if (!isKvConfigured) {
    const local = getLocalChat(id)
    if (!local || (userId && local.userId !== userId)) return null
    return local
  }
  try {
    const raw = await kv.hgetall(`chat:${id}`)
    const chat = (raw || null) as Chat | null
    if (!chat || (userId && chat.userId !== userId)) return getLocalChat(id)
    return chat
  } catch {
    const local = getLocalChat(id)
    if (!local || (userId && local.userId !== userId)) return null
    return local
  }
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  if (IS_E2E_MODE) {
    revalidatePath('/')
    return
  }

  if (!isKvConfigured) {
    deleteLocalChat(session.user.id, id)
    revalidatePath('/')
    return
  }

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

  if (IS_E2E_MODE) {
    const cookieStore = cookies()
    cookieStore.delete(E2E_SAMPLE_CHATS_COOKIE)
    revalidatePath('/')
    return redirect('/')
  }

  if (!isKvConfigured) {
    clearLocalChats(session.user.id)
    revalidatePath('/')
    return redirect('/')
  }

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
  if (IS_E2E_MODE) {
    const normalized = id.endsWith('-shared') ? id.slice(0, -7) : id
    const base =
      E2E_SAMPLE_CHATS.find((chat) => chat.id === normalized) ?? null
    if (!base) return null
    return {
      ...base,
      id,
      sharePath: `/share/${id}`,
      readOnly: true,
      originalChatId: base.id
    }
  }
  if (!isKvConfigured) {
    const localShared = getLocalSharedChat(id)
    return localShared?.sharePath ? localShared : null
  }
  try {
    const raw = await kv.hgetall(`chat:${id}`)
    const chat = (raw || null) as Chat | null
    if (!chat || !chat.sharePath) {
      const fallback = getLocalSharedChat(id)
      return fallback?.sharePath ? fallback : null
    }
    return chat
  } catch {
    const localShared = getLocalSharedChat(id)
    return localShared?.sharePath ? localShared : null
  }
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

  if (IS_E2E_MODE) {
    const sharedChatId = `${chat.id}-shared`
    const shared = {
      ...chat,
      id: sharedChatId,
      sharePath: `/share/${sharedChatId}`,
      readOnly: true,
      originalChatId: chat.id
    }
    putLocalSharedChat(shared)
    return shared
  }

  const sharedChatId = nanoid()
  const sharedPayload: Chat = {
    ...chat,
    id: sharedChatId,
    originalChatId: chat.id,
    readOnly: true,
    sharePath: `/share/${sharedChatId}`,
  }

  if (!isKvConfigured) {
    putLocalSharedChat(sharedPayload)
    return sharedPayload
  }

  try {
    await kv.hmset(`chat:${sharedChatId}`, toKV(sharedPayload))
  } catch (error) {
    console.error('shareChat: failed to persist shared chat', error)
    putLocalSharedChat(sharedPayload)
  }
  return sharedPayload
}

export async function createShareLink(chatId: string): Promise<{ sharePath: string } | { error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const chat = await getChat(chatId, session.user.id)
  if (!chat) return { error: 'Chat not found' }

  const shared = await shareChat(chat)
  if (!shared || typeof shared !== 'object') {
    return { error: 'Unable to create share link.' }
  }
  if ('error' in shared) {
    return shared
  }
  if (!shared.sharePath) {
    return { error: 'Share link unavailable.' }
  }
  return { sharePath: shared.sharePath }
}

export async function seedSampleChats(path = '/') {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'Unauthorized' }
  }

  if (IS_E2E_MODE) {
    const cookieStore = cookies()
    cookieStore.set({
      name: E2E_SAMPLE_CHATS_COOKIE,
      value: '1',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60
    })
    if (session.user?.id === E2E_USER_ID) {
      E2E_SAMPLE_CHATS.forEach((chat) => putLocalChat(chat))
    }
    revalidatePath(path)
    return { ok: true, seeded: E2E_SAMPLE_CHATS.length }
  }

  try {
    const chats = buildSampleChatsForUser(session.user.id)
    const pipeline = kv.pipeline()
    for (const chat of chats) {
      pipeline.hmset(`chat:${chat.id}`, toKV(chat))
      pipeline.zadd(`user:chat:${session.user.id}`, {
        score: chat.createdAt,
        member: `chat:${chat.id}`
      })
    }
    await pipeline.exec()
    revalidatePath(path)
    return { ok: true, seeded: chats.length }
  } catch (error) {
    console.error('seedSampleChats failed', error)
    return { error: 'Unable to add sample conversations.' }
  }
}

export async function e2eSignOut() {
  if (!IS_E2E_MODE) {
    return { error: 'E2E mode is not enabled.' }
  }
  const cookieStore = cookies()
  cookieStore.set({
    name: E2E_AUTH_COOKIE,
    value: 'signed-out',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 5 // 5 minutes; tests can flip back quickly
  })
  revalidatePath('/')
  redirect('/sign-in')
}

export async function e2eSignIn() {
  if (!IS_E2E_MODE) {
    redirect('/sign-in?error=e2e-disabled')
  }
  const cookieStore = cookies()
  cookieStore.set({
    name: E2E_AUTH_COOKIE,
    value: 'active',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60
  })
  revalidatePath('/')
  redirect('/')
}

type EntryCodeFormState = { error: string | null }

const defaultEntryCodeFormState: EntryCodeFormState = { error: null }

export async function authorizeEntryCode(
  prevState: EntryCodeFormState,
  formData: FormData
): Promise<EntryCodeFormState> {
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
  return prevState
}
