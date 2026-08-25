process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  authoritativeRequestUserId,
  internalServiceHeaders,
  tenantScopedPayload,
  trustedGatewayUserId,
  TrustedGatewayIdentityError
} = require('../lib/internal-service.ts')

function withEnvironment(values, callback) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  try {
    return callback()
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('production service headers use only gateway-derived scope and configured secret', () => {
  withEnvironment(
    { ICMFYI_PRODUCTION: '1', INTERNAL_SERVICE_SECRET: 's'.repeat(32) },
    () => {
      const request = new Request('https://icm.fyi/api/clips', {
        headers: {
          'x-icmfyi-user-id': 'usr_trusted',
          'x-icmfyi-tenant-id': 'ten_trusted',
          authorization: 'Bearer caller-controlled'
        }
      })
      const headers = internalServiceHeaders(request, { 'Content-Type': 'application/json' })
      assert.equal(headers.get('x-icmfyi-user-id'), 'usr_trusted')
      assert.equal(headers.get('x-icmfyi-tenant-id'), 'ten_trusted')
      assert.equal(headers.get('x-icmfyi-internal-secret'), 's'.repeat(32))
      assert.equal(headers.get('authorization'), null)
    }
  )
})

test('production service headers fail closed without gateway scope', () => {
  withEnvironment(
    { ICMFYI_PRODUCTION: '1', INTERNAL_SERVICE_SECRET: 's'.repeat(32) },
    () => {
      const request = new Request('https://icm.fyi/api/clips')
      assert.throws(() => internalServiceHeaders(request), /trusted gateway scope is missing/)
    }
  )
})

test('tenant payload discards caller identity widening', () => {
  const request = new Request('https://icm.fyi/api/clips', {
    headers: {
      'x-icmfyi-user-id': 'usr_trusted',
      'x-icmfyi-tenant-id': 'ten_trusted'
    }
  })
  assert.deepEqual(
    tenantScopedPayload(request, {
      source: 'video',
      user_id: 'usr_attacker',
      tenantId: 'ten_attacker'
    }),
    {
      source: 'video',
      user_id: 'usr_trusted',
      tenant_id: 'ten_trusted'
    }
  )
})

test('chat identity accepts only the gateway HMAC identifier shape', () => {
  const trusted = `usr_${'a'.repeat(64)}`
  assert.equal(
    trustedGatewayUserId(new Request('https://icm.fyi/api/chat', {
      headers: { 'x-icmfyi-user-id': trusted }
    })),
    trusted
  )
  assert.equal(
    trustedGatewayUserId(new Request('https://icm.fyi/api/chat', {
      headers: { 'x-icmfyi-user-id': 'oauth:attacker' }
    })),
    null
  )
})

test('production Bearer requests use only the trusted gateway principal', () => {
  withEnvironment({ ICMFYI_PRODUCTION: '1' }, () => {
    const gatewayUser = `usr_${'a'.repeat(64)}`
    const request = new Request('https://icm.fyi/api/chat', {
      headers: {
        authorization: 'Bearer valid-token',
        'x-icmfyi-user-id': gatewayUser
      }
    })
    assert.equal(authoritativeRequestUserId(request, 'session-user-b'), gatewayUser)
    assert.equal(authoritativeRequestUserId(request, null), gatewayUser)
  })
})

test('production Bearer requests fail closed without an exact gateway principal', () => {
  withEnvironment({ ICMFYI_PRODUCTION: '1' }, () => {
    for (const headers of [
      { authorization: 'Bearer valid-token' },
      {
        authorization: 'Bearer valid-token',
        'x-icmfyi-user-id': 'session-user-b'
      }
    ]) {
      assert.throws(
        () => authoritativeRequestUserId(
          new Request('https://icm.fyi/api/chat', { headers }),
          'session-user-b'
        ),
        TrustedGatewayIdentityError
      )
    }
  })
})

test('cookie-only and nonproduction chat ownership preserves the raw session user', () => {
  const gatewayUser = `usr_${'b'.repeat(64)}`
  withEnvironment({ ICMFYI_PRODUCTION: '1' }, () => {
    assert.equal(
      authoritativeRequestUserId(
        new Request('https://icm.fyi/api/chat', {
          headers: { 'x-icmfyi-user-id': gatewayUser }
        }),
        'session-user-b'
      ),
      'session-user-b'
    )
  })
  withEnvironment({ ICMFYI_PRODUCTION: '0', NODE_ENV: 'test' }, () => {
    assert.equal(
      authoritativeRequestUserId(
        new Request('https://icm.fyi/api/chat', {
          headers: {
            authorization: 'Bearer ignored-in-nonproduction',
            'x-icmfyi-user-id': gatewayUser
          }
        }),
        'session-user-b'
      ),
      'session-user-b'
    )
  })
})
