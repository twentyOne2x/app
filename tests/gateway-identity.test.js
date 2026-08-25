process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { deriveGatewayScopedIdentity } = require('../lib/gateway-identity.ts')

test('gateway identity projection is realm and prefix separated', async () => {
  const secret = 'i'.repeat(32)
  const external = 'https://auth.icm.fyi:user-123'
  const user = await deriveGatewayScopedIdentity('usr', external, 'oauth', secret)
  const tenant = await deriveGatewayScopedIdentity('ten', external, 'oauth', secret)
  const sessionUser = await deriveGatewayScopedIdentity('usr', external, 'session', secret)

  assert.equal(
    user,
    'usr_e85f4eee97fdca0f4959ab1a86c20cddbdde1b5825251c82a183ecc567823bce'
  )
  assert.equal(
    tenant,
    'ten_f47dcec0cc9bf731185305067fa7f8b2a2ce88c0bc05202fdb2b315898801f21'
  )
  assert.notEqual(user.slice(4), tenant.slice(4))
  assert.notEqual(user, sessionUser)
  assert.equal(
    await deriveGatewayScopedIdentity('usr', external, 'oauth', secret),
    user
  )
})

test('gateway identity projection rejects weak secrets and ambiguous identities', async () => {
  await assert.rejects(
    deriveGatewayScopedIdentity('usr', 'subject', 'oauth', 'short'),
    /must be at least 32/
  )
  for (const identity of ['', 'subject\nsecond', 'x'.repeat(4097)]) {
    await assert.rejects(
      deriveGatewayScopedIdentity('usr', identity, 'oauth', 'i'.repeat(32)),
      /identity is invalid/
    )
  }
})
