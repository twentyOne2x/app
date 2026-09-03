process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const { beginChatAccess } = require('../lib/chat-access.ts')

async function withoutRedisInProduction(environment) {
  const before = {
    APP_REDIS_URL: process.env.APP_REDIS_URL,
    ICMFYI_PRODUCTION: process.env.ICMFYI_PRODUCTION,
    NODE_ENV: process.env.NODE_ENV
  }
  try {
    delete process.env.APP_REDIS_URL
    delete process.env.ICMFYI_PRODUCTION
    process.env.NODE_ENV = 'test'
    Object.assign(process.env, environment)
    await assert.rejects(
      beginChatAccess(
        new Request('https://icm.fyi/api/chat', {
          headers: { 'x-forwarded-for': '192.0.2.1' }
        }),
        `usr_${'a'.repeat(64)}`
      ),
      /APP_REDIS_URL is required in production/
    )
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('ICMFYI production cannot use process-local access counters', async () => {
  await withoutRedisInProduction({ ICMFYI_PRODUCTION: '1' })
})

test('NODE_ENV production cannot use process-local access counters', async () => {
  await withoutRedisInProduction({ NODE_ENV: 'production' })
})
