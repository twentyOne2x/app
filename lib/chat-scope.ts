import type { Session } from 'next-auth'

import { deriveGatewayScopedIdentity } from '@/lib/gateway-identity'
import { isProductionRuntime } from '@/lib/internal-service'
import {
  canonicalSessionIdentity,
  SessionIdentityError
} from '@/lib/session-identity'

const USER_ID = /^usr_[0-9a-f]{64}$/
const TENANT_ID = /^ten_[0-9a-f]{64}$/

export type ChatScope = Readonly<{
  userId: string
  tenantId: string
}>

export class ChatScopeError extends Error {
  constructor(message = 'canonical chat scope is unavailable') {
    super(message)
    this.name = 'ChatScopeError'
  }
}

export function isCanonicalChatScope(scope: ChatScope): boolean {
  return USER_ID.test(scope.userId) && TENANT_ID.test(scope.tenantId)
}

export function requestChatScope(request: Request): ChatScope | null {
  const scope = {
    userId: request.headers.get('x-icmfyi-user-id')?.trim() ?? '',
    tenantId: request.headers.get('x-icmfyi-tenant-id')?.trim() ?? ''
  }
  return isCanonicalChatScope(scope) ? scope : null
}

export function requireRequestChatScope(request: Request): ChatScope {
  const scope = requestChatScope(request)
  if (!scope) throw new ChatScopeError()
  return scope
}

/** Derive the same opaque identity pair that middleware attaches to API calls.
 * Server actions do not receive middleware's rewritten request headers, so they
 * must derive rather than trust a caller-supplied user id. */
export async function sessionChatScope(session: Session): Promise<ChatScope> {
  const subject = session.user?.id?.trim() ?? ''
  if (!subject)
    throw new ChatScopeError('authenticated session subject is unavailable')

  let identity: string
  try {
    identity = canonicalSessionIdentity(
      session.provider,
      subject,
      isProductionRuntime()
    )
  } catch (error) {
    if (error instanceof SessionIdentityError) {
      throw new ChatScopeError(error.message)
    }
    throw error
  }

  const secret = process.env.ICMFYI_IDENTITY_HMAC_SECRET ?? ''
  if (!secret && !isProductionRuntime()) {
    return {
      userId: subject,
      tenantId: `local:${identity}`
    }
  }

  const [userId, tenantId] = await Promise.all([
    deriveGatewayScopedIdentity('usr', identity, 'session', secret),
    deriveGatewayScopedIdentity('ten', identity, 'session', secret)
  ])
  const scope = { userId, tenantId }
  if (!isCanonicalChatScope(scope)) throw new ChatScopeError()
  return scope
}
