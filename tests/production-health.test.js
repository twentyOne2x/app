process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/chat-access') {
    return { chatAccessStoreHealth: async () => undefined }
  }
  if (request === '@/lib/chat-store') {
    return { chatStoreHealth: async () => undefined }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { GET } = require('../app/api/healthz/route.ts')
Module._load = originalLoad

const required = {
  ICMFYI_PRODUCTION: '1',
  NEXTAUTH_SECRET: 'n'.repeat(32),
  INTERNAL_SERVICE_SECRET: 's'.repeat(32),
  ICMFYI_IDENTITY_HMAC_SECRET: 'i'.repeat(32),
  ICMFYI_MCP_AUDIENCE: 'https://mcp.icm.fyi',
  ICMFYI_MCP_OAUTH_ISSUER: 'https://auth.icm.fyi',
  ICMFYI_MCP_OAUTH_JWKS_URL: 'https://auth.icm.fyi/.well-known/jwks.json',
  APP_DATABASE_URL: 'postgresql://icmfyi_app:secret@postgres:5432/icmfyi',
  APP_REDIS_URL: 'redis://:secret@redis:6379/1',
  RAG_SERVICE_URL: 'http://rag:8000',
  INGESTION_SERVICE_URL: 'http://ingestion-api:8080',
  CLIP_SERVICE_URL: 'http://clip-api:8090'
}

test('production health requires the dedicated identity HMAC key', async () => {
  const before = Object.fromEntries(
    Object.keys(required).map(name => [name, process.env[name]])
  )
  try {
    Object.assign(process.env, required)
    assert.equal((await GET()).status, 200)

    process.env.ICMFYI_IDENTITY_HMAC_SECRET = 'weak'
    assert.equal((await GET()).status, 503)

    delete process.env.ICMFYI_IDENTITY_HMAC_SECRET
    assert.equal((await GET()).status, 503)
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('production health requires PostgreSQL chats and non-authoritative Redis counters', async () => {
  const before = Object.fromEntries(
    Object.keys(required).map(name => [name, process.env[name]])
  )
  try {
    Object.assign(process.env, required)
    for (const name of ['APP_DATABASE_URL', 'APP_REDIS_URL']) {
      const value = process.env[name]
      delete process.env[name]
      assert.equal((await GET()).status, 503)
      process.env[name] = value
    }
    assert.equal((await GET()).status, 200)
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('NODE_ENV production cannot bypass persistence configuration checks', async () => {
  const before = Object.fromEntries(
    [...Object.keys(required), 'NODE_ENV'].map(name => [name, process.env[name]])
  )
  try {
    for (const name of Object.keys(required)) delete process.env[name]
    process.env.NODE_ENV = 'production'
    assert.equal((await GET()).status, 503)
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
