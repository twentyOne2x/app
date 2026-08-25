process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' })

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  newYoutubeIngestionIntent,
  resumeYoutubeIngestionIntent,
  runYoutubeIngestionWorkflow,
  runYoutubeIngestionOnce,
  newTenantExportIntent,
  resumeTenantExportIntent,
  runTenantExportWorkflow,
  runTenantExportOnce,
  tenantExportArtifactUrl
} = require('../lib/durable-product-workflows.ts')

const jobA = `job_${'a'.repeat(40)}`
const jobB = `job_${'b'.repeat(40)}`
const requestA = `req_${'c'.repeat(40)}`
const requestB = `req_${'d'.repeat(40)}`
const exportId = `tex_${'e'.repeat(40)}`
const immediateSleep = async () => {}

function accepted(jobs) {
  return {
    ok: true,
    status: 202,
    body: { ok: true, pending: jobs, failed: [] }
  }
}

test('youtube 202 persists exact jobs, waits for all, then resubmits once and completes', async () => {
  const events = []
  let submits = 0
  const polls = new Map([[jobA, 0], [jobB, 0]])
  const persisted = []
  const state = newYoutubeIngestionIntent('yti_202', 'Index videos', {
    video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    clip_ready: true
  })
  const result = await runYoutubeIngestionWorkflow(
    state,
    {
      submit: async payload => {
        submits += 1
        events.push(`submit:${submits}`)
        assert.deepEqual(payload, state.payload)
        if (submits === 1) {
          return accepted([
            { job_id: jobA, request_id: requestA, status: 'queued' },
            { job_id: jobB, request_id: requestB, status: 'queued' }
          ])
        }
        assert.ok(events.includes(`ready:${jobA}`))
        assert.ok(events.includes(`ready:${jobB}`))
        return { ok: true, status: 200, body: { ok: true, indexed: [{ id: 'video' }], failed: [] } }
      },
      getJob: async jobId => {
        const round = polls.get(jobId) ?? 0
        polls.set(jobId, round + 1)
        const ready = round >= (jobId === jobA ? 1 : 2)
        if (ready) events.push(`ready:${jobId}`)
        return {
          ok: true,
          status: 200,
          body: {
            job_id: jobId,
            request_id: jobId === jobA ? requestA : requestB,
            status: ready ? 'succeeded' : 'running',
            ready
          }
        }
      }
    },
    { sleep: immediateSleep, persist: next => persisted.push(next) }
  )

  assert.equal(result.phase, 'completed')
  assert.equal(result.submitCount, 2)
  assert.equal(submits, 2)
  const firstPolling = persisted.find(entry => entry.phase === 'polling')
  assert.deepEqual(
    firstPolling.jobs.map(job => [job.jobId, job.requestId]),
    [[jobA, requestA], [jobB, requestB]]
  )
})

test('youtube terminal acquisition failure stops without resubmission', async () => {
  let submits = 0
  const result = await runYoutubeIngestionWorkflow(
    newYoutubeIngestionIntent('yti_failed', 'Index video', { video_urls: ['x'] }),
    {
      submit: async () => {
        submits += 1
        return accepted([{ job_id: jobA, request_id: requestA, status: 'queued' }])
      },
      getJob: async () => ({
        ok: true,
        status: 200,
        body: {
          job_id: jobA,
          request_id: requestA,
          status: 'failed',
          ready: false,
          error_code: 'provider_failed'
        }
      })
    },
    { sleep: immediateSleep }
  )
  assert.equal(result.phase, 'failed')
  assert.equal(result.retryable, false)
  assert.match(result.errorMessage, /provider_failed/)
  assert.equal(submits, 1)
})

test('youtube reload resumes polling and transport retry preserves ids and payload', async () => {
  const original = newYoutubeIngestionIntent('yti_resume', 'Index video', { channel: '@creator' })
  const persisted = {
    ...original,
    phase: 'polling',
    jobs: [{ jobId: jobA, requestId: requestA, status: 'running', ready: false }],
    submitCount: 1
  }
  const failed = await runYoutubeIngestionWorkflow(
    persisted,
    {
      submit: async () => { throw new Error('must not submit before ready') },
      getJob: async () => { throw new Error('temporary network failure') }
    },
    { sleep: immediateSleep, maxTransportRetries: 0 }
  )
  assert.equal(failed.phase, 'failed')
  assert.equal(failed.retryable, true)
  assert.equal(failed.retryFrom, 'polling')

  let submits = 0
  const resumed = await runYoutubeIngestionWorkflow(
    resumeYoutubeIngestionIntent(failed),
    {
      getJob: async () => ({
        ok: true,
        status: 200,
        body: { job_id: jobA, request_id: requestA, status: 'succeeded', ready: true }
      }),
      submit: async payload => {
        submits += 1
        assert.deepEqual(payload, original.payload)
        return { ok: true, status: 200, body: { ok: true, indexed: [{}], failed: [] } }
      }
    },
    { sleep: immediateSleep }
  )
  assert.equal(resumed.phase, 'completed')
  assert.equal(submits, 1)
})

