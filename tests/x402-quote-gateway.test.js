process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.INGESTION_SERVICE_URL = 'http://ingestion-api:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { POST } = require('../app/api/service/x402/quotes/[quoteId]/resolve/route.ts')

const quoteId = 'quote_exact-123'
const idempotencyKey = 'x402-exact-1'
const payload = {
  tool_name: 'icmfyi.ingest.youtube',
  request_hash: 'a'.repeat(64),
  idempotency_key: idempotencyKey
}

function request(body = payload, key = idempotencyKey) {
  return new Request(`https://icm.fyi/api/service/x402/quotes/${quoteId}/resolve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-icmfyi-user-id': `usr_${'b'.repeat(64)}`,
      'x-icmfyi-tenant-id': `ten_${'c'.repeat(64)}`
    },
    body: JSON.stringify(body)
  })
}

test('x402 quote gateway forwards one exact tenant-scoped resolver request', async () => {
  const beforeFetch = global.fetch
  let captured
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return Response.json({ provider: 'icmfyi-acp', quoteId })
  }
  try {
    const response = await POST(request(), { params: Promise.resolve({ quoteId }) })
    assert.equal(response.status, 200)
    assert.equal(
      captured.url,
      `http://ingestion-api:8080/v1/commerce/quotes/${quoteId}/resolve-payment`
    )
    assert.deepEqual(JSON.parse(captured.init.body), payload)
    assert.equal(captured.init.headers.get('idempotency-key'), idempotencyKey)
    assert.equal(captured.init.headers.get('x-icmfyi-user-id'), `usr_${'b'.repeat(64)}`)
    assert.equal(captured.init.headers.get('x-icmfyi-tenant-id'), `ten_${'c'.repeat(64)}`)
  } finally {
    global.fetch = beforeFetch
  }
})

test('x402 quote gateway rejects identity ambiguity before backend contact', async () => {
  const beforeFetch = global.fetch
  let calls = 0
  global.fetch = async () => {
    calls += 1
    return Response.json({ ok: true })
  }
  try {
    for (const [body, key] of [
      [{ ...payload, tenant_id: `ten_${'d'.repeat(64)}` }, idempotencyKey],
      [payload, 'different-key'],
      [{ ...payload, idempotency_key: 'one,two' }, 'one,two'],
      [{ ...payload, request_hash: 'A'.repeat(64) }, idempotencyKey]
    ]) {
      assert.equal(
        (await POST(request(body, key), { params: Promise.resolve({ quoteId }) })).status,
        400
      )
    }
    assert.equal(
      (await POST(request(), { params: Promise.resolve({ quoteId: '../admin' }) })).status,
      400
    )
    const oversized = new Request(
      `https://icm.fyi/api/service/x402/quotes/${quoteId}/resolve`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          'x-icmfyi-user-id': `usr_${'b'.repeat(64)}`,
          'x-icmfyi-tenant-id': `ten_${'c'.repeat(64)}`
        },
        body: JSON.stringify({ ...payload, padding: 'x'.repeat(4096) })
      }
    )
    assert.equal(
      (await POST(oversized, { params: Promise.resolve({ quoteId }) })).status,
      400
    )
    assert.equal(
      (await POST(
        new Request(`https://icm.fyi/api/service/x402/quotes/${quoteId}/resolve`, {
          method: 'POST',
          headers: {
            'content-type': 'text/plain',
            'idempotency-key': idempotencyKey
          },
          body: JSON.stringify(payload)
        }),
        { params: Promise.resolve({ quoteId }) }
      )).status,
      400
    )
    assert.equal(calls, 0)
  } finally {
    global.fetch = beforeFetch
  }
})

test('x402 quote gateway bounds an invalid backend response', async () => {
  const beforeFetch = global.fetch
  global.fetch = async () => new Response('{}', {
    status: 200,
    headers: { 'content-length': String(1024 * 1024 + 1) }
  })
  try {
    const response = await POST(request(), { params: Promise.resolve({ quoteId }) })
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'invalid ingestion backend response'
    })
  } finally {
    global.fetch = beforeFetch
  }
})
