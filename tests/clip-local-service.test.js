process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs'
})

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  enqueueLocalClipJob,
  getLocalClipJob,
  __resetLocalJobsForTests
} = require('../app/api/clips/local-service.ts')

const payload = {
  sourceUrl: 'https://example.com/video.mp4',
  parentTitle: 'Demo video',
  clipLabel: 'Segment',
  channel: 'Demo channel',
  start: 10,
  end: 20,
  contextMode: 'seconds',
  padBefore: 5,
  padAfter: 5
}

test.beforeEach(() => {
  __resetLocalJobsForTests()
})

test('enqueueLocalClipJob deduplicates identical payloads', () => {
  const first = enqueueLocalClipJob(payload)
  const second = enqueueLocalClipJob(payload)

  assert.equal(second.id, first.id)
  assert.equal(second.status, 'queued')

  const job = getLocalClipJob(first.id)
  assert.ok(job)
  assert.equal(job.status, 'queued')
})

test('local job transitions to ready with stream and download urls', async () => {
  const { id } = enqueueLocalClipJob(payload)

  await new Promise((resolve) => setTimeout(resolve, 3600))

  const job = getLocalClipJob(id)
  assert.ok(job)
  assert.equal(job.status, 'ready')
  assert.match(job.streamUrl, /^https?:\/\//)
  assert.match(job.downloadUrl, /^https?:\/\//)
})
