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
  if (typeof providedLabel === 'string' && providedLabel.trim()) {
    return providedLabel.trim()
  }
  return fallback
}

const DEFAULT_STAGE_KEYS = [
  'retrieve',
  'rerank_cross_encoder',
  'review_docs',
  'stitch',
  'synthesize',
  'validate_answer'
]

const DEFAULT_STAGE_ORDER = [...DEFAULT_STAGE_KEYS]

const DEFAULT_PIPELINE = DEFAULT_STAGE_KEYS.map((key) => ({
  key,
  label: resolveStageLabel(key),
  status: 'pending',
  meta: { stage_key: key }
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
    const stageData =
      entry &&
      typeof entry === 'object' &&
      entry.event &&
      typeof entry.event === 'object'
        ? entry.event
        : entry
    const key = String(stageData?.stage ?? stageData?.name ?? `stage-${index}`)
    const label = resolveStageLabel(key, stageData?.label)
    const metaBase =
      stageData?.meta && typeof stageData.meta === 'object'
        ? { ...stageData.meta }
        : {}
    const metadata =
      stageData?.metadata && typeof stageData.metadata === 'object'
        ? { ...stageData.metadata }
        : {}
    const meta =
      Object.keys({ ...metaBase, ...metadata }).length > 0
        ? { ...metaBase, ...metadata }
        : {}
    if (
      entry &&
      typeof entry === 'object' &&
      entry !== stageData
    ) {
      if (entry.type && typeof entry.type === 'string') {
        meta.event_type = entry.type
      }
      if (entry.timestamp && typeof entry.timestamp === 'string') {
        meta.event_timestamp = entry.timestamp
      }
    }
    if (meta && typeof meta === 'object' && !('stage_key' in meta)) {
      meta.stage_key = key
    }
    const status = mapStatus(stageData?.status, meta)
    let duration
    if (typeof stageData?.duration_ms === 'number') duration = stageData.duration_ms
    else if (typeof stageData?.total_ms === 'number') duration = stageData.total_ms
    return {
      key,
      label,
      status,
      durationMs: duration,
      meta
    }
  })

  const latestByKey = new Map()
  const keyOrder = []
  normalizedEntries.forEach((entry) => {
    const existing = latestByKey.get(entry.key)
    if (existing) {
      const mergedMeta =
        existing.meta || entry.meta
          ? { ...(existing.meta ?? {}), ...(entry.meta ?? {}) }
          : undefined
      const fallbackLabel = resolveStageLabel(entry.key)
      const entryLabelTrimmed = entry.label && entry.label.trim ? entry.label.trim() : entry.label
      const hasCustomLabel =
        typeof entryLabelTrimmed === 'string' && entryLabelTrimmed.length > 0 && entryLabelTrimmed !== fallbackLabel
      const preferredLabel = hasCustomLabel ? entry.label : existing.label
      latestByKey.set(entry.key, {
        ...existing,
        ...entry,
        label: resolveStageLabel(entry.key, preferredLabel ?? entry.label ?? existing.label),
        ...(mergedMeta ? { meta: mergedMeta } : {})
      })
    } else {
      latestByKey.set(entry.key, entry)
      keyOrder.push(entry.key)
    }
  })

  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return keyOrder.map((key) => latestByKey.get(key)).filter(Boolean)
  }

  const pipelineByKey = new Map(pipeline.map((stage) => [stage.key, stage]))
  const seen = new Set()

  const merged = pipeline.map((stageTemplate) => {
    const normalized = latestByKey.get(stageTemplate.key)
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

  keyOrder.forEach((key) => {
    if (seen.has(key)) return
    const entry = latestByKey.get(key)
    if (!entry) return
    const template = pipelineByKey.get(key)
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
  DEFAULT_STAGE_ORDER,
  humanizeStage,
  mapStatus,
  normalizeProgress,
  applyLoadingState,
  formatDuration,
  STATUS_LABELS,
  STATUS_MAP
}
