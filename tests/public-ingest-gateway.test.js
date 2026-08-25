process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.INGESTION_SERVICE_URL = 'http://ingestion-api:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { POST } = require('../app/api/ingest/route.ts')

const trustedHeaders = {
  'content-type': 'application/json',
  'x-icmfyi-user-id': `usr_${'a'.repeat(64)}`,
  'x-icmfyi-tenant-id': `ten_${'b'.repeat(64)}`
}

function request(payload, idempotencyKey = 'ingest-public-exact') {
  return new Request('https://icm.fyi/api/ingest', {
    method: 'POST',
    headers: {
      ...trustedHeaders,
      ...(idempotencyKey === null ? {} : { 'idempotency-key': idempotencyKey })
    },
    body: JSON.stringify(payload)
  })
}

test('generic gateway forwards the exact multi-platform ingestion contract', async () => {
  const beforeFetch = global.fetch
  let captured
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return Response.json(
      {
        request_id: `req_${'c'.repeat(40)}`,
        job_id: `job_${'d'.repeat(40)}`,
        status: 'queued',
        created: true,
        platform: 'twitch',
        target_kind: 'item'
      },
      { status: 202 }
    )
  }
  try {
    const payload = {
      platform: 'twitch',
      target_kind: 'item',
      target: 'https://www.twitch.tv/videos/2845546003',
      max_items: 25,
      clip_ready: true,
      transcription_mode: 'local_cpu',
      language: 'en'
    }
    const response = await POST(request(payload))
    assert.equal(response.status, 202)
    assert.equal(captured.url, 'http://ingestion-api:8080/v1/ingest')
    assert.equal(captured.init.headers.get('idempotency-key'), 'ingest-public-exact')
    assert.equal(captured.init.headers.get('x-icmfyi-user-id'), trustedHeaders['x-icmfyi-user-id'])
    assert.equal(captured.init.headers.get('x-icmfyi-tenant-id'), trustedHeaders['x-icmfyi-tenant-id'])
    assert.deepEqual(JSON.parse(captured.init.body), payload)
    assert.equal((await response.json()).platform, 'twitch')
  } finally {
    global.fetch = beforeFetch
  }
})

test('generic gateway rejects missing or ambiguous idempotency before backend contact', async () => {
  const beforeFetch = global.fetch
  let calls = 0
  global.fetch = async () => {
    calls += 1
    return Response.json({ ok: true })
  }
  const payload = {
    platform: 'youtube',
    target_kind: 'item',
    target: 'https://www.youtube.com/watch?v=abcdefghijk'
  }
  try {
    assert.equal((await POST(request(payload, null))).status, 400)
    assert.equal((await POST(request(payload, 'one,two'))).status, 400)
    assert.equal((await POST(request(payload, 'a'.repeat(256)))).status, 400)
    assert.equal((await POST(request(payload, 'a'.repeat(255)))).status, 200)
    assert.equal(calls, 1)
  } finally {
    global.fetch = beforeFetch
  }
})

test('generic gateway rejects identity injection, unknown fields, and incomplete X identity', async () => {
  const base = {
    platform: 'x',
    target_kind: 'channel',
    target: 'https://x.com/ottabag'
  }
  assert.equal((await POST(request({ ...base, tenant_id: `ten_${'e'.repeat(64)}` }))).status, 400)
  assert.equal((await POST(request({ ...base, unexpected: true }))).status, 400)
  assert.equal((await POST(request(base))).status, 400)
  assert.equal(
    (await POST(request({ ...base, platform_entity_id: 'not-numeric' }))).status,
    400
  )
})