test('duplicate youtube click converges on one active submit', async () => {
  const state = newYoutubeIngestionIntent('yti_duplicate', 'Index video', { video_urls: ['x'] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  let submits = 0
  const transport = {
    submit: async () => {
      submits += 1
      await gate
      return { ok: true, status: 200, body: { ok: true, indexed: [{}], failed: [] } }
    },
    getJob: async () => { throw new Error('unexpected poll') }
  }
  const first = runYoutubeIngestionOnce(state, transport, { sleep: immediateSleep })
  const second = runYoutubeIngestionOnce(state, transport, { sleep: immediateSleep })
  assert.equal(first, second)
  release()
  assert.equal((await first).phase, 'completed')
  assert.equal(submits, 1)
})

test('tenant export resumes its exact export id after reload and transport failure', async () => {
  const initial = newTenantExportIntent('texi_resume', 'tenant-export-stable-key')
  let creates = 0
  const first = await runTenantExportWorkflow(
    initial,
    {
      create: async key => {
        creates += 1
        assert.equal(key, 'tenant-export-stable-key')
        return { ok: true, status: 202, body: { id: exportId, status: 'building' } }
      },
      get: async id => {
        assert.equal(id, exportId)
        throw new Error('temporary poll outage')
      }
    },
    { sleep: immediateSleep, maxTransportRetries: 0 }
  )
  assert.equal(first.phase, 'failed')
  assert.equal(first.retryFrom, 'polling')

  let polled = 0
  const completed = await runTenantExportWorkflow(
    resumeTenantExportIntent(first),
    {
      create: async () => { throw new Error('reload must not recreate export') },
      get: async id => {
        polled += 1
        assert.equal(id, exportId)
        return {
          ok: true,
          status: 200,
          body: {
            id: exportId,
            status: 'completed',
            database_sha256: '1'.repeat(64),
            manifest_sha256: '2'.repeat(64)
          }
        }
      }
    },
    { sleep: immediateSleep }
  )
  assert.equal(completed.phase, 'completed')
  assert.equal(completed.exportId, exportId)
  assert.equal(creates, 1)
  assert.equal(polled, 1)
  assert.equal(
    tenantExportArtifactUrl(exportId, 'database'),
    `/api/tenant-exports/${exportId}/artifacts/database`
  )
})

test('duplicate tenant export click converges on one create with the same key', async () => {
  const state = newTenantExportIntent('texi_duplicate', 'tenant-export-duplicate-key')
  let release
  const gate = new Promise(resolve => { release = resolve })
  let creates = 0
  const transport = {
    create: async key => {
      creates += 1
      assert.equal(key, 'tenant-export-duplicate-key')
      await gate
      return { ok: true, status: 200, body: { id: exportId, status: 'completed' } }
    },
    get: async () => { throw new Error('unexpected poll') }
  }
  const first = runTenantExportOnce(state, transport, { sleep: immediateSleep })
  const second = runTenantExportOnce(state, transport, { sleep: immediateSleep })
  assert.equal(first, second)
  release()
  assert.equal((await first).phase, 'completed')
  assert.equal(creates, 1)
})

test('terminal tenant export failure is retryable by reposting the same intent key', async () => {
  const state = {
    ...newTenantExportIntent('texi_terminal', 'tenant-export-terminal-key'),
    exportId,
    phase: 'polling'
  }
  const failed = await runTenantExportWorkflow(
    state,
    {
      create: async () => { throw new Error('unexpected create') },
      get: async () => ({
        ok: true,
        status: 200,
        body: { id: exportId, status: 'failed', error_detail: 'snapshot failed' }
      })
    },
    { sleep: immediateSleep }
  )
  assert.equal(failed.phase, 'failed')
  assert.equal(failed.retryFrom, 'creating')
  assert.match(failed.errorMessage, /snapshot failed/)

  let keySeen
  const completed = await runTenantExportWorkflow(
    resumeTenantExportIntent(failed),
    {
      create: async key => {
        keySeen = key
        return { ok: true, status: 200, body: { id: exportId, status: 'completed' } }
      },
      get: async () => { throw new Error('unexpected poll') }
    },
    { sleep: immediateSleep }
  )
  assert.equal(completed.phase, 'completed')
  assert.equal(keySeen, 'tenant-export-terminal-key')
})
