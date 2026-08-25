process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair
} = require('jose')

const {
  OAuthBearerError,
  bearerTokenFromHeader,
  oauthBearerConfigurationFromEnv,
  requiredOAuthScope,
  requirePrincipalScope,
  verifyIcmfyiBearerToken
} = require('../lib/oauth-bearer.ts')
const { resolveGatewayExternalIdentity } = require('../lib/gateway-auth.ts')

const configuration = Object.freeze({
  issuer: 'https://auth.icm.fyi',
  audience: 'https://icm.fyi/mcp',
  jwksUrl: 'https://auth.icm.fyi/.well-known/jwks.json'
})

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'test-key'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  const keySet = createLocalJWKSet({ keys: [jwk] })
  const sign = async ({
    issuer = configuration.issuer,
    audience = configuration.audience,
    expiration = '5m',
    scope = 'icmfyi:query:read'
  } = {}) =>
    new SignJWT({ scope, client_id: 'mcp-client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey)
  return { keySet, sign }
}

test('OAuth bearer verifies exact issuer, audience, expiry, asymmetric algorithm and scopes', async () => {
  const { keySet, sign } = await fixture()
  const principal = await verifyIcmfyiBearerToken(await sign(), configuration, keySet)
  assert.equal(principal.subject, 'user-123')
  assert.equal(principal.clientId, 'mcp-client')
  assert.deepEqual([...principal.scopes], ['icmfyi:query:read'])
  assert.doesNotThrow(() => requirePrincipalScope(principal, 'icmfyi:query:read'))
  assert.throws(
    () => requirePrincipalScope(principal, 'icmfyi:clip:write'),
    (error) => error instanceof OAuthBearerError && error.code === 'insufficient_scope'
  )
})

test('wrong issuer, wrong audience and expired access tokens all fail closed', async () => {
  const { keySet, sign } = await fixture()
  for (const token of [
    await sign({ issuer: 'https://attacker.example' }),
    await sign({ audience: 'https://icm.fyi/not-mcp' }),
    await sign({ expiration: '-10s' })
  ]) {
    await assert.rejects(
      verifyIcmfyiBearerToken(token, configuration, keySet),
      (error) => error instanceof OAuthBearerError && error.code === 'invalid_token'
    )
  }
})

test('bearer parsing and OAuth URL configuration reject ambiguity and credentials', () => {
  assert.equal(bearerTokenFromHeader('Bearer a.b.c'), 'a.b.c')
  for (const header of ['Basic abc', 'Bearer one,two', 'Bearer one two', 'Bearer ']) {
    assert.throws(() => bearerTokenFromHeader(header), OAuthBearerError)
  }
  assert.throws(
    () =>
      oauthBearerConfigurationFromEnv({
        ICMFYI_MCP_OAUTH_ISSUER: 'http://auth.icm.fyi',
        ICMFYI_MCP_AUDIENCE: configuration.audience,
        ICMFYI_MCP_OAUTH_JWKS_URL: configuration.jwksUrl
      }),
    (error) => error instanceof OAuthBearerError && error.code === 'invalid_configuration'
  )
  assert.throws(
    () =>
      oauthBearerConfigurationFromEnv({
        ICMFYI_MCP_OAUTH_ISSUER: configuration.issuer,
        ICMFYI_MCP_AUDIENCE: configuration.audience,
        ICMFYI_MCP_OAUTH_JWKS_URL: 'https://user:secret@auth.icm.fyi/jwks'
      }),
    OAuthBearerError
  )
})

test('route scope map is method-specific and refuses unknown or malformed product routes', () => {
  const jobId = `job_${'a'.repeat(40)}`
  const exportId = `tex_${'b'.repeat(40)}`
  const clipId = 'c'.repeat(32)
  assert.equal(requiredOAuthScope('POST', '/api/index/youtube'), 'icmfyi:ingest:write')
  assert.equal(requiredOAuthScope('POST', '/api/ingest'), 'icmfyi:ingest:write')
  assert.equal(requiredOAuthScope('GET', `/api/ingestion-jobs/${jobId}`), 'icmfyi:ingest:read')
  assert.equal(requiredOAuthScope('POST', '/api/chat'), 'icmfyi:query:read')
  assert.equal(requiredOAuthScope('POST', '/api/tenant-exports'), 'icmfyi:export:write')
  assert.equal(requiredOAuthScope('GET', `/api/tenant-exports/${exportId}/artifacts/database`), 'icmfyi:export:read')
  assert.equal(requiredOAuthScope('POST', '/api/clips'), 'icmfyi:clip:write')
  assert.equal(requiredOAuthScope('GET', `/api/clips/${clipId}/stream`), 'icmfyi:clip:read')
  assert.equal(requiredOAuthScope('POST', `/api/clips/${clipId}/retry`), 'icmfyi:clip:write')
  assert.equal(
    requiredOAuthScope('POST', '/api/service/x402/quotes/quote_abc-123/resolve'),
    'icmfyi:commerce:write'
  )
  assert.equal(requiredOAuthScope('GET', '/api/index/youtube'), null)
  assert.equal(requiredOAuthScope('GET', '/api/ingest'), null)
  assert.equal(requiredOAuthScope('GET', `/api/ingestion-jobs/${jobId}/../admin`), null)
  assert.equal(requiredOAuthScope('POST', '/api/service/orders'), null)
  assert.equal(requiredOAuthScope('GET', '/api/service/x402/quotes/quote_abc-123/resolve'), null)
})

test('invalid Bearer never downgrades to a valid cookie session, while no Bearer preserves session auth', async () => {
  let sessionCalls = 0
  const sessionIdentity = async () => {
    sessionCalls += 1
    return 'google:cookie-user'
  }
  await assert.rejects(
    resolveGatewayExternalIdentity(
      {
        authorization: 'Bearer invalid-token',
        method: 'POST',
        pathname: '/api/chat',
        env: {
          ICMFYI_MCP_OAUTH_ISSUER: configuration.issuer,
          ICMFYI_MCP_AUDIENCE: configuration.audience,
          ICMFYI_MCP_OAUTH_JWKS_URL: configuration.jwksUrl
        }
      },
      {
        sessionIdentity,
        verifyBearer: async () => {
          throw new OAuthBearerError('invalid_token', 'invalid')
        }
      }
    ),
    (error) => error instanceof OAuthBearerError && error.code === 'invalid_token'
  )
  assert.equal(sessionCalls, 0)

  const bearer = await resolveGatewayExternalIdentity(
    {
      authorization: 'Bearer valid-token',
      method: 'POST',
      pathname: '/api/chat',
      env: {
        ICMFYI_MCP_OAUTH_ISSUER: configuration.issuer,
        ICMFYI_MCP_AUDIENCE: configuration.audience,
        ICMFYI_MCP_OAUTH_JWKS_URL: configuration.jwksUrl
      }
    },
    {
      sessionIdentity,
      verifyBearer: async () => ({
        subject: 'oauth-user',
        issuer: configuration.issuer,
        audience: configuration.audience,
        clientId: 'mcp-client',
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        scopes: new Set(['icmfyi:query:read'])
      })
    }
  )
  assert.deepEqual(bearer, {
    identity: `${configuration.issuer}:oauth-user`,
    realm: 'oauth'
  })
  assert.equal(sessionCalls, 0)

  const session = await resolveGatewayExternalIdentity(
    { authorization: null, method: 'POST', pathname: '/api/chat' },
    { sessionIdentity }
  )
  assert.deepEqual(session, { identity: 'google:cookie-user', realm: 'session' })
  assert.equal(sessionCalls, 1)
})
