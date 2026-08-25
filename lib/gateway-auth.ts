import {
  bearerTokenFromHeader,
  oauthBearerConfigurationFromEnv,
  requirePrincipalScope,
  requiredOAuthScope,
  verifyIcmfyiBearerToken,
  type OAuthBearerPrincipal
} from '@/lib/oauth-bearer'

export type GatewayExternalIdentity = Readonly<{
  identity: string
  realm: 'session' | 'oauth'
}>

export async function resolveGatewayExternalIdentity(
  input: Readonly<{
    authorization: string | null
    method: string
    pathname: string
    env?: NodeJS.ProcessEnv
  }>,
  dependencies: Readonly<{
    sessionIdentity: () => Promise<string | null>
    verifyBearer?: (
      token: string,
      configuration: ReturnType<typeof oauthBearerConfigurationFromEnv>
    ) => Promise<OAuthBearerPrincipal>
  }>
): Promise<GatewayExternalIdentity> {
  if (input.authorization !== null) {
    const bearer = bearerTokenFromHeader(input.authorization)
    if (!bearer) throw new Error('bearer token is absent')
    const configuration = oauthBearerConfigurationFromEnv(input.env)
    const principal = await (dependencies.verifyBearer ?? verifyIcmfyiBearerToken)(
      bearer,
      configuration
    )
    requirePrincipalScope(
      principal,
      requiredOAuthScope(input.method, input.pathname)
    )
    return Object.freeze({
      identity: `${principal.issuer}:${principal.subject}`,
      realm: 'oauth' as const
    })
  }
  const identity = await dependencies.sessionIdentity()
  if (!identity) throw new Error('authentication_required')
  return Object.freeze({ identity, realm: 'session' as const })
}
