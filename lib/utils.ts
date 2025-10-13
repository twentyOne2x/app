// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const NAME_ALIASES: Record<string, string> = {
  cupsy: 'Cupsey',
  hyperliquid: 'Hyper Liquid',
  anzo: 'Anza'
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

export function normalizeAliasesInText(text: string): string {
  if (typeof text !== 'string' || !text) return text
  return text.replace(/\b([A-Za-z][A-Za-z0-9]*)(['’]s)?\b/g, (full, word, possessive) => {
    const aliased = applyNameAlias(word)
    if (!aliased || aliased === word) return full
    return `${aliased}${possessive ?? ''}`
  })
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
  url?: string // exact-start URL if present in the answer links
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
  thumbnailUrl?: string
  channel_name?: string
  channel_id?: string
  published_at?: string
  published_date?: string
  clip_url?: string
  video_id?: string
  parent_id?: string
  thumbnail_url?: string
}

export interface ParsedMetadataEntryV2 {
  parentTitle: string
  channel: string
  date?: string
  url?: string // canonical/first link we saw for this parent
  scoreMax?: number
  clips: ClipItemV2[]
  videoId?: string
  channelId?: string
  channelName?: string
  publishedAt?: string
  publishedDate?: string
  thumbnailUrl?: string
  parentId?: string
  id?: string
  channel_name?: string
  channel_id?: string
  published_at?: string
  published_date?: string
  video_id?: string
  thumbnail_url?: string
  parent_id?: string
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
  const parts = hms.split(':').map(p => parseInt(p, 10))
  if (parts.length !== 3 || parts.some(v => Number.isNaN(v))) return undefined
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

// Example line (video rows emitted by backend):
// [Title]: <title> (00:12:34–00:15:22), [Speaker]: X, [Channel]: Y, [Date]: 2024-06-01, [Score]: 0.8123
// Optional: [Excerpt]: foo … bar
const FIELD_RE =
  /\[(Title|Speaker|Channel|Date|Score|Excerpt)\]:\s*([^,\n]+)(?:,|$)/gi
const RANGE_RE =
  /\(([0-9]{2}:[0-9]{2}:[0-9]{2})\s*[–-]\s*([0-9]{2}:[0-9]{2}:[0-9]{2})\)/

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

  const titleToUrl = fullAnswerTextForLinks
    ? harvestTitleToUrlMap(fullAnswerTextForLinks)
    : {}

  const lines = sourcesBlock
    .split('\n')
    .map(l => l.trim())
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

  const keyOf = (c: ClipItemV2) =>
    `${c.parentTitle}|||${c.channel}|||${c.date ?? ''}`
  const byParent = new Map<string, ParsedMetadataEntryV2>()

  for (const c of clips) {
    const k = keyOf(c)
    const existing = byParent.get(k)
    if (existing) {
      existing.clips.push(c)
      if (c.score != null) {
        existing.scoreMax =
          existing.scoreMax == null
            ? c.score
            : Math.max(existing.scoreMax, c.score)
      }
      if (!existing.url && c.url) existing.url = c.url
      existing.videoId =
        existing.videoId ?? c.videoId ?? c.parentId ?? c.video_id ?? c.parent_id
      existing.channelId = existing.channelId ?? c.channelId ?? c.channel_id
      existing.channelName =
        existing.channelName ?? c.channelName ?? c.channel ?? c.channel_name
      if (!existing.publishedAt) {
        existing.publishedAt = c.publishedAt ?? c.published_at
      }
      if (!existing.publishedDate) {
        existing.publishedDate =
          c.publishedDate ?? c.published_at ?? c.published_date ?? c.date
      }
    } else {
      byParent.set(k, {
        parentTitle: c.parentTitle,
        channel: c.channel,
        date: c.date,
        url: c.url,
        scoreMax: c.score,
        clips: [c],
        videoId: c.videoId ?? c.parentId ?? c.video_id ?? c.parent_id,
        channelId: c.channelId ?? c.channel_id,
        channelName: c.channelName ?? c.channel ?? c.channel_name,
        publishedAt: c.publishedAt ?? c.published_at,
        publishedDate:
          c.publishedDate ?? c.published_at ?? c.published_date ?? c.date
      })
    }
  }

  // sort clips within each parent by start time
  Array.from(byParent.values()).forEach(p => {
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

export function normalizeMetadataEntries(
  entries: ParsedMetadataEntryV2[]
): ParsedMetadataEntryV2[] {
  const readString = (
    obj: Record<string, unknown>,
    key: string
  ): string | undefined => {
    const value = obj?.[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? trimmed : undefined
    }
    return undefined
  }

  const toAbsoluteUrl = (candidate?: string): string | undefined => {
    if (!candidate) return undefined
    try {
      const url = new URL(candidate)
      return url.toString()
    } catch {
      return undefined
    }
  }

  const extractYouTubeId = (candidate?: string): string | undefined => {
    if (!candidate) return undefined
    try {
      const parsed = new URL(candidate)
      if (parsed.hostname.includes('youtu.be')) {
        const slug = parsed.pathname.replace('/', '').split('/')[0]
        return slug || undefined
      }
      if (parsed.hostname.includes('youtube.com')) {
        const id = parsed.searchParams.get('v')
        return id ?? undefined
      }
      return undefined
    } catch {
      return undefined
    }
  }

  const youtubeThumbnailFrom = (
    candidateUrl?: string,
    fallbackVideoId?: string | null
  ): string | undefined => {
    const videoId =
      extractYouTubeId(candidateUrl) ?? fallbackVideoId ?? undefined
    return videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : undefined
  }

  const parseHmsToSeconds = (hms?: string): number | null => {
    if (!hms) return null
    const trimmed = hms.trim()
    if (!trimmed) return null
    const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(trimmed)
    if (!match) return null
    const [, hh, mm, ss, fraction] = match
    const hours = Number(hh)
    const minutes = Number(mm)
    const seconds = Number(ss)
    const fractional = fraction ? Number(`0.${fraction}`) : 0
    return hours * 3600 + minutes * 60 + seconds + fractional
  }

  const secondsToHms = (seconds: number): string => {
    const totalMillis = Math.round(seconds * 1000)
    const hours = Math.floor(totalMillis / 3600000)
    const minutes = Math.floor((totalMillis % 3600000) / 60000)
    const secs = Math.floor((totalMillis % 60000) / 1000)
    const millis = totalMillis % 1000
    const base = [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':')
    return millis ? `${base}.${millis.toString().padStart(3, '0')}` : base
  }

  const clipStartSeconds = (clip: ClipItemV2): number | null => {
    if (typeof clip.startS === 'number') return clip.startS
    return parseHmsToSeconds(clip.startHMS)
  }

  const clipEndSeconds = (clip: ClipItemV2): number | null => {
    if (typeof clip.endS === 'number') return clip.endS
    return parseHmsToSeconds(clip.endHMS)
  }

  const choosePreferredClip = (a: ClipItemV2, b: ClipItemV2): ClipItemV2 => {
    const scoreA = typeof a.score === 'number' ? a.score : null
    const scoreB = typeof b.score === 'number' ? b.score : null
    if (scoreA == null && scoreB == null) {
      const excerptLenA = a.excerpt?.length ?? 0
      const excerptLenB = b.excerpt?.length ?? 0
      return excerptLenB > excerptLenA ? b : a
    }
    if (scoreA == null) return b
    if (scoreB == null) return a
    if (scoreB > scoreA) return b
    if (scoreA > scoreB) return a
    const excerptLenA = a.excerpt?.length ?? 0
    const excerptLenB = b.excerpt?.length ?? 0
    return excerptLenB > excerptLenA ? b : a
  }

  const mergeOverlappingClips = (clips: ClipItemV2[]): ClipItemV2[] => {
    if (clips.length <= 1) return clips
    const sorted = [...clips].sort((a, b) => {
      const startA = clipStartSeconds(a)
      const startB = clipStartSeconds(b)
      if (startA == null && startB == null) return 0
      if (startA == null) return 1
      if (startB == null) return -1
      return startA - startB
    })

    const merged: ClipItemV2[] = []

    sorted.forEach(current => {
      const startSec = clipStartSeconds(current)
      const endSec = clipEndSeconds(current)
      const last = merged[merged.length - 1]

      if (last && startSec != null && endSec != null && endSec > startSec) {
        const lastStart = clipStartSeconds(last)
        const lastEnd = clipEndSeconds(last)
        if (lastStart != null && lastEnd != null && startSec <= lastEnd + 0.5) {
          const newStart = Math.min(lastStart, startSec)
          const newEnd = Math.max(lastEnd, endSec)
          const preferred = choosePreferredClip(last, current)

          last.startS = newStart
          last.startHMS = secondsToHms(newStart)
          last.endS = newEnd
          last.endHMS = secondsToHms(newEnd)
          last.excerpt = preferred.excerpt
          last.speaker = undefined
          last.score = preferred.score ?? last.score
          last.clipUrl = preferred.clipUrl ?? last.clipUrl
          last.url = preferred.url ?? last.url
          last.segmentId = preferred.segmentId ?? last.segmentId
          last.videoId = preferred.videoId ?? last.videoId
          last.thumbnailUrl = preferred.thumbnailUrl ?? last.thumbnailUrl
          last.documentType = preferred.documentType ?? last.documentType
          last.nodeType = preferred.nodeType ?? last.nodeType
          return
        }
      }

      merged.push({ ...current, speaker: undefined })
    })

    return merged
  }

  return entries.map(entry => {
    const entryRecord = entry as unknown as Record<string, unknown>
    const rawEntryChannelName =
      entry.channelName ??
      readString(entryRecord, 'channel_name') ??
      entry.channel
    const normalizedChannelName =
      applyNameAlias(rawEntryChannelName) ??
      rawEntryChannelName ??
      entry.channel

    const entryChannelId =
      entry.channelId ?? readString(entryRecord, 'channel_id')
    const entryVideoId =
      entry.videoId ??
      readString(entryRecord, 'video_id') ??
      readString(entryRecord, 'parent_id') ??
      readString(entryRecord, 'id')
    const entryParentId =
      entry.parentId ??
      readString(entryRecord, 'parent_id') ??
      readString(entryRecord, 'id')
    const entryUrlCandidate =
      toAbsoluteUrl(entry.url) ??
      toAbsoluteUrl(readString(entryRecord, 'url')) ??
      entry.url
    const entryExplicitThumbnail =
      toAbsoluteUrl(entry.thumbnailUrl) ??
      toAbsoluteUrl(readString(entryRecord, 'thumbnail_url')) ??
      toAbsoluteUrl(readString(entryRecord, 'thumbnail'))
    const entryThumbnail =
      entryExplicitThumbnail ??
      youtubeThumbnailFrom(entryUrlCandidate, entryVideoId)

    const entryPublishedAt =
      entry.publishedAt ??
      readString(entryRecord, 'published_at') ??
      readString(entryRecord, 'published_date') ??
      entry.date
    const entryPublishedDate =
      entry.publishedDate ??
      readString(entryRecord, 'published_date') ??
      entryPublishedAt ??
      entry.date

    const normalizedClips = entry.clips.map(clip => {
      const clipRecord = clip as unknown as Record<string, unknown>
      const rawClipChannelName =
        clip.channelName ??
        readString(clipRecord, 'channel_name') ??
        clip.channel
      const clipChannelName =
        applyNameAlias(rawClipChannelName) ??
        rawClipChannelName ??
        normalizedChannelName

      const clipChannelId =
        clip.channelId ?? readString(clipRecord, 'channel_id') ?? entryChannelId
      const clipVideoId =
        clip.videoId ?? readString(clipRecord, 'video_id') ?? entryVideoId
      const clipParentId =
        clip.parentId ??
        readString(clipRecord, 'parent_id') ??
        clipVideoId ??
        entryVideoId
      const clipClipUrl =
        clip.clipUrl ?? readString(clipRecord, 'clip_url') ?? clip.url
      const clipUrlCandidate =
        toAbsoluteUrl(clipClipUrl) ??
        toAbsoluteUrl(clip.url) ??
        entryUrlCandidate
      const clipExplicitThumbnail =
        toAbsoluteUrl(clip.thumbnailUrl) ??
        toAbsoluteUrl(readString(clipRecord, 'thumbnail_url')) ??
        toAbsoluteUrl(readString(clipRecord, 'thumbnail'))
      const clipThumbnail =
        clipExplicitThumbnail ??
        youtubeThumbnailFrom(clipUrlCandidate, clipVideoId ?? entryVideoId) ??
        entryThumbnail
      const clipPublishedAt =
        clip.publishedAt ??
        readString(clipRecord, 'published_at') ??
        readString(clipRecord, 'published_date') ??
        entryPublishedAt
      const clipPublishedDate =
        clip.publishedDate ??
        readString(clipRecord, 'published_date') ??
        clipPublishedAt ??
        clip.date

      return {
        ...clip,
        channel: clipChannelName,
        channelName: clipChannelName,
        channelId: clipChannelId,
        speaker: undefined,
        clipUrl: clipClipUrl,
        parentId: clipParentId,
        videoId: clipVideoId,
        publishedAt: clipPublishedAt ?? undefined,
        publishedDate: clipPublishedDate ?? undefined,
        thumbnailUrl: clipThumbnail
      }
    })

    const mergedClips = mergeOverlappingClips(normalizedClips)

    return {
      ...entry,
      channel: normalizedChannelName,
      channelName: normalizedChannelName,
      channelId: entryChannelId,
      videoId: entryVideoId,
      parentId: entryParentId ?? entryVideoId,
      publishedAt: entryPublishedAt ?? undefined,
      publishedDate: entryPublishedDate ?? undefined,
      date: entryPublishedAt ?? entry.date,
      clips: mergedClips,
      thumbnailUrl: entryThumbnail
    }
  })
}
