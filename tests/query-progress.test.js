const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_PIPELINE,
  normalizeProgress,
  applyLoadingState,
  formatDuration,
  mapStatus,
  humanizeStage
} = require('../lib/progress-display.js')

test('normalizeProgress maps backend entries into display stages', () => {
  const progress = [
    { stage: 'retrieve', status: 'running', duration_ms: 120.4 },
    { stage: 'rerank_cross_encoder', status: 'completed', total_ms: 52 },
    { stage: 'review_docs', status: 'skipped', meta: { skipped: true } },
    { stage: 'fallback', status: 'error', meta: { error: true } }
  ]

  const stages = normalizeProgress(progress)
  assert.equal(stages.length, DEFAULT_PIPELINE.length + 1)

  const retrieveStage = stages.find((stage) => stage.key === 'retrieve')
  assert.ok(retrieveStage)
  assert.equal(retrieveStage.status, 'running')
  assert.equal(retrieveStage.durationMs, 120.4)
  assert.equal(retrieveStage.label, 'Finding likely sources (vector retrieval)')
  assert.equal(retrieveStage.meta?.stage_key, 'retrieve')

  const rerankStage = stages.find((stage) => stage.key === 'rerank_cross_encoder')
  assert.ok(rerankStage)
  assert.equal(rerankStage.status, 'completed')
  assert.equal(rerankStage.durationMs, 52)
  assert.equal(rerankStage.label, 'Re-scoring sources (cross-encoder rerank)')
  assert.equal(rerankStage.meta?.stage_key, 'rerank_cross_encoder')

  const reviewStage = stages.find((stage) => stage.key === 'review_docs')
  assert.ok(reviewStage)
  assert.equal(reviewStage.status, 'skipped')
  assert.equal(reviewStage.label, 'Cleaning and enriching notes (post-processing pipeline)')
  assert.equal(reviewStage.meta?.stage_key, 'review_docs')

  const stitchStage = stages.find((stage) => stage.key === 'stitch')
  assert.ok(stitchStage)
  assert.equal(stitchStage.status, 'pending')

  const fallbackStage = stages.find((stage) => stage.key === 'fallback')
  assert.ok(fallbackStage)
  assert.equal(fallbackStage.status, 'error')
  assert.equal(fallbackStage.label, 'Fallback strategy')
  assert.equal(fallbackStage.meta?.stage_key, 'fallback')
})

test('normalizeProgress handles new progress event wrapper format', () => {
  const progress = [
    {
      type: 'progress',
      event: {
        name: 'retrieve',
        label: 'Retrieve candidates',
        status: 'in_progress',
        started_at: '2024-05-05T12:00:00Z',
        metadata: {
          initial_candidates: 50,
          percent: 40
        }
      }
    },
    {
      type: 'progress',
      event: {
        name: 'retrieve',
        status: 'completed',
        ended_at: '2024-05-05T12:00:01Z',
        duration_ms: 1024,
        metadata: {
          score_min: 0.21,
          score_max: 0.91
        }
      }
    }
  ]

  const stages = normalizeProgress(progress)
  const retrieve = stages.find((stage) => stage.key === 'retrieve')
  assert.ok(retrieve)
  assert.equal(retrieve.status, 'completed')
  assert.equal(retrieve.durationMs, 1024)
  assert.equal(retrieve.label, 'Retrieve candidates')
  assert.equal(retrieve.meta?.initial_candidates, 50)
  assert.equal(retrieve.meta?.percent, 40)
  assert.equal(retrieve.meta?.event_type, 'progress')
  assert.equal(retrieve.meta?.event_timestamp, undefined)
})

test('normalizeProgress handles empty or missing progress', () => {
  assert.deepEqual(normalizeProgress(undefined), [])
  assert.deepEqual(normalizeProgress([]), [])
})

test('applyLoadingState marks past, current, and pending stages', () => {
  const updated = applyLoadingState(DEFAULT_PIPELINE, 2)
  assert.equal(updated[0].status, 'completed')
  assert.equal(updated[1].status, 'completed')
  assert.equal(updated[2].status, 'running')
  assert.equal(updated[3].status, 'pending')
})

test('formatDuration renders human-friendly labels', () => {
  assert.equal(formatDuration(80), '80 ms')
  assert.equal(formatDuration(2500), '2.5 s')
  assert.equal(formatDuration(15000), '15 s')
  assert.equal(formatDuration(-1), null)
  assert.equal(formatDuration(null), null)
})

test('mapStatus and humanizeStage provide sensible fallbacks', () => {
  assert.equal(mapStatus('COMPLETED'), 'completed')
  assert.equal(mapStatus('queued'), 'running')
  assert.equal(mapStatus('not_implemented'), 'skipped')
  assert.equal(mapStatus('unknown'), 'completed')
  assert.equal(mapStatus(undefined, { skipped: true }), 'skipped')
  assert.equal(mapStatus(undefined, { error: true }), 'error')
  assert.equal(humanizeStage('custom_step'), 'Custom Step')
})
