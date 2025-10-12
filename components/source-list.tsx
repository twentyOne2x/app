'use client'

import { useMemo, useCallback } from 'react'
import Image from 'next/image'
import { cn, formatDate } from '@/lib/utils'
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

function formatClipRange(clip: ClipItemV2): string | null {
  const startLabel =
    (clip.startHMS && clip.startHMS.trim()) ||
    (clip.startS != null ? secondsToHms(Math.max(0, clip.startS)) : null)
  const endLabel =
    (clip.endHMS && clip.endHMS.trim()) ||
    (clip.endS != null ? secondsToHms(Math.max(0, clip.endS)) : null)

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

function extractYouTubeThumbnail(
  rawUrl?: string,
  fallbackVideoId?: string | null
): { url: string | null; videoId: string | null } {
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      let videoId: string | null = null
      if (parsed.hostname.includes('youtu.be')) {
        videoId = parsed.pathname.replace('/', '').split('?')[0] || null
      } else if (parsed.hostname.includes('youtube.com')) {
        videoId = parsed.searchParams.get('v')
      }
      if (videoId) {
        return {
          url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          videoId
        }
      }
    } catch (error) {
      console.debug('source-list: failed to parse youtube URL', {
        rawUrl,
        error
      })
    }
  }

  if (fallbackVideoId) {
    return {
      url: `https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg`,
      videoId: fallbackVideoId
    }
  }

  return { url: null, videoId: null }
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
    <>
      <div className={cn('space-y-4', className)}>
        {parents.map((parent, idx) => {
          const key = `${parent.parentTitle ?? 'parent'}__${parent.channel ?? 'channel'}__${idx}`
          const clipCount = parent.clips?.length ?? 0
          const parentScoreText = parentScore(parent.scoreMax)
          const firstClip = parent.clips?.[0] ?? null
          const playbackForParent = firstClip
            ? buildClipPlayback(parent, firstClip)
            : undefined
          const primaryUrl =
            playbackForParent?.watchUrl ??
            parent.url ??
            firstClip?.url ??
            undefined
          const derivedParentThumb = extractYouTubeThumbnail(
            primaryUrl,
            parent.videoId ?? firstClip?.videoId
          )
          const parentThumbUrl = parent.thumbnailUrl ?? derivedParentThumb.url
          if (!parentThumbUrl) {
            console.debug('source-list: missing thumbnail for parent', {
              title: parent.parentTitle,
              channel: parent.channel,
              clipCount,
              primaryUrl,
              videoId:
                derivedParentThumb.videoId ??
                parent.videoId ??
                firstClip?.videoId ??
                null
            })
          }
          const rawPublished =
            parent.publishedAt ?? parent.publishedDate ?? parent.date
          const displayDate = rawPublished ? formatDate(rawPublished) : null
          const channelLabel = parent.channelName ?? parent.channel

          return (
            <div
              key={key}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-emerald-300/40 hover:bg-white/[0.12] hover:shadow-[0_0_12px_rgba(16,185,129,0.25)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="rounded-xl bg-black/80 px-3 py-1">
                  <div className="relative aspect-video w-full max-w-[320px] overflow-hidden rounded-lg border border-white/15 bg-black">
                    <div className="absolute inset-0">
                      {parentThumbUrl ? (
                        <Image
                          src={parentThumbUrl}
                          alt={`Thumbnail for ${parent.parentTitle}`}
                          fill
                          sizes="(max-width: 768px) 90vw, 320px"
                          className="object-cover"
                          priority={false}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                          No preview available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span>{channelLabel}</span>
                    {displayDate ? <span>· {displayDate}</span> : null}
                    {parentScoreText ? (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-emerald-200/80">
                        {parentScoreText}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="break-words text-base font-semibold text-zinc-100">
                    {parent.parentTitle}
                  </h3>
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                    {primaryUrl ? (
                      <a
                        href={primaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-white/10"
                      >
                        Open source
                      </a>
                    ) : null}
                    {clipCount > 0 ? (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                        {clipCount} clip{clipCount === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500">
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
                    const derivedClipThumb = extractYouTubeThumbnail(
                      clip.clipUrl ??
                        playback.watchUrl ??
                        clip.url ??
                        primaryUrl,
                      clip.videoId ?? parent.videoId
                    )
                    const clipThumbUrl =
                      clip.thumbnailUrl ?? derivedClipThumb.url
                    if (!clipThumbUrl) {
                      console.debug('source-list: missing clip thumbnail', {
                        parentTitle: parent.parentTitle,
                        clipTitle: clip.parentTitle,
                        clipUrl: clip.url,
                        playbackUrl: playback.watchUrl,
                        videoId:
                          derivedClipThumb.videoId ??
                          clip.videoId ??
                          parent.videoId ??
                          null
                      })
                    }
                    return (
                      <li
                        key={clipKey}
                        className={cn(
                          'group relative rounded-xl border border-white/10 bg-black/40 p-3 transition',
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
                                <span className="text-zinc-200/80 normal-case">
                                  {timestampLabel}
                                </span>
                              ) : null}
                            </div>
                            {clip.excerpt ? (
                              <p className="text-xs text-zinc-100">
                                {clip.excerpt}
                              </p>
                            ) : (
                              <p className="text-xs italic text-zinc-400">
                                No excerpt provided.
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 pointer-events-auto">
                              <button
                                type="button"
                                onClick={() =>
                                  handleClipSelect(parent, clip, 'play')
                                }
                                className="relative z-10 inline-flex items-center rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
                              >
                                Play clip
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleClipSelect(parent, clip, 'edit')
                                }
                                className="relative z-10 inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/10"
                              >
                                Edit clip
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCheckboxToggle(parent, clip)
                                }
                                className={cn(
                                  'relative z-10 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition',
                                  selected
                                    ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100'
                                    : 'border-white/20 bg-white/0 text-zinc-100 hover:bg-white/10'
                                )}
                              >
                                {selected ? 'Added to bundle' : 'Add to bundle'}
                              </button>
                              {clip.clipUrl || clip.url || primaryUrl ? (
                                <a
                                  href={
                                    clip.clipUrl ??
                                    playback.watchUrl ??
                                    clip.url ??
                                    primaryUrl ??
                                    '#'
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative z-10 inline-flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                                >
                                  Open source
                                </a>
                              ) : null}
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
    </>
  )
}

export default SourceList
