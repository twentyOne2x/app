/**
 * Shared helpers for rendering query progress timelines.
 * Kept in plain JS so we can exercise them with Node's built-in test runner.
 */

const STATUS_LABELS = {
  startup: 'Bootstrapping engine',
  route: 'Routing query',
  retrieve: 'Finding likely sources (vector retrieval)',
  rerank: 'Re-scoring sources (cross-encoder rerank)',
  rerank_cross_encoder: 'Re-scoring sources (cross-encoder rerank)',
  review_docs: 'Cleaning and enriching notes (post-processing pipeline)',
  review: 'Cleaning and enriching notes (post-processing pipeline)',
  stitch: 'Merging adjacent clips (temporal stitching)',
  synthesize: 'Writing final answer (LLM synthesis)',
  synth: 'Writing final answer (LLM synthesis)',
  validate: 'Final validation step (post-answer checks)',
  validate_answer: 'Final validation step (post-answer checks)',
  finalize: 'Finalising sources',
  final_kept: 'Selecting final sources',
  fallback: 'Fallback strategy',
  cache: 'Checking cache'
}

const STATUS_MAP = {
  pending: 'pending',
  running: 'running',
  queued: 'running',
  in_progress: 'running',
  started: 'running',
  completed: 'completed',
  complete: 'completed',
  finished: 'completed',
  done: 'completed',
  skipped: 'skipped',
  not_implemented: 'skipped',
  aborted: 'error',
  error: 'error',
  errored: 'error',
  failed: 'error'
}

function humanizeStage(key) {
  if (!key) return 'Step'
  if (STATUS_LABELS[key]) return STATUS_LABELS[key]
  return key
    .toString()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function resolveStageLabel(key, providedLabel) {
  const normalizedKey = typeof key === 'string' ? key.trim() : String(key ?? '').trim()
  const fallback = STATUS_LABELS[normalizedKey] || humanizeStage(normalizedKey || 'step')
  const base =
    (typeof providedLabel === 'string' && providedLabel.trim()) ||
    fallback
  const alreadyHasKey =
    normalizedKey &&
    base.toLowerCase().includes(`(${normalizedKey.toLowerCase()})`)
  return alreadyHasKey || !normalizedKey ? base : `${base} (${normalizedKey})`
}

const DEFAULT_STAGE_KEYS = [
  'retrieve',
  'rerank_cross_encoder',
  'review_docs',
  'stitch',
  'synthesize',
  'validate_answer'
]

const DEFAULT_PIPELINE = DEFAULT_STAGE_KEYS.map((key) => ({
  key,
  label: resolveStageLabel(key),
  status: 'pending'
}))

function mapStatus(rawStatus, meta = {}) {
  if (!rawStatus) {
    if (meta && (meta.skipped || meta.skip)) return 'skipped'
    if (meta && (meta.error || meta.errored)) return 'error'
    return 'completed'
  }
  const lookupKey = rawStatus.toString().toLowerCase()
  const status = STATUS_MAP[lookupKey]
  return status || 'completed'
}

function normalizeProgress(progress, pipeline = DEFAULT_PIPELINE) {
  if (!Array.isArray(progress) || progress.length === 0) return []
  const normalizedEntries = progress.map((entry, index) => {
    const key = String(entry?.stage ?? entry?.name ?? `stage-${index}`)
    const label = resolveStageLabel(key, entry?.label)
    const meta = entry?.meta && typeof entry.meta === 'object' ? entry.meta : {}
    const status = mapStatus(entry?.status, meta)
    let duration
    if (typeof entry?.duration_ms === 'number') duration = entry.duration_ms
    else if (typeof entry?.total_ms === 'number') duration = entry.total_ms
    return {
      key,
      label,
      status,
      durationMs: duration,
      meta
    }
  })

  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return normalizedEntries
  }

  const pipelineByKey = new Map(pipeline.map((stage) => [stage.key, stage]))
  const seen = new Set()

  const merged = pipeline.map((stageTemplate) => {
    const normalized = normalizedEntries.find((entry) => entry.key === stageTemplate.key)
    if (normalized) {
      seen.add(stageTemplate.key)
      return {
        ...stageTemplate,
        ...normalized,
        label: resolveStageLabel(stageTemplate.key, normalized.label)
      }
    }
    return {
      ...stageTemplate,
      label: resolveStageLabel(stageTemplate.key, stageTemplate.label)
    }
  })

  normalizedEntries.forEach((entry) => {
    if (seen.has(entry.key)) return
    const template = pipelineByKey.get(entry.key)
    merged.push({
      ...(template ? { ...template } : {}),
      ...entry,
      label: resolveStageLabel(entry.key, entry.label)
    })
  })

  return merged
}

function applyLoadingState(baseStages, stageIndex) {
  if (!Array.isArray(baseStages) || baseStages.length === 0) return []
  return baseStages.map((stage, index) => {
    if (index < stageIndex) return { ...stage, status: 'completed' }
    if (index === stageIndex) return { ...stage, status: 'running' }
    return { ...stage, status: 'pending' }
  })
}

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)} s`
  return `${seconds.toFixed(0)} s`
}

module.exports = {
  DEFAULT_PIPELINE,
  humanizeStage,
  mapStatus,
  normalizeProgress,
  applyLoadingState,
  formatDuration,
  STATUS_LABELS,
  STATUS_MAP
}
