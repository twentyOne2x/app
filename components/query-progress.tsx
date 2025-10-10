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
            const durationLabel = formatDuration(stage.durationMs)
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
                  <div className="text-xs text-zinc-300">
                    {stage.status === 'running'
                      ? 'In progress…'
                      : stage.status === 'completed'
                        ? durationLabel
                          ? `Completed in ${durationLabel}`
                          : 'Completed'
                        : stage.status === 'skipped'
                          ? 'Skipped'
                          : stage.status === 'error'
                            ? 'Encountered an error'
                            : 'Pending'}
                  </div>
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
