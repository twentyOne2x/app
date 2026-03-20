export const CHAT_ACCESS_COOKIE = 'icm-preview-session'
export const CHAT_ACCESS_HEADER = 'x-icm-chat-access'
export const DEFAULT_CHAT_PREVIEW_MESSAGE_LIMIT = 3

export interface ChatAccessState {
  isAuthenticated: boolean
  previewMessagesUsed: number
  previewMessagesRemaining: number
  previewMessagesLimit: number
  requiresAuth: boolean
}

export function buildDefaultChatAccessState(
  overrides: Partial<ChatAccessState> = {}
): ChatAccessState {
  const isAuthenticated = Boolean(overrides.isAuthenticated)
  const previewMessagesLimit =
    typeof overrides.previewMessagesLimit === 'number' && Number.isFinite(overrides.previewMessagesLimit)
      ? Math.max(0, Math.floor(overrides.previewMessagesLimit))
      : DEFAULT_CHAT_PREVIEW_MESSAGE_LIMIT
  const previewMessagesUsed =
    typeof overrides.previewMessagesUsed === 'number' && Number.isFinite(overrides.previewMessagesUsed)
      ? Math.max(0, Math.floor(overrides.previewMessagesUsed))
      : 0

  return {
    isAuthenticated,
    previewMessagesUsed,
    previewMessagesRemaining:
      typeof overrides.previewMessagesRemaining === 'number' && Number.isFinite(overrides.previewMessagesRemaining)
        ? Math.max(0, Math.floor(overrides.previewMessagesRemaining))
        : Math.max(0, previewMessagesLimit - previewMessagesUsed),
    previewMessagesLimit,
    requiresAuth:
      typeof overrides.requiresAuth === 'boolean'
        ? overrides.requiresAuth
        : previewMessagesUsed >= previewMessagesLimit
  }
}
