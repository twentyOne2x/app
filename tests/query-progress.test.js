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
  assert.equal(retrieveStage.label, 'Finding likely sources (vector retrieval) (retrieve)')

  const rerankStage = stages.find((stage) => stage.key === 'rerank_cross_encoder')
  assert.ok(rerankStage)
  assert.equal(rerankStage.status, 'completed')
  assert.equal(rerankStage.durationMs, 52)
  assert.equal(rerankStage.label, 'Re-scoring sources (cross-encoder rerank) (rerank_cross_encoder)')

  const reviewStage = stages.find((stage) => stage.key === 'review_docs')
  assert.ok(reviewStage)
  assert.equal(reviewStage.status, 'skipped')
  assert.equal(reviewStage.label, 'Cleaning and enriching notes (post-processing pipeline) (review_docs)')

  const stitchStage = stages.find((stage) => stage.key === 'stitch')
  assert.ok(stitchStage)
  assert.equal(stitchStage.status, 'pending')

  const fallbackStage = stages.find((stage) => stage.key === 'fallback')
  assert.ok(fallbackStage)
  assert.equal(fallbackStage.status, 'error')
  assert.equal(fallbackStage.label, 'Fallback strategy (fallback)')
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
