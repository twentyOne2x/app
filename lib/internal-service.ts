const SCOPE_HEADERS = ['x-icmfyi-user-id', 'x-icmfyi-tenant-id'] as const

export function isProductionRuntime() {
  return process.env.ICMFYI_PRODUCTION === '1' || process.env.NODE_ENV === 'production'
}

export function internalServiceHeaders(request: Request, init?: HeadersInit): Headers {
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

export function tenantScopedPayload(request: Request, payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
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
