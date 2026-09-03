import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { parse as parseCookie, serialize as serializeCookie } from 'cookie'
import { createClient } from 'redis'

import {
  CHAT_ACCESS_COOKIE,
  CHAT_ACCESS_HEADER,
  buildDefaultChatAccessState,
  type ChatAccessState
} from '@/lib/chat-access-shared'
import { isProductionRuntime } from '@/lib/internal-service'

const PREVIEW_TTL_SECONDS = 60 * 60 * 24 * 30

type ExpiringCounter = {
  count: number
  expiresAt: number
}

type LocalChatAccessStore = {
  previewCounts: Map<string, ExpiringCounter>
  rateLimits: Map<string, ExpiringCounter>
}

type RedisCounterClient = {
  connect(): Promise<unknown>
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number | boolean>
  on(event: 'error', listener: (error: unknown) => void): unknown
}

type PreparedChatAccess = {
  anonId: string | null
  shouldSetCookie: boolean
  isAuthenticated: boolean
  previewCount: number
  previewLimit: number
  rateLimitRemaining: number
}

const globalStore = globalThis as typeof globalThis & {
  __LOCAL_CHAT_ACCESS_STORE__?: LocalChatAccessStore
  __ICMFYI_CHAT_ACCESS_REDIS__?: RedisCounterClient
  __ICMFYI_CHAT_ACCESS_REDIS_PROMISE__?: Promise<RedisCounterClient>
  __ICMFYI_CHAT_ACCESS_REDIS_URL__?: string
}

function redisUrl(): string {
  return process.env.APP_REDIS_URL?.trim() ?? ''
}

async function redisClient(): Promise<RedisCounterClient | null> {
  const url = redisUrl()
  if (!url) {
    if (isProductionRuntime()) {
      throw new Error('APP_REDIS_URL is required in production')
    }
    return null
  }
  if (
    globalStore.__ICMFYI_CHAT_ACCESS_REDIS_URL__ &&
    globalStore.__ICMFYI_CHAT_ACCESS_REDIS_URL__ !== url
  ) {
    throw new Error(
      'APP_REDIS_URL changed after the runtime client was initialized'
    )
  }
  if (!globalStore.__ICMFYI_CHAT_ACCESS_REDIS_PROMISE__) {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: retries => Math.min(250 * Math.max(1, retries), 2000)
      }
    }) as unknown as RedisCounterClient
    client.on('error', error => {
      console.error(
        'chat access Redis error',
        error instanceof Error ? error.message : 'redis_error'
      )
    })
    globalStore.__ICMFYI_CHAT_ACCESS_REDIS__ = client
    globalStore.__ICMFYI_CHAT_ACCESS_REDIS_URL__ = url
    globalStore.__ICMFYI_CHAT_ACCESS_REDIS_PROMISE__ = client
      .connect()
      .then(() => client)
  }
  return globalStore.__ICMFYI_CHAT_ACCESS_REDIS_PROMISE__
}

export async function chatAccessStoreHealth(): Promise<void> {
  const redis = await redisClient()
  if (!redis) {
    if (isProductionRuntime()) {
      throw new Error('APP_REDIS_URL is required in production')
    }
    return
  }
  const key = `chat:health:${process.pid}`
  await redis.get(key)
}

function getNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function getPreviewLimit() {
  return getNumericEnv('CHAT_PREVIEW_MESSAGE_LIMIT', 3)
}

function getRateLimitWindowSeconds() {
  return getNumericEnv('CHAT_RATE_LIMIT_WINDOW_SECONDS', 60)
}

function getAnonRateLimitMax() {
  return getNumericEnv('CHAT_RATE_LIMIT_ANON_MAX', 6)
}

function getAuthRateLimitMax() {
  return getNumericEnv('CHAT_RATE_LIMIT_AUTH_MAX', 20)
}

function ensureLocalStore(): LocalChatAccessStore {
  if (!globalStore.__LOCAL_CHAT_ACCESS_STORE__) {
    globalStore.__LOCAL_CHAT_ACCESS_STORE__ = {
      previewCounts: new Map(),
      rateLimits: new Map()
    }
  }
  return globalStore.__LOCAL_CHAT_ACCESS_STORE__
}

function pruneExpiredMap(map: Map<string, ExpiringCounter>) {
  const now = Date.now()
  map.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      map.delete(key)
    }
  })
}

function getRequestCookies(request: Request) {
  return parseCookie(request.headers.get('cookie') ?? '')
}

function getRequestAnonId(request: Request): string | null {
  const parsed = getRequestCookies(request)
  const candidate = parsed[CHAT_ACCESS_COOKIE]
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null
}

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  return realIp?.trim() || null
}

function previewUsageKey(anonId: string) {
  return `chat:preview:${anonId}`
}

function rateLimitKey(identity: string) {
  const windowSeconds = getRateLimitWindowSeconds()
  const currentWindow = Math.floor(Date.now() / (windowSeconds * 1000))
  return `chat:ratelimit:${identity}:${currentWindow}`
}

