process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.CLIP_SERVICE_URL = 'http://clip-service:8080'
delete process.env.CLIP_BATCH_ENABLED

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { POST } = require('../app/api/clips/batch/route.ts')

test('production clip batch gateway is default-off even when a service URL exists', async () => {
  let calls = 0
  const beforeFetch = global.fetch
  global.fetch = async () => {
    calls += 1
    throw new Error('unsupported batch must not be contacted')
  }
  try {
    const response = await POST(new Request('https://icm.fyi/api/clips/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clips: [] })
    }))
    assert.equal(response.status, 501)
    assert.equal((await response.json()).error, 'not_implemented')
    assert.equal(calls, 0)
  } finally {
    global.fetch = beforeFetch
  }
})
