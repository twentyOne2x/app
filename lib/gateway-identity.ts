export type GatewayIdentityRealm = 'session' | 'oauth'
export type GatewayIdentityPrefix = 'usr' | 'ten'

const MAX_EXTERNAL_IDENTITY_BYTES = 4096

/** Deterministically project an external authenticated identity into the
 * opaque user/tenant namespace shared by the app gateway and MCP seller. */
export async function deriveGatewayScopedIdentity(
  prefix: GatewayIdentityPrefix,
  identity: string,
  identityRealm: GatewayIdentityRealm,
  secret: string
): Promise<string> {
  if (secret.length < 32) {
    throw new Error('ICMFYI_IDENTITY_HMAC_SECRET must be at least 32 characters')
  }
  if (
    !identity ||
    new TextEncoder().encode(identity).byteLength > MAX_EXTERNAL_IDENTITY_BYTES ||
    /[\u0000-\u001f\u007f]/.test(identity)
  ) {
    throw new Error('external gateway identity is invalid')
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${prefix}:${identityRealm}:${identity}`)
  )
  const digest = Array.from(
    new Uint8Array(signature),
    byte => byte.toString(16).padStart(2, '0')
  ).join('')
  return `${prefix}_${digest}`
}
