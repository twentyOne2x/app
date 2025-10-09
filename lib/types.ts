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
}
