const SCOPE_HEADERS = ['x-icmfyi-user-id', 'x-icmfyi-tenant-id'] as const
const TRUSTED_USER_ID = /^usr_[0-9a-f]{64}$/

export class TrustedGatewayIdentityError extends Error {
  constructor() {
    super(
      'trusted gateway identity is missing for an authorized production request'
    )
    this.name = 'TrustedGatewayIdentityError'
  }
}

export function isProductionRuntime() {
  return (
    process.env.ICMFYI_PRODUCTION === '1' ||
    process.env.NODE_ENV === 'production'
  )
}

export function internalServiceHeaders(
  request: Request,
  init?: HeadersInit
): Headers {
  const headers = new Headers(init)
  const secret = process.env.INTERNAL_SERVICE_SECRET
  if (isProductionRuntime() && (!secret || secret.length < 32)) {
    throw new Error('internal service authentication is not configured')
  }
  if (secret) headers.set('x-icmfyi-internal-secret', secret)

  for (const name of SCOPE_HEADERS) {
    const value = request.headers.get(name)?.trim()
    if (isProductionRuntime() && !value) {
      throw new Error(`trusted gateway scope is missing ${name}`)
    }
    if (value) headers.set(name, value)
  }

  return headers
}

export function tenantScopedPayload(
  request: Request,
  payload: unknown
): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return payload
  const tenantId = request.headers.get('x-icmfyi-tenant-id')?.trim()
  const userId = request.headers.get('x-icmfyi-user-id')?.trim()
  const clean = { ...(payload as Record<string, unknown>) }
  delete clean.tenant_id
  delete clean.tenantId
  delete clean.user_id
  delete clean.userId
  return {
    ...clean,
    ...(tenantId ? { tenant_id: tenantId } : {}),
    ...(userId ? { user_id: userId } : {})
  }
}

export function trustedGatewayUserId(request: Request): string | null {
  const value = request.headers.get('x-icmfyi-user-id')?.trim() ?? ''
  return TRUSTED_USER_ID.test(value) ? value : null
}

/** Prefer the gateway's HMAC-derived principal for every production API call.
 * Falling back to the raw session subject is development-only behavior when no
 * trusted gateway scope has been attached. */
export function authoritativeRequestUserId(
  request: Request,
  sessionUserId: string | null | undefined
): string | null {
  const gatewayUserId = trustedGatewayUserId(request)
  if (isProductionRuntime() && request.headers.has('authorization')) {
    if (!gatewayUserId) throw new TrustedGatewayIdentityError()
    return gatewayUserId
  }
  return gatewayUserId ?? sessionUserId ?? null
}
