// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const NAME_ALIASES: Record<string, string> = {
  cupsy: 'Cupsey',
  hyperliquid: 'Hyper Liquid'
}

function aliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function applyNameAlias(value?: string | null): string | undefined {
  if (!value) return value ?? undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const normalized = NAME_ALIASES[aliasKey(trimmed)]
  return (normalized ?? trimmed) || undefined
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
) // 7-character random string

// Assuming you've set REACT_APP_BACKEND_URL in your environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL

export async function fetcher<JSON = any>(
  endpoint: string,
  init?: RequestInit
): Promise<JSON> {
  const res = await fetch(`${backendUrl}${endpoint}`, init)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    if ((json as any)?.error) {
      const error = new Error((json as any).error) as Error & { status: number }
      error.status = res.status
      throw error
    }
    throw new Error('An unexpected error occurred')
  }
  return res.json()
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

/* ──────────────────────────────────────────────────────────────────────────
 * Structured metadata v2 (parents with clips)
 * ────────────────────────────────────────────────────────────────────────── */

export interface ClipItemV2 {
  parentTitle: string
  channel: string
  date?: string
  url?: string          // exact-start URL if present in the answer links
  score?: number
  startHMS?: string
  endHMS?: string
  startS?: number
  endS?: number
  speaker?: string
  excerpt?: string
  segmentId?: string
  parentId?: string
  videoId?: string
  documentType?: string
  nodeType?: string
  clipUrl?: string
  channelId?: string
  channelName?: string
  publishedAt?: string
  publishedDate?: string
}

export interface ParsedMetadataEntryV2 {
  parentTitle: string
  channel: string
  date?: string
  url?: string          // canonical/first link we saw for this parent
  scoreMax?: number
  clips: ClipItemV2[]
  videoId?: string
  channelId?: string
  channelName?: string
  publishedAt?: string
  publishedDate?: string
}

/** Pull the trailing sources section out of the LLM answer text. */
export function extractSourcesBlock(fullText: string): string | null {
  if (!fullText) return null
  const marker = 'Fetched based on the following sources:'
  const i = fullText.lastIndexOf(marker)
  if (i === -1) return null
  return fullText.slice(i + marker.length).trim()
}

/** Build a map of cleaned link text -> URL from the whole answer (for URL enrichment). */
function harvestTitleToUrlMap(fullText: string): Record<string, string> {
  const map: Record<string, string> = {}
  const linkRe = /\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(fullText))) {
    const rawTitle = (m[1] || '').trim()
    const title = cleanTitle(rawTitle)
    if (title && !map[title]) map[title] = m[2]
  }
  return map
}

