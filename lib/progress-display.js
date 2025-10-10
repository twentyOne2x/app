/**
 * Shared helpers for rendering query progress timelines.
 * Kept in plain JS so we can exercise them with Node's built-in test runner.
 */

const STATUS_LABELS = {
  startup: 'Bootstrapping engine',
  route: 'Routing query',
  retrieve: 'Fetching documents',
  rerank: 'Reranking candidates',
  review_docs: 'Reviewing docs',
  review: 'Reviewing docs',
  stitch: 'Stitching citations',
  synthesize: 'Composing answer',
  synth: 'Composing answer',
  validate: 'Validating answer',
  finalize: 'Finalising sources',
  final_kept: 'Selecting final sources',
  fallback: 'Fallback strategy',
  cache: 'Checking cache'
}

const STATUS_MAP = {
  running: 'running',
  in_progress: 'running',
  started: 'running',
  completed: 'completed',
  complete: 'completed',
  finished: 'completed',
  done: 'completed',
  skipped: 'skipped',
  aborted: 'error',
  error: 'error',
  errored: 'error',
  failed: 'error'
}

const DEFAULT_PIPELINE = [
  { key: 'route', label: 'Routing query', status: 'pending' },
  { key: 'retrieve', label: 'Fetching documents', status: 'pending' },
  { key: 'rerank', label: 'Reranking candidates', status: 'pending' },
  { key: 'review', label: 'Reviewing docs', status: 'pending' },
  { key: 'synthesize', label: 'Composing answer', status: 'pending' },
  { key: 'finalize', label: 'Finalising sources', status: 'pending' }
]

function humanizeStage(key) {
  if (!key) return 'Step'
  if (STATUS_LABELS[key]) return STATUS_LABELS[key]
  return key
    .toString()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function mapStatus(rawStatus, meta = {}) {
  if (!rawStatus) {
    if (meta && (meta.skipped || meta.skip)) return 'skipped'
    if (meta && (meta.error || meta.errored)) return 'error'
    return 'completed'
  }
  const status = STATUS_MAP[rawStatus.toString().toLowerCase()]
  return status || 'completed'
}

function normalizeProgress(progress) {
  if (!Array.isArray(progress) || progress.length === 0) return []
  return progress.map((entry, index) => {
    const key = String(entry?.stage ?? entry?.name ?? `stage-${index}`)
    const label = humanizeStage(key)
    const meta = entry?.meta && typeof entry.meta === 'object' ? entry.meta : {}
    const status = mapStatus(entry?.status, meta)
    let duration = undefined
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
