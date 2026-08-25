process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.INGESTION_SERVICE_URL = 'http://ingestion-api:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const { createHash } = require('node:crypto')
const test = require('node:test')
const assert = require('node:assert/strict')

const { POST } = require('../app/api/tenant-exports/route.ts')
const { GET: getExport } = require('../app/api/tenant-exports/[id]/route.ts')
const {
  GET: getArtifact
} = require('../app/api/tenant-exports/[id]/artifacts/[name]/route.ts')

const exportId = `tex_${'a'.repeat(40)}`
const trustedHeaders = {
  'content-type': 'application/json',
  'x-icmfyi-user-id': `usr_${'b'.repeat(64)}`,
  'x-icmfyi-tenant-id': `ten_${'c'.repeat(64)}`
}

test('tenant export creation forwards only validated input and trusted gateway scope', async () => {
  let captured
  const beforeFetch = global.fetch
  global.fetch = async (url, init) => {
    captured = { url: String(url), init }
    return new Response(JSON.stringify({ id: exportId, status: 'completed' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const request = new Request('https://icm.fyi/api/tenant-exports', {
      method: 'POST',
      headers: trustedHeaders,
      body: JSON.stringify({ idempotency_key: 'tenant-export-1' })
    })
    const response = await POST(request)
    assert.equal(response.status, 200)
    assert.equal(captured.url, 'http://ingestion-api:8080/v1/tenant-exports')
    assert.deepEqual(JSON.parse(captured.init.body), {
      idempotency_key: 'tenant-export-1'
    })
    assert.equal(captured.init.headers.get('x-icmfyi-user-id'), trustedHeaders['x-icmfyi-user-id'])
    assert.equal(captured.init.headers.get('x-icmfyi-tenant-id'), trustedHeaders['x-icmfyi-tenant-id'])
    assert.equal(captured.init.headers.get('x-icmfyi-internal-secret'), 's'.repeat(32))
    assert.equal(captured.init.signal, request.signal)
  } finally {
    global.fetch = beforeFetch
  }
})

test('tenant export creation rejects identity widening and malformed idempotency keys', async () => {
  const forged = new Request('https://icm.fyi/api/tenant-exports', {
    method: 'POST',
    headers: trustedHeaders,
    body: JSON.stringify({
      idempotency_key: 'tenant-export-1',
      tenant_id: `ten_${'d'.repeat(64)}`
    })
  })
  assert.equal((await POST(forged)).status, 400)

  const control = new Request('https://icm.fyi/api/tenant-exports', {
    method: 'POST',
    headers: trustedHeaders,
    body: JSON.stringify({ idempotency_key: 'bad\nkey' })
  })
  assert.equal((await POST(control)).status, 400)
})

test('tenant export status validates the canonical export id before proxying', async () => {
  let calls = 0
  const beforeFetch = global.fetch
  global.fetch = async (url) => {
    calls += 1
    assert.equal(String(url), `http://ingestion-api:8080/v1/tenant-exports/${exportId}`)
    return new Response(JSON.stringify({ id: exportId, status: 'completed' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  try {
    const request = new Request(`https://icm.fyi/api/tenant-exports/${exportId}`, {
      headers: trustedHeaders
    })
    assert.equal((await getExport(request, { params: { id: 'wrong' } })).status, 404)
    assert.equal((await getExport(request, { params: { id: exportId } })).status, 200)
    assert.equal(calls, 1)
  } finally {
    global.fetch = beforeFetch
  }
})

test('tenant export artifacts stream exact bytes and only safe response headers', async () => {
  const bytes = Buffer.from('SQLite format 3\u0000bounded-test')
  const expectedSha = createHash('sha256').update(bytes).digest('hex')
  let capturedSignal
  const beforeFetch = global.fetch
  global.fetch = async (url, init) => {
    assert.equal(
      String(url),
      `http://ingestion-api:8080/v1/tenant-exports/${exportId}/artifacts/database`
    )
    capturedSignal = init.signal
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.sqlite3',
        'content-length': String(bytes.length),
        'content-disposition': 'attachment; filename="tenant.sqlite3"',
        'x-internal-path': '/data/exports/private'
      }
    })
  }
  try {
    const request = new Request(
      `https://icm.fyi/api/tenant-exports/${exportId}/artifacts/database`,
      { headers: trustedHeaders }
    )
    const response = await getArtifact(request, {
      params: { id: exportId, name: 'database' }
    })
    const received = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, 200)
    assert.equal(createHash('sha256').update(received).digest('hex'), expectedSha)
    assert.equal(response.headers.get('content-type'), 'application/vnd.sqlite3')
    assert.equal(response.headers.get('content-length'), String(bytes.length))
    assert.equal(
      response.headers.get('content-disposition'),
      'attachment; filename="tenant.sqlite3"'
    )
    assert.equal(response.headers.get('x-internal-path'), null)
    assert.equal(capturedSignal, request.signal)
  } finally {
    global.fetch = beforeFetch
  }
})

test('tenant export artifact allowlist and missing backend fail closed', async () => {
  let calls = 0
  const beforeFetch = global.fetch
  global.fetch = async () => {
    calls += 1
    throw new Error('unexpected fetch')
  }
  try {
    const request = new Request(
      `https://icm.fyi/api/tenant-exports/${exportId}/artifacts/secrets`,
      { headers: trustedHeaders }
    )
    const rejected = await getArtifact(request, {
      params: { id: exportId, name: 'secrets' }
    })
    assert.equal(rejected.status, 404)
    assert.equal(calls, 0)

    const previous = process.env.INGESTION_SERVICE_URL
    delete process.env.INGESTION_SERVICE_URL
    try {
      const missing = new Request('https://icm.fyi/api/tenant-exports', {
        method: 'POST',
        headers: trustedHeaders,
        body: JSON.stringify({ idempotency_key: 'tenant-export-2' })
      })
      assert.equal((await POST(missing)).status, 503)
    } finally {
      process.env.INGESTION_SERVICE_URL = previous
    }
  } finally {
    global.fetch = beforeFetch
  }
})
