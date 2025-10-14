'use client'

import {
  useMemo,
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
  type SyntheticEvent
} from 'react'
import Image from 'next/image'
import {
  cn,
  formatDate,
  sanitizeClipExcerptText,
  resolveVideoId,
  buildCanonicalClipLink
} from '@/lib/utils'
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils'
import type { ClipPlayback } from '@/components/clip-drawer'
import { buildClipPlayback } from '@/components/clip-drawer'
import {
  useClipSelection,
  type ClipSelectionHandle
} from '@/lib/hooks/use-clip-selection'

export interface SourceListProps {
  entries: ParsedMetadataEntryV2[]
  className?: string
  onSelectClip?: (
    payload: {
      parent: ParsedMetadataEntryV2
      clip: ClipItemV2
      playback: ClipPlayback
    },
    intent: 'play' | 'edit'
  ) => void
  selectionScope?: string
  selection?: ClipSelectionHandle
}

const YOUTUBE_THUMB_VARIANTS = [
  'maxresdefault.jpg',
  'hq720.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
  'mqdefault.jpg',
  'default.jpg',
  '0.jpg',
  '1.jpg',
  '2.jpg',
  '3.jpg'
] as const

const YOUTUBE_THUMB_HOSTS: Array<(id: string, variant: string) => string> = [
  (id, variant) => `https://i.ytimg.com/vi/${id}/${variant}`,
  (id, variant) => `https://img.youtube.com/vi/${id}/${variant}`
]

function buildThumbnailCandidates(options: {
  direct?: string | null
  videoId?: string | null
  fallback?: string
}) {
  const { direct, videoId, fallback } = options
  const seen = new Set<string>()
  const push = (value?: string | null) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
  }

  push(direct)

  const resolvedId = videoId?.trim()
  if (resolvedId) {
    for (const variant of YOUTUBE_THUMB_VARIANTS) {
      for (const host of YOUTUBE_THUMB_HOSTS) {
        push(host(resolvedId, variant))
      }
    }
  }

  push(fallback ?? '/default-thumbnail.svg')

  return Array.from(seen)
}

interface FallbackImageProps
  extends Omit<ComponentProps<typeof Image>, 'src'> {
  sources: Array<string | null | undefined>
}

function FallbackImage({
  sources,
  alt,
  onError,
  ...rest
}: FallbackImageProps) {
  const serializedSources = useMemo(() => {
    return JSON.stringify(
      (sources ?? []).map((value) =>
        typeof value === 'string' ? value.trim() : ''
      )
    )
  }, [sources])

  const normalizedSources = useMemo(() => {
    const seen = new Set<string>()
    const deduped: string[] = []

    let parsed: string[] = []
    try {
      const raw = JSON.parse(serializedSources)
      if (Array.isArray(raw)) {
        parsed = raw.filter((value) => typeof value === 'string') as string[]
      }
    } catch {
      parsed = []
    }

    for (const candidate of parsed) {
      const trimmed = candidate.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      deduped.push(trimmed)
    }

    if (!deduped.length) {
      deduped.push('/default-thumbnail.svg')
    }

    return deduped
  }, [serializedSources])

  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [serializedSources])

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement, Event>) => {
      onError?.(event)
      setIndex((current) => {
        const next = current + 1
        return next < normalizedSources.length ? next : current
      })
    },
    [normalizedSources, onError]
  )

  const activeSrc =
    normalizedSources[Math.min(index, normalizedSources.length - 1)]

  if (!activeSrc) {
    return null
  }

  return (
    <Image
      {...rest}
      alt={alt}
      src={activeSrc}
      onError={handleError}
    />
  )
}

function secondsToHms(seconds: number): string {
  const totalMillis = Math.round(seconds * 1000)
  const hours = Math.floor(totalMillis / 3600000)
  const minutes = Math.floor((totalMillis % 3600000) / 60000)
  const secs = Math.floor((totalMillis % 60000) / 1000)
  const millis = totalMillis % 1000
  const parts = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ]
  const base = parts.join(':')
  return millis ? `${base}.${millis.toString().padStart(3, '0')}` : base
}

function parseHmsToSeconds(hms?: string): number | null {
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

const normalizeHmsLabel = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes('-1:-1:-1')) return null
  if (/^[-]+/.test(trimmed)) return null
  return trimmed
}