async function readPreviewCount(anonId: string): Promise<number> {
  const redis = await redisClient()
  if (redis) {
    const raw = await redis.get(previewUsageKey(anonId))
    const parsed = Number(raw ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const store = ensureLocalStore()
  pruneExpiredMap(store.previewCounts)
  return store.previewCounts.get(anonId)?.count ?? 0
}

async function incrementPreviewCount(anonId: string): Promise<number> {
  const redis = await redisClient()
  if (redis) {
    const key = previewUsageKey(anonId)
    const next = await redis.incr(key)
    if (next === 1) {
      await redis.expire(key, PREVIEW_TTL_SECONDS)
    }
    return next
  }

  const store = ensureLocalStore()
  pruneExpiredMap(store.previewCounts)
  const current = store.previewCounts.get(anonId)?.count ?? 0
  const next = current + 1
  store.previewCounts.set(anonId, {
    count: next,
    expiresAt: Date.now() + PREVIEW_TTL_SECONDS * 1000
  })
  return next
}

async function incrementRateLimit(
  identity: string,
  max: number
): Promise<{ count: number; remaining: number }> {
  const windowSeconds = getRateLimitWindowSeconds()
  const key = rateLimitKey(identity)

  const redis = await redisClient()
  if (redis) {
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, windowSeconds + 5)
    }
    return {
      count,
      remaining: Math.max(0, max - count)
    }
  }

  const store = ensureLocalStore()
  pruneExpiredMap(store.rateLimits)
  const current = store.rateLimits.get(key)?.count ?? 0
  const count = current + 1
  store.rateLimits.set(key, {
    count,
    expiresAt: Date.now() + (windowSeconds + 5) * 1000
  })
  return {
    count,
    remaining: Math.max(0, max - count)
  }
}

function buildAccessState(
  isAuthenticated: boolean,
  previewCount: number
): ChatAccessState {
  const previewLimit = getPreviewLimit()
  if (isAuthenticated) {
    return buildDefaultChatAccessState({
      isAuthenticated: true,
      previewMessagesUsed: 0,
      previewMessagesRemaining: previewLimit,
      previewMessagesLimit: previewLimit,
      requiresAuth: false
    })
  }

  const safeUsed = Math.max(0, previewCount)
  return buildDefaultChatAccessState({
    isAuthenticated: false,
    previewMessagesUsed: safeUsed,
    previewMessagesRemaining: Math.max(0, previewLimit - safeUsed),
    previewMessagesLimit: previewLimit,
    requiresAuth: safeUsed >= previewLimit
  })
}

function encodeAccessState(state: ChatAccessState) {
  return encodeURIComponent(JSON.stringify(state))
}

export function applyChatAccessResponse<T extends Response>(
  response: T,
  context: PreparedChatAccess,
  state: ChatAccessState
): T {
  response.headers.set(CHAT_ACCESS_HEADER, encodeAccessState(state))

  if (context.shouldSetCookie && context.anonId) {
    response.headers.append(
      'Set-Cookie',
      serializeCookie(CHAT_ACCESS_COOKIE, context.anonId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: PREVIEW_TTL_SECONDS
      })
    )
  }

  return response
}

function buildAccessErrorResponse(
  context: PreparedChatAccess,
  state: ChatAccessState,
  status: number,
  error: string,
  message: string
) {
  const response = new Response(
    JSON.stringify({
      error,
      message,
      accessState: state
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )

  return applyChatAccessResponse(response, context, state)
}

export async function beginChatAccess(
  request: Request,
  userId?: string | null
) {
  const isAuthenticated = Boolean(userId)
  const previewLimit = getPreviewLimit()
  const existingAnonId = isAuthenticated ? null : getRequestAnonId(request)
  const anonId = isAuthenticated ? null : (existingAnonId ?? randomUUID())
  const previewCount = anonId ? await readPreviewCount(anonId) : 0

  const ip = getRequestIp(request)
  const rateLimitIdentity = isAuthenticated
    ? `user:${userId}`
    : `anon:${ip ?? anonId ?? 'unknown'}`
  const rateLimitMax = isAuthenticated
    ? getAuthRateLimitMax()
    : getAnonRateLimitMax()
  const rateLimitResult = await incrementRateLimit(
    rateLimitIdentity,
    rateLimitMax
  )

  const context: PreparedChatAccess = {
    anonId,
    shouldSetCookie: Boolean(anonId && !existingAnonId),
    isAuthenticated,
    previewCount,
    previewLimit,
    rateLimitRemaining: rateLimitResult.remaining
  }

  const currentState = buildAccessState(isAuthenticated, previewCount)

  if (rateLimitResult.count > rateLimitMax) {
    return {
      ok: false as const,
      context,
      state: currentState,
      response: buildAccessErrorResponse(
        context,
        currentState,
        429,
        'rate_limited',
        'Too many requests. Please wait a moment before sending another prompt.'
      )
    }
  }

  if (!isAuthenticated && previewCount >= previewLimit) {
    return {
      ok: false as const,
      context,
      state: currentState,
      response: buildAccessErrorResponse(
        context,
        currentState,
        401,
        'auth_required',
        'Sign in with Twitter or Google to continue after your 3-message preview.'
      )
    }
  }

  return {
    ok: true as const,
    context,
    state: currentState
  }
}

export async function finalizeChatAccess(context: PreparedChatAccess) {
  if (context.isAuthenticated || !context.anonId) {
    return buildAccessState(true, 0)
  }

  const nextCount = await incrementPreviewCount(context.anonId)
  return buildAccessState(false, nextCount)
}

export async function getServerChatAccessState(
  userId?: string | null
): Promise<ChatAccessState> {
  if (userId) {
    return buildAccessState(true, 0)
  }

  if (isProductionRuntime()) {
    return buildAccessState(false, getPreviewLimit())
  }

  const cookieStore = await cookies()
  const anonId = cookieStore.get(CHAT_ACCESS_COOKIE)?.value ?? null
  if (!anonId) {
    return buildAccessState(false, 0)
  }

  const previewCount = await readPreviewCount(anonId)
  return buildAccessState(false, previewCount)
}
