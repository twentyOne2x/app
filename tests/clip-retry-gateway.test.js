process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.CLIP_SERVICE_URL = 'http://clip-service:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { POST: createClip } = require('../app/api/clips/route.ts')
const { POST: retryClip } = require('../app/api/clips/[id]/retry/route.ts')
const { GET: getClip } = require('../app/api/clips/[id]/route.ts')

const clipId = 'a'.repeat(32)
const nextClipId = 'b'.repeat(32)
const mediaId = '0199a100-0000-7000-8000-000000000001'
const trustedHeaders = {
  'content-type': 'application/json',
  'x-icmfyi-user-id': `usr_${'c'.repeat(64)}`,
  'x-icmfyi-tenant-id': `ten_${'d'.repeat(64)}`
}

test('clip create forwards a stable external idempotency key as a header only', async () => {
  const beforeFetch = global.fetch
  let captured
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return new Response(JSON.stringify({ clipId, status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const response = await createClip(new Request('https://icm.fyi/api/clips', {
      method: 'POST',
      headers: trustedHeaders,
      body: JSON.stringify({
        idempotencyKey: 'clip-create-stable-key',
        mediaId,
        start: 0,
        end: 10,
        contextMode: 'seconds',
        padBefore: 0,
        padAfter: 0,
        preferVideo: true,
        renderProfile: 'hq-1080p-v1'
      })
    }))
    assert.equal(response.status, 200)
    assert.equal(captured.url, 'http://clip-service:8080/clips')
    assert.equal(captured.init.headers.get('idempotency-key'), 'clip-create-stable-key')
    assert.equal(JSON.parse(captured.init.body).idempotencyKey, undefined)
  } finally {
    global.fetch = beforeFetch
  }
})
test('clip retry requires a new stable key and sends no caller-controlled body', async () => {
  const beforeFetch = global.fetch
  let captured
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return new Response(JSON.stringify({ clipId: nextClipId, status: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const request = new Request(`https://icm.fyi/api/clips/${clipId}/retry`, {
      method: 'POST',
      headers: trustedHeaders,
      body: JSON.stringify({ idempotencyKey: 'clip-retry-stable-key' })
    })
    const invalid = await retryClip(request, { params: { id: '../wrong' } })
    assert.equal(invalid.status, 404)
    const response = await retryClip(request, { params: { id: clipId } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: nextClipId, status: 'queued' })
    assert.equal(captured.url, `http://clip-service:8080/clips/${clipId}/retry`)
    assert.equal(captured.init.headers.get('idempotency-key'), 'clip-retry-stable-key')
    assert.equal(captured.init.body, undefined)
  } finally {
    global.fetch = beforeFetch
  }
})

test('clip status sanitizer preserves expired as a terminal user-visible state', async () => {
  const beforeFetch = global.fetch
  global.fetch = async () => new Response(
    JSON.stringify({ clipId, status: 'expired', lastUpdated: '2026-08-25T00:00:00Z' }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
  try {
    const response = await getClip(
      new Request(`https://icm.fyi/api/clips/${clipId}`, { headers: trustedHeaders }),
      { params: { id: clipId } }
    )
    assert.equal(response.status, 200)
    assert.equal((await response.json()).status, 'expired')
  } finally {
    global.fetch = beforeFetch
  }
})
