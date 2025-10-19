import type { Chat } from '@/lib/types'

type LocalChatStore = {
  chats: Map<string, Chat>
  userIndex: Map<string, Set<string>>
  shared: Map<string, Chat>
}
const globalStore = globalThis as typeof globalThis & {
  __LOCAL_CHAT_STORE__?: LocalChatStore
}

function ensureStore(): LocalChatStore {
  if (!globalStore.__LOCAL_CHAT_STORE__) {
    globalStore.__LOCAL_CHAT_STORE__ = {
      chats: new Map(),
      userIndex: new Map(),
      shared: new Map()
    }
  }
  return globalStore.__LOCAL_CHAT_STORE__!
}

export function putLocalChat(chat: Chat) {
  const store = ensureStore()
  store.chats.set(chat.id, chat)
  if (chat.userId) {
    const index = store.userIndex.get(chat.userId) ?? new Set()
    index.add(chat.id)
    store.userIndex.set(chat.userId, index)
  }
}

export function listLocalChats(userId: string): Chat[] {
  const store = ensureStore()
  const ids = store.userIndex.get(userId)
  if (!ids || !ids.size) return []
  return Array.from(ids)
    .map((id) => store.chats.get(id))
    .filter((chat): chat is Chat => Boolean(chat))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export function getLocalChat(id: string): Chat | null {
  const store = ensureStore()
  return store.chats.get(id) ?? null
}

export function deleteLocalChat(userId: string, chatId: string) {
  const store = ensureStore()
  store.chats.delete(chatId)
  const ids = store.userIndex.get(userId)
  if (ids) {
    ids.delete(chatId)
    if (ids.size === 0) {
      store.userIndex.delete(userId)
    }
  }
  store.shared.delete(chatId)
}

export function clearLocalChats(userId: string) {
  const store = ensureStore()
  const ids = store.userIndex.get(userId)
  if (!ids) return
  ids.forEach((id) => {
    store.chats.delete(id)
    store.shared.delete(id)
  })
  store.userIndex.delete(userId)
}

export function putLocalSharedChat(chat: Chat) {
  const store = ensureStore()
  store.shared.set(chat.id, chat)
}

export function getLocalSharedChat(id: string): Chat | null {
  const store = ensureStore()
  return store.shared.get(id) ?? store.chats.get(id) ?? null
}
