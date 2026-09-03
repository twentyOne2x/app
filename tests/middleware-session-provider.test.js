process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.ICMFYI_IDENTITY_HMAC_SECRET = 'i'.repeat(32)

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { NextRequest } = require('next/server')

let token = null
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'next-auth/jwt') {
    return { getToken: async () => token }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { middleware } = require('../middleware.ts')
Module._load = originalLoad

function chatRequest() {
  return new NextRequest('https://icm.fyi/api/chat', { method: 'POST' })
}

test('production middleware rejects missing and unsupported session providers', async () => {
  for (const provider of [undefined, null, '', 'unknown', 'github', 'e2e', 'local-dev']) {
    token = { userId: 'provider-subject-123', provider }
    const response = await middleware(chatRequest())
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'authentication_required' })
  }
})

test('production middleware derives the same canonical pair for allowed providers', async () => {
  const { deriveGatewayScopedIdentity } = require('../lib/gateway-identity.ts')
  for (const provider of ['google', 'twitter']) {
    token = { userId: 'provider-subject-123', provider }
    const response = await middleware(chatRequest())
    assert.equal(response.status, 200)
    const identity = `${provider}:provider-subject-123`
    assert.equal(
      response.headers.get('x-middleware-request-x-icmfyi-user-id'),
      await deriveGatewayScopedIdentity(
        'usr',
        identity,
        'session',
        process.env.ICMFYI_IDENTITY_HMAC_SECRET
      )
    )
    assert.equal(
      response.headers.get('x-middleware-request-x-icmfyi-tenant-id'),
      await deriveGatewayScopedIdentity(
        'ten',
        identity,
        'session',
        process.env.ICMFYI_IDENTITY_HMAC_SECRET
      )
    )
  }
})
