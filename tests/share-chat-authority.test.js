process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const scope = {
  userId: `usr_${'a'.repeat(64)}`,
  tenantId: `ten_${'b'.repeat(64)}`
}
const original = {
  id: 'chat-authoritative',
  title: 'Authoritative title',
  userId: scope.userId,
  createdAt: 1788422400000,
  path: '/chat/chat-authoritative',
  messages: [{ role: 'assistant', content: 'authoritative answer' }],
  structured_metadata: []
}
const writes = []
const originalLoad = Module._load

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/auth') {
    const auth = async () => ({
      user: { id: 'external-provider-subject' },
      provider: 'google'
    })
    return {
      __esModule: true,
      default: auth,
      auth,
      E2E_AUTH_COOKIE: 'unused',
      IS_E2E_MODE: false
    }
  }
  if (request === '@/lib/chat-scope') {
    return { sessionChatScope: async () => scope }
  }
  if (request === '@/lib/chat-store') {
    return {
      chatStore: () => ({
        get: async (candidateScope, id) => {
          assert.deepEqual(candidateScope, scope)
          assert.equal(id, original.id)
          return original
        },
        putShared: async (candidateScope, chat) => {
          writes.push({ scope: candidateScope, chat })
          return chat
        }
      })
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { shareChat } = require('../app/actions.ts')
Module._load = originalLoad

test('shareChat copies the authoritative stored chat and ignores caller tampering', async () => {
  const shared = await shareChat({
    ...original,
    title: 'Attacker-controlled title',
    messages: [{ role: 'assistant', content: 'attacker-controlled answer' }]
  })

  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].scope, scope)
  assert.equal(writes[0].chat.title, original.title)
  assert.deepEqual(writes[0].chat.messages, original.messages)
  assert.equal(writes[0].chat.originalChatId, original.id)
  assert.equal(writes[0].chat.readOnly, true)
  assert.match(writes[0].chat.id, /^shr_[A-Za-z0-9_-]{32}$/)
  assert.equal(writes[0].chat.sharePath, `/share/${writes[0].chat.id}`)
  assert.deepEqual(shared, writes[0].chat)
})