// Matches leading "YYYY-MM-DD_<11charID>_" prefix
const DATE_ID_PREFIX_RE = /^\d{4}-\d{2}-\d{2}_[A-Za-z0-9_-]{11}_/
function cleanTitle(s: string): string {
  return (s || '').replace(DATE_ID_PREFIX_RE, '').trim()
}
function toNumber(x?: string): number | undefined {
  if (!x) return undefined
  const n = Number(x)
  return Number.isFinite(n) ? n : undefined
}
function timeToSeconds(hms?: string): number | undefined {
  if (!hms) return undefined
  const parts = hms.split(':').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return undefined
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

// Example line (video rows emitted by backend):
// [Title]: <title> (00:12:34–00:15:22), [Speaker]: X, [Channel]: Y, [Date]: 2024-06-01, [Score]: 0.8123
// Optional: [Excerpt]: foo … bar
const FIELD_RE = /\[(Title|Speaker|Channel|Date|Score|Excerpt)\]:\s*([^,\n]+)(?:,|$)/gi
const RANGE_RE = /\(([0-9]{2}:[0-9]{2}:[0-9]{2})\s*[–-]\s*([0-9]{2}:[0-9]{2}:[0-9]{2})\)/

interface ParsedRow {
  title: string
  channel: string
  date?: string
  speaker?: string
  score?: number
  start_hms?: string
  end_hms?: string
  excerpt?: string
}

function parseOneLine(line: string): ParsedRow | null {
  const out: ParsedRow = { title: '', channel: '' }

  // Title + optional (HH:MM:SS–HH:MM:SS)
  const titleRe = /\[Title\]:\s*([^(,\n]+)(?:\s*\(([^)]+)\))?/i
  const titleMatch = titleRe.exec(line)
  if (!titleMatch) return null
  out.title = cleanTitle(titleMatch[1].trim())

  const tr = RANGE_RE.exec(line)
  if (tr) {
    out.start_hms = tr[1]
    out.end_hms = tr[2]
  }

  let m: RegExpExecArray | null
  FIELD_RE.lastIndex = 0
  while ((m = FIELD_RE.exec(line))) {
    const key = m[1].toLowerCase()
    const val = (m[2] || '').trim()
    switch (key) {
      case 'speaker':
        out.speaker = val || undefined
        break
      case 'channel':
        out.channel = val || ''
        break
      case 'date':
        out.date = val || undefined
        break
      case 'score':
        out.score = toNumber(val)
        break
      case 'excerpt':
        out.excerpt = val || undefined
        break
    }
  }
  return out.channel ? out : null
}

/**
 * NEW parser:
 *  - Accepts the sources block + full answer (to harvest links)
 *  - Groups rows by parent (title+channel+date)
 *  - Provides per-clip timing/speaker/excerpt and exact-start URLs when available
 */
export function parseMetadata(
  sourcesBlock: string,
  fullAnswerTextForLinks?: string
): ParsedMetadataEntryV2[] {
  if (!sourcesBlock?.trim()) return []

  const titleToUrl =
    fullAnswerTextForLinks ? harvestTitleToUrlMap(fullAnswerTextForLinks) : {}

  const lines = sourcesBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const clips: ClipItemV2[] = []
  for (const line of lines) {
    const row = parseOneLine(line)
    if (!row) continue
    const startS = timeToSeconds(row.start_hms)
    const endS = timeToSeconds(row.end_hms)
    const url = titleToUrl[row.title]
    clips.push({
      parentTitle: row.title,
      channel: applyNameAlias(row.channel) ?? row.channel,
      date: row.date,
      url,
      score: row.score,
      startHMS: row.start_hms,
      endHMS: row.end_hms,
      startS,
      endS,
      speaker: applyNameAlias(row.speaker) ?? row.speaker,
      excerpt: row.excerpt
    })
  }

  const keyOf = (c: ClipItemV2) => `${c.parentTitle}|||${c.channel}|||${c.date ?? ''}`
  const byParent = new Map<string, ParsedMetadataEntryV2>()

  for (const c of clips) {
    const k = keyOf(c)
    const existing = byParent.get(k)
    if (existing) {
      existing.clips.push(c)
      if (c.score != null) {
        existing.scoreMax =
          existing.scoreMax == null ? c.score : Math.max(existing.scoreMax, c.score)
      }
      if (!existing.url && c.url) existing.url = c.url
      existing.videoId = existing.videoId ?? c.videoId ?? c.parentId
      existing.channelId = existing.channelId ?? c.channelId
      existing.channelName = existing.channelName ?? c.channelName ?? c.channel
      if (!existing.publishedAt) {
        existing.publishedAt = c.publishedAt
      }
      if (!existing.publishedDate) {
        existing.publishedDate = c.publishedDate ?? c.date
      }
    } else {
      byParent.set(k, {
        parentTitle: c.parentTitle,
        channel: c.channel,
        date: c.date,
        url: c.url,
        scoreMax: c.score,
        clips: [c],
        videoId: c.videoId ?? c.parentId,
        channelId: c.channelId,
        channelName: c.channelName ?? c.channel,
        publishedAt: c.publishedAt,
        publishedDate: c.publishedDate ?? c.date
      })
    }
  }

  // sort clips within each parent by start time
  Array.from(byParent.values()).forEach((p) => {
    p.clips.sort((a, b) => (a.startS ?? 0) - (b.startS ?? 0))
  })

  const parents = Array.from(byParent.values())
  parents.sort((a, b) => {
    const s = (b.scoreMax ?? 0) - (a.scoreMax ?? 0)
    if (s !== 0) return s
    return String(b.date ?? '') < String(a.date ?? '') ? -1 : 1
  })

  return normalizeMetadataEntries(parents)
}

export function normalizeMetadataEntries(entries: ParsedMetadataEntryV2[]): ParsedMetadataEntryV2[] {
  return entries.map((entry) => {
    const normalizedChannelName = applyNameAlias(entry.channelName ?? entry.channel) ?? entry.channelName ?? entry.channel
    const normalizedPublishedAt = entry.publishedAt ?? entry.publishedDate ?? entry.date
    const normalizedClips = entry.clips.map((clip) => {
      const clipChannelName = applyNameAlias(clip.channelName ?? clip.channel) ?? clip.channelName ?? clip.channel
      return {
        ...clip,
        channel: clipChannelName,
        channelName: clipChannelName,
        channelId: clip.channelId ?? entry.channelId,
        speaker: applyNameAlias(clip.speaker) ?? clip.speaker,
        clipUrl: clip.clipUrl ?? clip.url,
        parentId: clip.parentId ?? entry.videoId ?? clip.videoId,
        videoId: clip.videoId ?? entry.videoId,
        publishedAt: clip.publishedAt ?? normalizedPublishedAt,
        publishedDate: clip.publishedDate ?? normalizedPublishedAt ?? clip.date
      }
    })
    return {
      ...entry,
      channel: normalizedChannelName,
      channelName: normalizedChannelName,
      channelId: entry.channelId,
      videoId: entry.videoId,
      publishedAt: normalizedPublishedAt ?? undefined,
      publishedDate: entry.publishedDate ?? normalizedPublishedAt ?? undefined,
      date: normalizedPublishedAt ?? entry.date,
      clips: normalizedClips
    }
  })
}
