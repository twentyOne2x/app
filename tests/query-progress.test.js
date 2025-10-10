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
    { stage: 'rerank', status: 'completed', total_ms: 52 },
    { stage: 'review_docs', status: 'skipped', meta: { skipped: true } },
    { stage: 'synthesize', status: 'error', meta: { error: true } }
  ]

  const stages = normalizeProgress(progress)
  assert.equal(stages.length, 4)
  assert.equal(stages[0].key, 'retrieve')
  assert.equal(stages[0].label, 'Fetching documents')
  assert.equal(stages[0].status, 'running')
  assert.equal(stages[0].durationMs, 120.4)

  assert.equal(stages[1].status, 'completed')
  assert.equal(stages[1].durationMs, 52)

  assert.equal(stages[2].status, 'skipped')
  assert.equal(stages[2].label, 'Reviewing docs')

  assert.equal(stages[3].status, 'error')
  assert.equal(stages[3].label, 'Composing answer')
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
  assert.equal(mapStatus('unknown'), 'completed')
  assert.equal(mapStatus(undefined, { skipped: true }), 'skipped')
  assert.equal(mapStatus(undefined, { error: true }), 'error')
  assert.equal(humanizeStage('custom_step'), 'Custom Step')
})
