import type { ProgressTraceEntry, ProgressStageStatus } from './types'

export interface DisplayStage {
  key: string
  label: string
  status: ProgressStageStatus | 'pending'
  durationMs?: number
  meta?: Record<string, unknown>
}

export declare const DEFAULT_PIPELINE: DisplayStage[]

export declare function humanizeStage(key: string): string

export declare function mapStatus(
  rawStatus?: string,
  meta?: Record<string, unknown>
): ProgressStageStatus

export declare function normalizeProgress(
  progress?: ProgressTraceEntry[] | null
): DisplayStage[]

export declare function applyLoadingState(
  baseStages: DisplayStage[],
  stageIndex: number
): DisplayStage[]

export declare function formatDuration(ms?: number | null): string | null

export declare const STATUS_LABELS: Record<string, string>
export declare const STATUS_MAP: Record<string, ProgressStageStatus>
