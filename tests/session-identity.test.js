process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canonicalSessionIdentity,
  SessionIdentityError
} = require('../lib/session-identity.ts')
const { ChatScopeError, sessionChatScope } = require('../lib/chat-scope.ts')

function session(provider, id = 'provider-subject-123') {
  return { user: { id }, provider, expires: '2099-01-01T00:00:00.000Z' }
}

test('production accepts only exact stable OAuth provider identities', async () => {
  const before = {
    ICMFYI_PRODUCTION: process.env.ICMFYI_PRODUCTION,
    ICMFYI_IDENTITY_HMAC_SECRET: process.env.ICMFYI_IDENTITY_HMAC_SECRET
  }
  try {
    process.env.ICMFYI_PRODUCTION = '1'
    process.env.ICMFYI_IDENTITY_HMAC_SECRET = 'i'.repeat(32)
    for (const provider of ['google', 'twitter']) {
      const scope = await sessionChatScope(session(provider))
      assert.match(scope.userId, /^usr_[0-9a-f]{64}$/)
      assert.match(scope.tenantId, /^ten_[0-9a-f]{64}$/)
      assert.equal(
        canonicalSessionIdentity(provider, 'provider-subject-123', true),
        `${provider}:provider-subject-123`
      )
    }
    for (const provider of [undefined, null, '', 'unknown', 'e2e', 'local-dev', 'Google']) {
      await assert.rejects(sessionChatScope(session(provider)), ChatScopeError)
    }
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('nonproduction allows only explicit local test providers and never unknown', () => {
  assert.equal(
    canonicalSessionIdentity('e2e', 'test-subject', false),
    'e2e:test-subject'
  )
  assert.equal(
    canonicalSessionIdentity('local-dev', 'test-subject', false),
    'local-dev:test-subject'
  )
  for (const provider of [undefined, 'unknown', 'github']) {
    assert.throws(
      () => canonicalSessionIdentity(provider, 'test-subject', false),
      SessionIdentityError
    )
  }
})