function formatClipRange(clip: ClipItemV2): string | null {
  const startLabel =
    normalizeHmsLabel(clip.startHMS) ||
    (clip.startS != null && clip.startS >= 0
      ? secondsToHms(Math.max(0, clip.startS))
      : null)
  const endLabel =
    normalizeHmsLabel(clip.endHMS) ||
    (clip.endS != null && clip.endS >= 0
      ? secondsToHms(Math.max(0, clip.endS))
      : null)

  if (!startLabel && !endLabel) return null
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`
  return startLabel ?? endLabel
}

function formatScore(score?: number) {
  if (score == null) return null
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100)
  return `${pct}/100`
}

function parentScore(scoreMax?: number) {
  if (scoreMax == null) return null
  const pct = Math.round(Math.max(0, Math.min(1, scoreMax)) * 100)
  return `${pct}% match`
}

export function SourceList({
  entries,
  className,
  onSelectClip,
  selectionScope,
  selection
}: SourceListProps) {
  const parents = useMemo(() => entries ?? [], [entries])
  const fallbackSelection = useClipSelection(selectionScope ?? 'global')
  const selectionHandle = selection ?? fallbackSelection

  const handleClipSelect = useCallback(
    (
      parent: ParsedMetadataEntryV2,
      clip: ClipItemV2,
      intent: 'play' | 'edit' = 'play'
    ) => {
      if (!onSelectClip) return
      const playback = buildClipPlayback(parent, clip)
      onSelectClip({ parent, clip, playback }, intent)
    },
    [onSelectClip]
  )

  const handleCheckboxToggle = useCallback(
    (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => {
      selectionHandle.toggleClip(parent, clip)
    },
    [selectionHandle]
  )

  if (!parents.length) return null

  return (
    <div className={cn('space-y-4', className)}>
      {parents.map((parent, idx) => {
        const key = `${parent.parentTitle ?? 'parent'}__${parent.channel ?? 'channel'}__${idx}`
        const clipCount = parent.clips?.length ?? 0
        const parentScoreText = parentScore(parent.scoreMax)

        const firstClip = parent.clips?.[0] ?? null
        const firstClipPlayback = firstClip ? buildClipPlayback(parent, firstClip) : null
        const topClipHref =
          (firstClip ? buildCanonicalClipLink(firstClip, parent) : undefined) ??
          firstClipPlayback?.watchUrl ??
          firstClip?.clipUrl ??
          firstClip?.url ??
          parent.url ??
          (parent.videoId ? `https://www.youtube.com/watch?v=${parent.videoId}` : undefined)
        const parentThumbSources = buildThumbnailCandidates({
          direct: parent.thumbnailUrl,
          videoId: resolveVideoId(parent, firstClip ?? undefined),
          fallback: '/default-thumbnail.svg'
        })

        const rawPublished =
          parent.publishedAt ?? parent.publishedDate ?? parent.date
        const displayDate = rawPublished ? formatDate(rawPublished) : null
        const channelLabel = parent.channelName ?? parent.channel

        return (
          <div
            key={key}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-emerald-300/40 hover:bg-white/[0.12] hover:shadow-[0_0_12px_rgba(16,185,129,0.25)]"
          >
            <div className="space-y-4">
              <div className="mx-auto w-full max-w-[320px] rounded-xl bg-black/80 p-2 sm:max-w-[360px]">
                {topClipHref ? (
                  <a
                    href={topClipHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block cursor-pointer"
                    aria-label={`Open top clip for ${parent.parentTitle}`}
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-emerald-300/20 bg-black transition-shadow group-hover:border-emerald-300/40 group-hover:shadow-[0_0_0_2px_rgba(16,185,129,0.25)]">
                      <div className="absolute inset-0">
                        <FallbackImage
                          sources={parentThumbSources}
                          alt={`Thumbnail for ${parent.parentTitle}`}
                          fill
                          sizes="100vw"
                          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          priority={false}
                        />
                      </div>
                    </div>
                  </a>
                ) : (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/15 bg-black">
                    <div className="absolute inset-0">
                      <FallbackImage
                        sources={parentThumbSources}
                        alt={`Thumbnail for ${parent.parentTitle}`}
                        fill
                        sizes="100vw"
                        className="object-cover"
                        priority={false}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2 text-left">
                <h3 className="break-words text-lg font-semibold text-zinc-100">
                  {parent.parentTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                  {channelLabel ? (
                    <span className="font-medium text-zinc-200">{channelLabel}</span>
                  ) : null}
                  {displayDate ? <span className="text-zinc-400">{displayDate}</span> : null}
                  {parentScoreText ? (
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-200/80">
                      {parentScoreText}
                    </span>
                  ) : null}
                  {clipCount > 0 ? (
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-zinc-200">
                      {clipCount} clip{clipCount === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-zinc-500">
                      No clips available
                    </span>
                  )}
                </div>
              </div>
            </div>

            {clipCount > 0 ? (
              <ol className="mt-4 space-y-3">
                {parent.clips.map((clip, clipIdx) => {
                  const clipKey = `${key}__${clipIdx}`
                  const clipScore = formatScore(clip.score)
                  const selected = selectionHandle.isSelected(parent, clip)
                  const playback = buildClipPlayback(parent, clip)
                  const timestampLabel = formatClipRange(clip)

                  const clipThumbSources = buildThumbnailCandidates({
                    direct: clip.thumbnailUrl,
                    videoId: resolveVideoId(parent, clip),
                    fallback: '/default-thumbnail.svg'
                  })
                  const clipThumbUrl = clipThumbSources[0]

                  return (
                    <li
                      key={clipKey}
                      className={cn(
                        'relative isolate rounded-xl border border-white/10 bg-black/40 p-3 transition',
                        selected
                          ? 'border-emerald-300/60 bg-emerald-300/10 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
                          : ''
                      )}
                      data-thumbnail={clipThumbUrl ?? undefined}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-emerald-200/80">
                            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100/90">
                              clip
                            </span>
                            {clipScore ? (
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-100">
                                {clipScore}
                              </span>
                            ) : null}
                            {timestampLabel ? (
                              <span className="normal-case text-zinc-200/80">
                                {timestampLabel}
                              </span>
                            ) : null}
                          </div>
                          {clip.excerpt ? (
                            <p className="text-xs text-zinc-100">
                              {sanitizeClipExcerptText(clip.excerpt)}
                            </p>
                          ) : (
                            <p className="text-xs italic text-zinc-400">
                              No excerpt provided.
                            </p>
                          )}
                          <div className="relative z-50 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleClipSelect(parent, clip, 'edit')
                              }}
                              className="inline-flex cursor-pointer items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/10"
                            >
                              Edit clip
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleCheckboxToggle(parent, clip)
                              }}
                              className={cn(
                                'inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-semibold transition',
                                selected
                                  ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100'
                                  : 'border-white/20 bg-white/0 text-zinc-100 hover:bg-white/10'
                              )}
                            >
                                {selected ? 'Added to bundle' : 'Add to bundle'}
                              </button>
                            {selected ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                                In bundle
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default SourceList
