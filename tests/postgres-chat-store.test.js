process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { PostgresChatStore } = require('../lib/chat-store.ts')

const scope = {
  userId: `usr_${'a'.repeat(64)}`,
  tenantId: `ten_${'b'.repeat(64)}`
}

const chat = {
  id: 'chat-a',
  title: 'Durable chat',
  userId: scope.userId,
  createdAt: 1788422400000,
  path: '/chat/chat-a',
  messages: [{ role: 'user', content: 'hello' }],
  structured_metadata: []
}

function poolWith(responder) {
  const calls = []
  let released = 0
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values })
      return responder(sql, values, calls.length)
    },
    release() {
      released += 1
    }
  }
  return {
    pool: { connect: async () => client },
    calls,
    released: () => released
  }
}

const empty = () => ({ rows: [], rowCount: null })

test('PostgresChatStore writes under transaction-local canonical scope', async () => {
  const fixture = poolWith((sql) => {
    if (sql.startsWith('INSERT INTO app_chats')) {
      return { rows: [{ payload_json: chat }], rowCount: 1 }
    }
    return empty()
  })
  const store = new PostgresChatStore(fixture.pool)
  assert.deepEqual(await store.put(scope, chat), chat)
  assert.equal(fixture.calls[0].sql, 'BEGIN')
  assert.match(fixture.calls[1].sql, /set_config\('app\.tenant_id'/)
  assert.deepEqual(fixture.calls[1].values, [scope.tenantId, scope.userId])
  assert.match(fixture.calls[2].sql, /ON CONFLICT \(id\) DO UPDATE/)
  assert.deepEqual(fixture.calls[2].values.slice(0, 4), [
    chat.id,
    scope.tenantId,
    scope.userId,
    chat.createdAt
  ])
  assert.equal(fixture.calls.at(-1).sql, 'COMMIT')
  assert.equal(fixture.released(), 1)
})

test('PostgresChatStore refuses ownership mismatch before acquiring a connection', async () => {
  let connected = 0
  const store = new PostgresChatStore({
    connect: async () => {
      connected += 1
      throw new Error('should not connect')
    }
  })
  await assert.rejects(
    store.put(scope, { ...chat, userId: `usr_${'c'.repeat(64)}` }),
    /owner does not match/
  )
  assert.equal(connected, 0)
})

test('PostgresChatStore public share read sets only the exact share id', async () => {
  const shared = {
    ...chat,
    id: 'shared-a',
    originalChatId: chat.id,
    readOnly: true,
    sharePath: '/share/shared-a'
  }
  const fixture = poolWith((sql) => {
    if (sql.startsWith('SELECT payload_json')) {
      return { rows: [{ payload_json: shared }], rowCount: 1 }
    }
    return empty()
  })
  const store = new PostgresChatStore(fixture.pool)
  assert.deepEqual(await store.getShared(shared.id), shared)
  assert.equal(fixture.calls[0].sql, 'BEGIN')
  assert.match(fixture.calls[1].sql, /set_config\('app\.share_id'/)
  assert.deepEqual(fixture.calls[1].values, [shared.id])
  assert.doesNotMatch(fixture.calls[1].sql, /tenant_id|principal_user_id/)
  assert.deepEqual(fixture.calls[2].values, [shared.id, shared.sharePath])
  assert.equal(fixture.calls.at(-1).sql, 'COMMIT')
})

test('PostgresChatStore rolls back and releases on database failure', async () => {
  const fixture = poolWith((sql) => {
    if (sql.startsWith('SELECT payload_json')) throw new Error('database unavailable')
    return empty()
  })
  const store = new PostgresChatStore(fixture.pool)
  await assert.rejects(store.get(scope, chat.id), /database unavailable/)
  assert.equal(fixture.calls.at(-1).sql, 'ROLLBACK')
  assert.equal(fixture.released(), 1)
})
