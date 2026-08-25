process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { GET } = require('../app/api/healthz/route.ts')

const required = {
  ICMFYI_PRODUCTION: '1',
  NEXTAUTH_SECRET: 'n'.repeat(32),
  INTERNAL_SERVICE_SECRET: 's'.repeat(32),
  ICMFYI_IDENTITY_HMAC_SECRET: 'i'.repeat(32),
  ICMFYI_MCP_AUDIENCE: 'https://mcp.icm.fyi',
  ICMFYI_MCP_OAUTH_ISSUER: 'https://auth.icm.fyi',
  ICMFYI_MCP_OAUTH_JWKS_URL: 'https://auth.icm.fyi/.well-known/jwks.json',
  RAG_SERVICE_URL: 'http://rag:8000',
  INGESTION_SERVICE_URL: 'http://ingestion-api:8080',
  CLIP_SERVICE_URL: 'http://clip-api:8090'
}

test('production health requires the dedicated identity HMAC key', async () => {
  const before = Object.fromEntries(
    Object.keys(required).map(name => [name, process.env[name]])
  )
  try {
    Object.assign(process.env, required)
    assert.equal((await GET()).status, 200)

    process.env.ICMFYI_IDENTITY_HMAC_SECRET = 'weak'
    assert.equal((await GET()).status, 503)

    delete process.env.ICMFYI_IDENTITY_HMAC_SECRET
    assert.equal((await GET()).status, 503)
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
