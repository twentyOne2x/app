import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload
} from 'jose'

export const ICMFYI_OAUTH_SCOPES = [
  'icmfyi:setup:read',
  'icmfyi:ingest:write',
  'icmfyi:ingest:read',
  'icmfyi:query:read',
  'icmfyi:export:write',
  'icmfyi:export:read',
  'icmfyi:clip:write',
  'icmfyi:clip:read'
] as const

export type IcmfyiOAuthScope = (typeof ICMFYI_OAUTH_SCOPES)[number]

export type OAuthBearerConfiguration = Readonly<{
  issuer: string
  audience: string
  jwksUrl: string
}>

export type OAuthBearerPrincipal = Readonly<{
  subject: string
  issuer: string
  audience: string
  clientId: string
  expiresAt: number
  scopes: ReadonlySet<string>
}>

const ALLOWED_JWS_ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'] as const
const MAX_BEARER_BYTES = 16_384
const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export class OAuthBearerError extends Error {
  constructor(
    readonly code: 'invalid_configuration' | 'invalid_token' | 'insufficient_scope',
    message: string
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'OAuthBearerError'
  }
}

export function oauthBearerConfigurationFromEnv(
  env: NodeJS.ProcessEnv = process.env
): OAuthBearerConfiguration {
  const issuer = exactHttpsUrl(env.ICMFYI_MCP_OAUTH_ISSUER, 'ICMFYI_MCP_OAUTH_ISSUER')
  const audience = exactHttpsUrl(env.ICMFYI_MCP_AUDIENCE, 'ICMFYI_MCP_AUDIENCE')
  const jwksUrl = exactHttpsUrl(env.ICMFYI_MCP_OAUTH_JWKS_URL, 'ICMFYI_MCP_OAUTH_JWKS_URL')
  return Object.freeze({ issuer, audience, jwksUrl })
}

export function bearerTokenFromHeader(header: string | null): string | null {
  if (header === null) return null
  const match = /^Bearer ([^\s,]+)$/i.exec(header)
  if (!match || !match[1] || match[1].length > MAX_BEARER_BYTES) {
    throw new OAuthBearerError('invalid_token', 'The bearer authorization header is invalid.')
  }
  return match[1]
}

export async function verifyIcmfyiBearerToken(
  token: string,
  configuration: OAuthBearerConfiguration,
  keySet?: JWTVerifyGetKey
): Promise<OAuthBearerPrincipal> {
  if (!token || token.length > MAX_BEARER_BYTES || /[\s,]/.test(token)) {
    throw new OAuthBearerError('invalid_token', 'The bearer token is invalid.')
  }
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(
      token,
      keySet ?? remoteKeySet(configuration.jwksUrl),
      {
        issuer: configuration.issuer,
        audience: configuration.audience,
        algorithms: [...ALLOWED_JWS_ALGORITHMS],
        clockTolerance: 5
      }
    ))
  } catch {
    throw new OAuthBearerError(
      'invalid_token',
      'The access token is invalid for this ICMFYI resource.'
    )
  }
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub.trim() ||
    typeof payload.exp !== 'number' ||
    !Number.isSafeInteger(payload.exp)
  ) {
    throw new OAuthBearerError('invalid_token', 'The access token lacks a valid sub or exp.')
  }
  const scopes = parseScopes(payload)
  const clientId =
    typeof payload.client_id === 'string' && payload.client_id.trim()
      ? payload.client_id
      : payload.sub
  return Object.freeze({
    subject: payload.sub,
    issuer: configuration.issuer,
    audience: configuration.audience,
    clientId,
    expiresAt: payload.exp,
    scopes
  })
}

export function requiredOAuthScope(method: string, pathname: string): IcmfyiOAuthScope | null {
  const normalizedMethod = method.toUpperCase()
  if (pathname === '/api/healthz' && normalizedMethod === 'GET') return 'icmfyi:setup:read'
  if (pathname === '/api/index/youtube' && normalizedMethod === 'POST') {
    return 'icmfyi:ingest:write'
  }
  if (pathname === '/api/ingest' && normalizedMethod === 'POST') {
    return 'icmfyi:ingest:write'
  }
  if (/^\/api\/ingestion-jobs\/job_[0-9a-f]{40}$/.test(pathname) && normalizedMethod === 'GET') {
    return 'icmfyi:ingest:read'
  }
  if ((pathname === '/api/chat' || pathname === '/api/chat/stream') && normalizedMethod === 'POST') {
    return 'icmfyi:query:read'
  }
  if (pathname === '/api/tenant-exports' && normalizedMethod === 'POST') {
    return 'icmfyi:export:write'
  }
  if (
    /^\/api\/tenant-exports\/tex_[0-9a-f]{40}(?:\/artifacts\/(?:database|manifest))?$/.test(pathname) &&
    normalizedMethod === 'GET'
  ) {
    return 'icmfyi:export:read'
  }
  if (
    (pathname === '/api/clips' || pathname === '/api/clips/batch') &&
    normalizedMethod === 'POST'
  ) {
    return 'icmfyi:clip:write'
  }
  if (/^\/api\/clips\/[0-9a-f]{32}\/retry$/.test(pathname) && normalizedMethod === 'POST') {
    return 'icmfyi:clip:write'
  }
  if (/^\/api\/clips\/batch\/[A-Za-z0-9._:-]+$/.test(pathname)) {
    if (normalizedMethod === 'GET') return 'icmfyi:clip:read'
    if (normalizedMethod === 'PATCH') return 'icmfyi:clip:write'
  }
  if (
    /^\/api\/clips\/[0-9a-f]{32}(?:\/stream)?$/.test(pathname) &&
    normalizedMethod === 'GET'
  ) {
    return 'icmfyi:clip:read'
  }
  return null
}

export function requirePrincipalScope(
  principal: OAuthBearerPrincipal,
  requiredScope: IcmfyiOAuthScope | null
): void {
  if (!requiredScope || !principal.scopes.has(requiredScope)) {
    throw new OAuthBearerError('insufficient_scope', 'The access token lacks the required scope.')
  }
}

function parseScopes(payload: JWTPayload): ReadonlySet<string> {
  let values: unknown[]
  if (typeof payload.scope === 'string') {
    values = payload.scope.split(/\s+/).filter(Boolean)
  } else if (Array.isArray(payload.scp)) {
    values = payload.scp
  } else {
    values = []
  }
  if (values.some((value) => typeof value !== 'string' || !value || /\s/.test(value))) {
    throw new OAuthBearerError('invalid_token', 'The access token scope claim is invalid.')
  }
  return new Set(values as string[])
}

function remoteKeySet(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = remoteKeySets.get(jwksUrl)
  if (existing) return existing
  const created = createRemoteJWKSet(new URL(jwksUrl))
  remoteKeySets.set(jwksUrl, created)
  return created
}

function exactHttpsUrl(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? ''
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new OAuthBearerError('invalid_configuration', `${name} must be an absolute HTTPS URL.`)
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    normalized !== value
  ) {
    throw new OAuthBearerError(
      'invalid_configuration',
      `${name} must be an exact credential-free HTTPS URL without query or fragment.`
  )
  }
  return normalized
}
