process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.INGESTION_SERVICE_URL = 'http://ingestion-api:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { POST } = require('../app/api/index/youtube/route.ts')
const { GET } = require('../app/api/ingestion-jobs/[id]/route.ts')

const jobId = `job_${'a'.repeat(40)}`
const requestId = `req_${'b'.repeat(40)}`
const trustedHeaders = {
  'content-type': 'application/json',
  'x-icmfyi-user-id': `usr_${'c'.repeat(64)}`,
  'x-icmfyi-tenant-id': `ten_${'d'.repeat(64)}`
}

test('youtube gateway preserves backend 202 and exact pending job body', async () => {
  let captured
  const beforeFetch = global.fetch
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return new Response(
      JSON.stringify({
        ok: true,
        status: 'accepted',
        indexed: [],
        pending: [{ job_id: jobId, request_id: requestId, status: 'queued' }],
        failed: []
      }),
      { status: 202, headers: { 'content-type': 'application/json' } }
    )
  }
  try {
    const request = new Request('https://icm.fyi/api/index/youtube', {
      method: 'POST',
      headers: trustedHeaders,
      body: JSON.stringify({
        video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        clip_ready: true
      })
    })
    const response = await POST(request)
    const body = await response.json()
    assert.equal(response.status, 202)
    assert.equal(captured.url, 'http://ingestion-api:8080/index/youtube')
    assert.equal(captured.init.signal, request.signal)
    assert.equal(body.pending[0].job_id, jobId)
    assert.equal(body.pending[0].request_id, requestId)
    assert.equal(captured.init.headers.get('x-icmfyi-internal-secret'), 's'.repeat(32))
  } finally {
    global.fetch = beforeFetch
  }
})
test('ingestion status gateway rejects non-canonical ids and scopes the canonical request', async () => {
  let calls = 0
  const beforeFetch = global.fetch
  global.fetch = async (url, init) => {
    calls += 1
    assert.equal(String(url), `http://ingestion-api:8080/v1/ingestion-jobs/${jobId}`)
    assert.equal(init.headers.get('x-icmfyi-user-id'), trustedHeaders['x-icmfyi-user-id'])
    return new Response(
      JSON.stringify({
        job_id: jobId,
        request_id: requestId,
        status: 'succeeded',
        ready: true
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  try {
    const request = new Request(`https://icm.fyi/api/ingestion-jobs/${jobId}`, {
      headers: trustedHeaders
    })
    assert.equal((await GET(request, { params: { id: '../secrets' } })).status, 404)
    const response = await GET(request, { params: { id: jobId } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).ready, true)
    assert.equal(calls, 1)
  } finally {
    global.fetch = beforeFetch
  }
})

test('ingestion proxy preserves one exact printable idempotency key and rejects ambiguity', async () => {
  const beforeFetch = global.fetch
  let captured
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const response = await POST(
      new Request('https://icm.fyi/api/index/youtube', {
        method: 'POST',
        headers: {
          ...trustedHeaders,
          'idempotency-key': 'ingest-exact-key'
        },
        body: JSON.stringify({ video_urls: ['https://youtube.com/watch?v=abcdefghijk'] })
      })
    )
    assert.equal(response.status, 200)
    assert.equal(captured.init.headers.get('idempotency-key'), 'ingest-exact-key')

    const invalid = await POST(
      new Request('https://icm.fyi/api/index/youtube', {
        method: 'POST',
        headers: {
          ...trustedHeaders,
          'idempotency-key': 'one,two'
        },
        body: JSON.stringify({ video_urls: ['https://youtube.com/watch?v=abcdefghijk'] })
      })
    )
    assert.equal(invalid.status, 400)
  } finally {
    global.fetch = beforeFetch
  }
})
