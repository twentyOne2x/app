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
  onSelectClip?: (payload: {
    parent: ParsedMetadataEntryV2
    clip: ClipItemV2
    playback: ClipPlayback
  }) => void
  selectionScope?: string
  selection?: ClipSelectionHandle
}

function secondsOrHms(startS?: number, startHMS?: string) {
  if (startHMS) return startHMS
  if (startS != null) return `t=${Math.floor(Math.max(0, startS))}s`
  return 'clip'
}

function clipWindow(clip: ClipItemV2) {
  const start = secondsOrHms(clip.startS, clip.startHMS)
  const end = clip.endHMS ?? (clip.endS != null ? `${Math.floor(clip.endS)}s` : null)
  return end ? `${start} → ${end}` : start
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

function extractYouTubeThumbnail(rawUrl?: string, fallbackVideoId?: string | null): { url: string | null; videoId: string | null } {
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
      console.debug('source-list: failed to parse youtube URL', { rawUrl, error })
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
    (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => {
      if (!onSelectClip) return
      const playback = buildClipPlayback(parent, clip)
      onSelectClip({ parent, clip, playback })
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
          const playbackForParent = firstClip ? buildClipPlayback(parent, firstClip) : undefined
          const primaryUrl = playbackForParent?.watchUrl ?? parent.url ?? firstClip?.url ?? undefined
          const parentThumb = extractYouTubeThumbnail(primaryUrl, parent.videoId ?? firstClip?.videoId)
          if (!parentThumb.url) {
            console.debug('source-list: missing thumbnail for parent', {
              title: parent.parentTitle,
              channel: parent.channel,
              clipCount,
              primaryUrl,
              videoId: parentThumb.videoId
            })
          }
          const rawPublished = parent.publishedAt ?? parent.publishedDate ?? parent.date
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
                      {parentThumb.url ? (
                        <Image
                          src={parentThumb.url}
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
                  <h3 className="break-words text-base font-semibold text-zinc-100">{parent.parentTitle}</h3>
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
                    const clipThumb = extractYouTubeThumbnail(
                      clip.clipUrl ?? playback.watchUrl ?? clip.url ?? primaryUrl,
                      clip.videoId ?? parent.videoId
                    )
                    if (!clipThumb.url) {
                      console.debug('source-list: missing clip thumbnail', {
                        parentTitle: parent.parentTitle,
                        clipTitle: clip.parentTitle,
                        clipUrl: clip.url,
                        playbackUrl: playback.watchUrl,
                        videoId: clipThumb.videoId
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
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
                          <label
                            className={cn(
                              'inline-flex shrink-0 cursor-pointer select-none rounded-md border border-transparent p-1 transition',
                              selected ? 'border-emerald-400/30 bg-emerald-400/20' : 'border-transparent'
                            )}
                            title={selected ? 'Remove clip from bundle' : 'Add clip to bundle'}
                          >
                            <input
                              type="checkbox"
                              className="size-4 rounded border-zinc-600 bg-transparent text-emerald-400 opacity-60 transition focus:opacity-100 focus:ring-emerald-400 group-hover:opacity-100"
                              checked={selected}
                              onChange={() => handleCheckboxToggle(parent, clip)}
                              aria-label={selected ? 'Deselect clip' : 'Select clip for bundling'}
                            />
                          </label>
                          <div className="flex min-w-0 flex-1 flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200/80">
                              <span className="font-medium text-zinc-100">{clipWindow(clip)}</span>
                              {clipScore ? (
                                <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-100">
                                  {clipScore}
                                </span>
                              ) : null}
                            </div>
                            {clip.excerpt ? (
                              <p className="text-sm text-zinc-100">{clip.excerpt}</p>
                            ) : (
                              <p className="text-xs italic text-zinc-400">No excerpt provided.</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                              {clip.clipUrl || clip.url ? (
                                <a
                                  href={clip.clipUrl ?? playback.watchUrl ?? clip.url ?? primaryUrl ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative z-10 rounded-md border border-white/20 px-3 py-1 font-medium text-zinc-100 transition hover:bg-white/10"
                                >
                                  Open clip
                                </a>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleClipSelect(parent, clip)}
                                className="relative z-10 rounded-md border border-white/20 px-3 py-1 font-medium text-zinc-100 transition hover:bg-white/10"
                              >
                                Open clip editor
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClipSelect(parent, clip)}
                                className="relative z-10 rounded-md border border-white/20 px-3 py-1 font-medium text-zinc-100 transition hover:bg-white/10"
                              >
                                Play
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCheckboxToggle(parent, clip)}
                                className={cn(
                                  'relative z-10 rounded-md border px-3 py-1 text-xs font-medium transition',
                                  selected
                                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                                    : 'border-white/20 text-zinc-100 hover:bg-white/10'
                                )}
                              >
                                {selected ? 'Remove from bundle' : 'Add to bundle'}
                              </button>
                              {selected ? (
                                <span className="ml-auto rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                                  Selected
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
