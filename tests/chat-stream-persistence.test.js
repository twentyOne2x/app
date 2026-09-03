process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })
process.env.ICMFYI_PRODUCTION = '1'
process.env.INTERNAL_SERVICE_SECRET = 's'.repeat(32)
process.env.RAG_SERVICE_URL = 'http://rag:8080'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const scope = {
  userId: `usr_${'a'.repeat(64)}`,
  tenantId: `ten_${'b'.repeat(64)}`
}
const puts = []
let putImplementation = async (_scope, chat) => chat

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/auth') {
    return { auth: async () => ({ user: { id: scope.userId } }) }
  }
  if (request === '@/lib/chat-access') {
    return {
      beginChatAccess: async () => ({ ok: true, context: {}, state: {} }),
      applyChatAccessResponse: response => response,
      finalizeChatAccess: async () => ({})
    }
  }
  if (request === '@/lib/chat-store') {
    return {
      chatStore: () => ({
        put: async (putScope, chat) => {
          puts.push({ scope: putScope, chat })
          return putImplementation(putScope, chat)
        }
      })
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const streamRoute = require('../app/api/chat/stream/route.ts')
Module._load = originalLoad

function request(id = 'stream-persistence-chat') {
  return new Request('https://icm.fyi/api/chat/stream', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-icmfyi-user-id': scope.userId,
      'x-icmfyi-tenant-id': scope.tenantId
    },
    body: JSON.stringify({
      id,
      entryProfileCode: 'crypto',
      messages: [
        {
          id: 'user-message',
          role: 'user',
          content: 'hello',
          ignored_client_field: 'must not persist'
        }
      ]
    })
  })
}

function upstream(chunks) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      }
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' }
    }
  )
}

async function responseFor(chunks) {
  const previousFetch = global.fetch
  global.fetch = async () => upstream(chunks)
  try {
    return await streamRoute.POST(request())
  } finally {
    global.fetch = previousFetch
  }
}

test('stream result remains private until its canonical chat commit resolves', async () => {
  puts.length = 0
  let resolvePut
  let markPutStarted
  const putStarted = new Promise(resolve => {
    markPutStarted = resolve
  })
  const putFinished = new Promise(resolve => {
    resolvePut = resolve
  })
  putImplementation = async (_putScope, chat) => {
    markPutStarted()
    await putFinished
    return chat
  }

  const response = await responseFor([
    'data: {"type":"progress","event":{"name":"retrieve","status":"completed"}}\n',
    '\ndata: {"type":"result","response":"Internet Capital Markets answer",',
    '"structured_metadata":[{"parentTitle":"Explicit source","channel":"Megga",',
    '"clips":[{"parentTitle":"Explicit source","channel":"Megga","startS":1,"endS":2}]}],',
    '"diagnostics":{"final_kept":[{"segment_id":"fallback","title":"Fallback source","channel_name":"Other"}]}}\n\n'
  ])
  assert.equal(response.status, 200)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  const progress = await reader.read()
  assert.equal(progress.done, false)
  assert.match(decoder.decode(progress.value), /"type":"progress"/)

  let resultSettled = false
  const resultRead = reader.read().then(value => {
    resultSettled = true
    return value
  })
  await putStarted
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resultSettled, false)
  assert.equal(puts.length, 1)
  assert.deepEqual(puts[0].scope, scope)
  assert.deepEqual(puts[0].chat.messages[0], {
    id: 'user-message',
    role: 'user',
    content: 'hello'
  })
  assert.equal(puts[0].chat.messages.at(-1).content, 'ICM answer')
  assert.equal(puts[0].chat.entryProfileCode, 'crypto')
  assert.equal(puts[0].chat.structured_metadata[0].parentTitle, 'Explicit source')

  resolvePut()
  const result = await resultRead
  assert.equal(result.done, false)
  const terminalText = decoder.decode(result.value)
  assert.match(terminalText, /"type":"result"/)
  assert.match(terminalText, /"response":"ICM answer"/)
  const terminalEvent = JSON.parse(
    terminalText.trim().slice('data: '.length)
  )
  assert.equal(
    terminalEvent.structured_metadata[0].parentTitle,
    'Explicit source'
  )
  assert.doesNotMatch(terminalText, /Internet Capital Markets answer/)
  assert.equal((await reader.read()).done, true)
})

test('unsafe caller message shapes are rejected before retrieval or persistence', async () => {
  puts.length = 0
  let fetchCount = 0
  const previousFetch = global.fetch
  global.fetch = async () => {
    fetchCount += 1
    return upstream([])
  }
  try {
    const response = await streamRoute.POST(
      new Request('https://icm.fyi/api/chat/stream', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-icmfyi-user-id': scope.userId,
          'x-icmfyi-tenant-id': scope.tenantId
        },
        body: JSON.stringify({
          id: 'unsafe-chat',
          messages: [{ role: 'user', content: { nested: 'not text' } }]
        })
      })
    )
    assert.equal(response.status, 400)
    assert.equal(fetchCount, 0)
    assert.equal(puts.length, 0)
  } finally {
    global.fetch = previousFetch
  }
})

test('persistence failure emits a terminal error and never exposes the result', async () => {
  puts.length = 0
  putImplementation = async () => {
    throw new Error('database unavailable')
  }

  const response = await responseFor([
    'data: {"type":"result","response":"secret answer","diagnostics":null}\n\n'
  ])
  const body = await response.text()
  assert.equal(puts.length, 1)
  assert.match(body, /"code":"chat_persistence_failed"/)
  assert.doesNotMatch(body, /"type":"result"/)
  assert.doesNotMatch(body, /secret answer/)
})

test('malformed, duplicate, and missing terminal events fail closed without persistence', async t => {
  const cases = [
    {
      name: 'malformed JSON',
      chunks: ['data: not-json\n\n'],
      code: 'stream_malformed_event'
    },
    {
      name: 'duplicate result',
      chunks: [
        'data: {"type":"result","response":"first"}\n\n' +
          'data: {"type":"result","response":"second"}\n\n'
      ],
      code: 'stream_duplicate_terminal'
    },
    {
      name: 'progress-only EOF',
      chunks: ['data: {"type":"progress","event":{"name":"retrieve"}}\n\n'],
      code: 'stream_no_terminal_result'
    }
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      puts.length = 0
      putImplementation = async (_putScope, chat) => chat
      const response = await responseFor(fixture.chunks)
      const body = await response.text()
      assert.equal(puts.length, 0)
      assert.match(body, new RegExp(`"code":"${fixture.code}"`))
      assert.doesNotMatch(body, /"type":"result"/)
    })
  }
})

test('the client only falls back for pre-stream compatibility statuses', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'chat.tsx'),
    'utf8'
  )
  assert.match(
    source,
    /LEGACY_CHAT_FALLBACK_STATUSES\s*=\s*new Set\(\[404, 405, 501\]\)/
  )
  assert.match(
    source,
    /else if \(shouldFallbackToLegacyChat\(streamError\)\)/
  )
  assert.match(
    source,
    /throw new ChatRequestError\(errorMessage, 502, errorCode\)/
  )
})
