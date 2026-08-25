process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.RAG_SERVICE_URL = 'http://rag:8080'
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const sessionUserId = 'session-user-b'
const accessPrincipals = []
const originalLoad = Module._load

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/auth') {
    return { auth: async () => ({ user: { id: sessionUserId } }) }
  }
  if (request === '@/lib/chat-access') {
    return {
      beginChatAccess: async (_request, userId) => {
        accessPrincipals.push(userId)
        return { ok: true, context: {}, state: {} }
      },
      applyChatAccessResponse: (response) => response,
      finalizeChatAccess: async () => ({})
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const oauthUserId = `usr_${'a'.repeat(64)}`
const oauthTenantId = `ten_${'b'.repeat(64)}`
const sessionGatewayUserId = `usr_${'c'.repeat(64)}`
const sessionGatewayTenantId = `ten_${'d'.repeat(64)}`

function request(path, { authorization = true, sessionGateway = false } = {}) {
  const headers = {
    'content-type': 'application/json',
    'x-icmfyi-user-id': sessionGateway ? sessionGatewayUserId : oauthUserId,
    'x-icmfyi-tenant-id': sessionGateway ? sessionGatewayTenantId : oauthTenantId
  }
  if (authorization) headers.authorization = 'Bearer valid-token-a'
  return new Request(`https://icm.fyi${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'mixed-principal-test-chat',
      messages: [{ role: 'user', content: 'hello' }]
    })
  })
}

test('mixed Bearer and session use the gateway principal in both chat routes', async () => {
  const captured = []
  const beforeFetch = global.fetch
  global.fetch = async (url, init) => {
    captured.push({ url: String(url), init })
    if (String(url).endsWith('/chat/stream')) {
      return new Response('data: {"ok":true}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }
    return Response.json({ response: 'ok' })
  }
  try {
    const streamRoute = require('../app/api/chat/stream/route.ts')
    const chatRoute = require('../app/api/chat/route.ts')

    const streamResponse = await streamRoute.POST(request('/api/chat/stream'))
    assert.equal(streamResponse.status, 200)
    await streamResponse.text()

    const chatResponse = await chatRoute.POST(request('/api/chat'))
    assert.equal(chatResponse.status, 200)
    assert.equal((await chatResponse.json()).userId, oauthUserId)

    assert.deepEqual(accessPrincipals.slice(-2), [oauthUserId, oauthUserId])
    for (const call of captured) {
      assert.equal(call.init.headers.get('x-icmfyi-user-id'), oauthUserId)
      assert.equal(call.init.headers.get('x-icmfyi-tenant-id'), oauthTenantId)
      const payload = JSON.parse(call.init.body)
      assert.equal(payload.user_id, oauthUserId)
      assert.equal(payload.tenant_id, oauthTenantId)
    }
  } finally {
    global.fetch = beforeFetch
  }
})

test('cookie-only browser chat retains raw session ownership in both routes', async () => {
  const beforeFetch = global.fetch
  global.fetch = async (url) => {
    if (String(url).endsWith('/chat/stream')) {
      return new Response('data: {"ok":true}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }
    return Response.json({ response: 'ok' })
  }
  try {
    const streamRoute = require('../app/api/chat/stream/route.ts')
    const chatRoute = require('../app/api/chat/route.ts')

    const streamResponse = await streamRoute.POST(
      request('/api/chat/stream', { authorization: false, sessionGateway: true })
    )
    assert.equal(streamResponse.status, 200)
    await streamResponse.text()

    const chatResponse = await chatRoute.POST(
      request('/api/chat', { authorization: false, sessionGateway: true })
    )
    assert.equal(chatResponse.status, 200)
    assert.equal((await chatResponse.json()).userId, sessionUserId)
    assert.deepEqual(accessPrincipals.slice(-2), [sessionUserId, sessionUserId])
  } finally {
    global.fetch = beforeFetch
  }
})

test('production Bearer route fails closed if the trusted gateway principal is absent', async () => {
  const streamRoute = require('../app/api/chat/stream/route.ts')
  const invalid = new Request('https://icm.fyi/api/chat/stream', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token-a',
      'content-type': 'application/json',
      'x-icmfyi-tenant-id': oauthTenantId
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
  })
  const response = await streamRoute.POST(invalid)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'invalid_gateway_identity' })
})
