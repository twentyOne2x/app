'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { DiagnosticsPayload, ProgressStageStatus } from '@/lib/types'
import type { DisplayStage } from '@/lib/progress-display'
import {
  DEFAULT_PIPELINE,
  normalizeProgress,
  applyLoadingState,
  formatDuration
} from '@/lib/progress-display'

type StageMeta = Record<string, unknown>

function formatNumber(value: unknown, digits = 2): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(digits)
  }
  if (typeof value === 'string') return value
  return null
}

function formatCount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`
  return null
}

function renderSourcePreview(sources: unknown, limit = 3): JSX.Element | null {
  if (!Array.isArray(sources) || !sources.length) return null
  const items = sources.slice(0, limit).map((entry, index) => {
    if (!entry || typeof entry !== 'object') return null
    const title = typeof (entry as { title?: unknown }).title === 'string' ? (entry as { title: string }).title : null
    const channel =
      typeof (entry as { channel?: unknown }).channel === 'string' ? (entry as { channel: string }).channel : null
    const scoreRaw = (entry as { score?: unknown }).score
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw.toFixed(2)
        : typeof scoreRaw === 'string'
          ? scoreRaw
          : null
    const labelParts = [title, channel ? `@${channel}` : null, score ? `score ${score}` : null].filter(Boolean)
    if (!labelParts.length) return null
    return (
      <li key={`${title ?? channel ?? index}`} className="truncate">
        {labelParts.join(' · ')}
      </li>
    )
  })
  const filteredItems = items.filter(Boolean)
  if (!filteredItems.length) return null
  return <ul className="mt-2 space-y-1 text-[11px] text-zinc-200/80">{filteredItems}</ul>
}

function renderStageDetails(stage: DisplayStage): JSX.Element | null {
  const meta = (stage.meta ?? {}) as StageMeta
  const detailLines: JSX.Element[] = []

  const statusText = (() => {
    const durationLabel = formatDuration(stage.durationMs)
    switch (stage.status) {
      case 'running':
        return 'In progress…'
      case 'completed':
        return durationLabel ? `Completed in ${durationLabel}` : 'Completed'
      case 'skipped':
        return `Skipped${meta.reason ? ` — ${(meta.reason as string)}` : ''}`
      case 'error':
        return `Error${meta.reason ? ` — ${(meta.reason as string)}` : ''}`
      default:
        return 'Pending'
    }
  })()

  const reason =
    typeof meta.reason === 'string'
      ? meta.reason
      : typeof meta.skip_reason === 'string'
        ? meta.skip_reason
        : undefined

  if (stage.status === 'skipped' && reason) {
    detailLines.push(
      <div key="skip-reason" className="text-[11px] text-amber-200/80">
        Reason: {reason}
      </div>
    )
  }

  switch (stage.key) {
    case 'retrieve': {
      const initial = formatCount(meta.initial_candidates)
      const scoreMin = formatNumber(meta.score_min)
      const scoreMax = formatNumber(meta.score_max)
      if (initial) {
        detailLines.push(
          <div key="retrieve-count" className="text-[11px] text-zinc-200/80">
            Initial candidates: {initial}
          </div>
        )
      }
      if (scoreMin || scoreMax) {
        detailLines.push(
          <div key="retrieve-range" className="text-[11px] text-zinc-200/80">
            Score range: {scoreMin ?? '—'} – {scoreMax ?? '—'}
          </div>
        )
      }
      const topPreview = renderSourcePreview(meta.top_sources)
      if (topPreview) {
        detailLines.push(
          <div key="retrieve-top">
            <div className="mt-2 text-[11px] uppercase tracking-wide text-zinc-400/80">Top matches</div>
            {topPreview}
          </div>
        )
      }
      const entityMeta = meta.entity_gate && typeof meta.entity_gate === 'object' ? (meta.entity_gate as StageMeta) : null
      if (entityMeta) {
        const required = Array.isArray(entityMeta.required_entities) ? entityMeta.required_entities : null
        const keptCount = formatCount(entityMeta.kept)
        if (required && required.length) {
          detailLines.push(
            <div key="retrieve-entities" className="mt-2 text-[11px] text-zinc-200/80">
              Entity gate required: {required.join(', ')} ({entityMeta.applied ? 'applied' : 'not applied'})
            </div>
          )
        }
        if (entityMeta.applied && keptCount === '0') {
          detailLines.push(
            <div key="retrieve-entities-warning" className="text-[11px] text-amber-300/80">
              No clips mention all required entities.
            </div>
          )
        }
      }
      break
    }
    case 'rerank_cross_encoder': {
      const keptAfter = formatCount(meta.kept_after_ce)
      const pcut = formatNumber(meta.pcut)
      if (keptAfter || pcut) {
        detailLines.push(
          <div key="rerank-summary" className="text-[11px] text-zinc-200/80">
            Kept {keptAfter ?? '?'} clips{pcut ? ` · pcut ${pcut}` : ''}
          </div>
        )
      }
      const keptSourcesPreview = renderSourcePreview(meta.kept_sources)
      if (keptSourcesPreview) {
        detailLines.push(
          <div key="rerank-kept">
            <div className="mt-2 text-[11px] uppercase tracking-wide text-zinc-400/80">Kept sources</div>
            {keptSourcesPreview}
          </div>
        )
      }
      break
    }
    case 'review_docs':
    case 'stitch': {
      const inputCount = formatCount(meta.input_count)
      const outputCount = formatCount(meta.output_count ?? meta.final_candidates)
      if (inputCount || outputCount) {
        detailLines.push(
          <div key={`${stage.key}-counts`} className="text-[11px] text-zinc-200/80">
            {inputCount ?? '?'} → {outputCount ?? '?'} clips
          </div>
        )
      }
      const samples =
        renderSourcePreview(
          stage.key === 'review_docs' ? meta.sample_sources ?? meta.cleaned_sources : meta.final_candidates
        ) ?? null
      if (samples) {
        detailLines.push(
          <div key={`${stage.key}-samples`}>
            <div className="mt-2 text-[11px] uppercase tracking-wide text-zinc-400/80">
              {stage.key === 'review_docs' ? 'Sample cleaned clips' : 'Final candidates'}
            </div>
            {samples}
          </div>
        )
      }
      break
    }
    case 'synthesize': {
      const llm = typeof meta.llm_model === 'string' ? meta.llm_model : null
      const tokenEstimate = formatCount(meta.tokens_estimate)
      if (llm || tokenEstimate) {
        detailLines.push(
          <div key="synth-summary" className="text-[11px] text-zinc-200/80">
            {llm ? `Model: ${llm}` : ''} {tokenEstimate ? `· ~${tokenEstimate} tokens` : ''}
          </div>
        )
      }
      const finalSourcesPreview = renderSourcePreview(meta.final_sources)
      if (finalSourcesPreview) {
        detailLines.push(
          <div key="synth-final">
            <div className="mt-2 text-[11px] uppercase tracking-wide text-zinc-400/80">Answer sources</div>
            {finalSourcesPreview}
          </div>
        )
      }
      break
    }
    default:
      break
  }

  if (stage.status === 'skipped' && !detailLines.length && statusText) {
    detailLines.push(
      <div key="default-skip" className="text-[11px] text-zinc-200/80">
        {statusText}
      </div>
    )
  }

  return (
    <>
      <div className="text-xs text-zinc-300">{statusText}</div>
      {detailLines.length ? <div className="mt-2 space-y-2">{detailLines}</div> : null}
    </>
  )
}

function statusStyles(status: ProgressStageStatus): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    case 'running':
      return 'border-sky-400/30 bg-sky-400/10 text-sky-200'
    case 'skipped':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-200'
    case 'error':
      return 'border-rose-400/30 bg-rose-400/10 text-rose-200'
    default:
      return 'border-white/15 bg-white/5 text-zinc-200'
  }
}

function statusIcon(status: ProgressStageStatus) {
  switch (status) {
    case 'completed':
      return '✓'
    case 'running':
      return '↻'
    case 'skipped':
      return '⤴'
    case 'error':
      return '!'
    default:
      return '○'
  }
}

interface QueryProgressProps {
  loading: boolean
  diagnostics?: DiagnosticsPayload | null
  stageHintIndex?: number
}

export default function QueryProgress({ loading, diagnostics, stageHintIndex = 0 }: QueryProgressProps) {
  const stages = useMemo<DisplayStage[]>(() => {
    const normalized = normalizeProgress(diagnostics?.progress)
    if (normalized.length) return normalized
    if (loading) return applyLoadingState(DEFAULT_PIPELINE, stageHintIndex % DEFAULT_PIPELINE.length)
    if (diagnostics) return []
    return DEFAULT_PIPELINE
  }, [diagnostics, loading, stageHintIndex])

  const totalMs = diagnostics?.total_ms
  const requestId = diagnostics?.request_id
  const earlyAbort = diagnostics?.early_abort

  if (!loading && !diagnostics && !stages.length) return null

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-zinc-100">Query progress</h2>
          {requestId ? (
            <p className="text-xs text-zinc-500">
              Request ID:&nbsp;
              <span className="font-mono text-zinc-300">{requestId}</span>
            </p>
          ) : null}
        </div>
        <div className="text-xs text-zinc-400">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex size-2 animate-pulse rounded-full bg-sky-300" />
              Working…
            </span>
          ) : totalMs != null ? (
            <span>Total time: {formatDuration(totalMs) ?? `${totalMs} ms`}</span>
          ) : null}
        </div>
      </div>

      {stages.length ? (
        <ol className="space-y-2">
          {stages.map((stage) => {
            return (
              <li
                key={stage.key}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-3 py-2 transition',
                  statusStyles(stage.status)
                )}
              >
                <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full border border-white/20 text-xs font-semibold">
                  {statusIcon(stage.status)}
                </span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-white">{stage.label}</span>
                  {renderStageDetails(stage)}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
          {loading
            ? 'Preparing timeline…'
            : 'The backend did not provide detailed progress for this request.'}
        </div>
      )}

      {earlyAbort ? (
        <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          Query ended early.
        </div>
      ) : null}
    </section>
  )
}
