// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import auth, { E2E_AUTH_COOKIE, IS_E2E_MODE } from '@/auth'
import type { Chat } from '@/lib/types'
import { cookies } from 'next/headers'
import {
  ENTRY_PROFILE_COOKIE,
  getEntryProfileByCode,
  isValidEntryCode,
  normalizeEntryCode
} from '@/lib/entry-profiles'
import {
  E2E_SAMPLE_CHATS,
  E2E_USER_ID,
  buildSampleChatsForUser
} from '@/lib/sample-chats'
import { putLocalChat, putLocalSharedChat } from '@/lib/local-chat-store'
import { chatStore } from '@/lib/chat-store'
import { sessionChatScope } from '@/lib/chat-scope'
import { newPublicShareId } from '@/lib/chat-id'

const E2E_SAMPLE_CHATS_COOKIE = 'e2e-sample-chats'

export async function getChats(userId?: string | null) {
  if (!userId) return []
  const session = await auth()
  if (!session?.user?.id || session.user.id !== userId) return []
  if (IS_E2E_MODE) {
    const cookieStore = await cookies()
    const enabled = cookieStore.get(E2E_SAMPLE_CHATS_COOKIE)?.value === '1'
    if (enabled && userId === E2E_USER_ID) {
      return E2E_SAMPLE_CHATS
    }
    return []
  }
  const scope = await sessionChatScope(session)
  return chatStore().list(scope)
}

export async function getChat(id: string, userId: string) {
  const session = await auth()
  if (!session?.user?.id || session.user.id !== userId) return null
  if (IS_E2E_MODE) {
    const sampleChats =
      userId === E2E_USER_ID
        ? E2E_SAMPLE_CHATS
        : buildSampleChatsForUser(userId)
    return sampleChats.find(chat => chat.id === id) ?? null
  }
  const scope = await sessionChatScope(session)
  return chatStore().get(scope, id)
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  if (IS_E2E_MODE) {
    revalidatePath('/')
    return
  }

  const scope = await sessionChatScope(session)
  const existing = await chatStore().get(scope, id)
  if (!existing) return { error: 'Unauthorized' }
  await chatStore().remove(scope, id)
  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  if (IS_E2E_MODE) {
    const cookieStore = await cookies()
    cookieStore.delete(E2E_SAMPLE_CHATS_COOKIE)
    revalidatePath('/')
    return redirect('/')
  }

  const scope = await sessionChatScope(session)
  await chatStore().clear(scope)
  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  if (IS_E2E_MODE) {
    const normalized = id.endsWith('-shared') ? id.slice(0, -7) : id
    const base = E2E_SAMPLE_CHATS.find(chat => chat.id === normalized) ?? null
    if (!base) return null
    return {
      ...base,
      id,
      sharePath: `/share/${id}`,
      readOnly: true,
      originalChatId: base.id
    }
  }
  const chat = await chatStore().getShared(id)
  return chat?.sharePath ? chat : null
}

export async function shareChat(chat: Chat) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  if (IS_E2E_MODE) {
    if (chat.userId !== session.user.id) return { error: 'Unauthorized' }
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

  const scope = await sessionChatScope(session)
  const original = await chatStore().get(scope, chat.id)
  if (!original || original.userId !== scope.userId)
    return { error: 'Unauthorized' }

  const sharedChatId = newPublicShareId()
  const sharedPayload: Chat = {
    ...original,
    id: sharedChatId,
    originalChatId: original.id,
    readOnly: true,
    sharePath: `/share/${sharedChatId}`
  }
  try {
    return await chatStore().putShared(scope, sharedPayload)
  } catch (error) {
    console.error('shareChat: failed to persist shared chat', error)
    return { error: 'Unable to persist shared chat.' }
  }
}

export async function createShareLink(
  chatId: string
): Promise<{ sharePath: string } | { error: string }> {
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
    const cookieStore = await cookies()
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
      E2E_SAMPLE_CHATS.forEach(chat => putLocalChat(chat))
    }
    revalidatePath(path)
    return { ok: true, seeded: E2E_SAMPLE_CHATS.length }
  }

  try {
    const scope = await sessionChatScope(session)
    const chats = buildSampleChatsForUser(scope.userId)
    for (const chat of chats) {
      await chatStore().put(scope, chat)
    }
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
  const cookieStore = await cookies()
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
  const cookieStore = await cookies()
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
  const cookieStore = await cookies()
  cookieStore.set({
    name: ENTRY_PROFILE_COOKIE,
    value: profile.code,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30 // 30 days
  })

  redirect(nextPath)
  return prevState
}
