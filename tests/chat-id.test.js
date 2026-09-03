process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  newPublicShareId,
  PUBLIC_SHARE_ID_PATTERN
} = require('../lib/chat-id.ts')

test('public share ids carry a distinct high-entropy fixed-width shape', () => {
  const ids = new Set(Array.from({ length: 256 }, () => newPublicShareId()))
  assert.equal(ids.size, 256)
  for (const id of ids) assert.match(id, PUBLIC_SHARE_ID_PATTERN)
})
