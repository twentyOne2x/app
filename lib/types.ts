// lib/types.ts
import { type Message as AIMsg } from 'ai'
import type { ParsedMetadataEntryV2 } from './utils'

export type Message = AIMsg

export type ServerActionResult<Result> = Promise<Result | { error: string }>

/** Unified Chat shape used in KV and across routes/components. */
export interface Chat {
  id: string
  title: string
  userId: string
  createdAt: number        // ms since epoch (matches /api/chat + create-shared-chat)
  path: string
  messages: AIMsg[]        // use Message type from 'ai'
  structured_metadata: ParsedMetadataEntryV2[]  // V2 metadata everywhere
  entryProfileCode?: string
  readOnly?: boolean
  sharePath?: string
  originalChatId?: string
}

/** Optional legacy metadata entry (keep only if some old code still references it). */
export interface LegacyParsedMetadataEntry {
  index: number
  type: string
  title: string
  link: string
  extraInfo: string
  publishedDate: Date | null
  publishedDateString: string
}

/** If you need to attach metadata to messages inline. */
export interface ExtendedMessage extends AIMsg {
  structured_metadata?: ParsedMetadataEntryV2[]
  diagnostics?: DiagnosticsPayload
}

export type ProgressStageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'error'

export interface ProgressTraceEntry {
  stage?: string
  name?: string
  status?: string
  started_ms?: number
  completed_ms?: number
  duration_ms?: number
  total_ms?: number
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export interface DiagnosticsPayload {
  request_id?: string
  total_ms?: number
  timings?: Record<string, unknown>
  progress?: ProgressTraceEntry[]
  progress_metadata?: Record<string, unknown>
  models?: Record<string, unknown>
  final_kept?: unknown
  config?: Record<string, unknown>
  early_abort?: Record<string, unknown>
}

export interface ChannelFilterPayload {
  include_ids?: string[]
  exclude_ids?: string[]
  include_names?: string[]
  exclude_names?: string[]
}

export type ClipGenerationStatus = 'idle' | 'queued' | 'processing' | 'ready' | 'error'

export interface ClipGenerationRequestPayload {
  sourceUrl?: string
  parentTitle?: string
  clipLabel?: string
  channel?: string
  start: number
  end: number
  contextMode: 'seconds' | 'sentence'
  padBefore: number
  padAfter: number
}

export interface ClipGenerationRecord {
  clipId?: string
  id?: string
  status: ClipGenerationStatus
  streamUrl?: string
  downloadUrl?: string
  errorMessage?: string
  requestPayload?: ClipGenerationRequestPayload
  lastUpdated: number | string
}

export type ClipGenerationStore = Record<string, ClipGenerationRecord>
