'use client'

import { useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils'
import type { ClipPlayback } from '@/components/clip-drawer'
import { buildClipPlayback } from '@/components/clip-drawer'
import {
  useClipSelection,
  type ClipSelectionHandle
} from '@/lib/hooks/use-clip-selection'
import { IconChevronUpDown } from '@/components/ui/icons'

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

function extractYouTubeThumbnail(url?: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    let videoId: string | null = null
    if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.replace('/', '') || null
    } else if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v')
    }
    if (!videoId) return null
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  } catch {
    return null
  }
}

export function SourceList({
  entries,
  className,
  onSelectClip,
  selectionScope,
  selection
}: SourceListProps) {
  const parents = useMemo(() => entries ?? [], [entries])
  const [expandedParent, setExpandedParent] = useState<string | null>(null)
  const [expandedClips, setExpandedClips] = useState<Record<string, boolean>>({})
  const fallbackSelection = useClipSelection(selectionScope ?? 'global')
  const selectionHandle = selection ?? fallbackSelection

  const handleToggle = useCallback((key: string) => {
    setExpandedParent((current) => {
      if (current === key) {
        setExpandedClips({})
        return null
      }
      setExpandedClips({})
      return key
    })
  }, [])

  const handleClipToggle = useCallback((clipKey: string) => {
    setExpandedClips((prev) => ({ ...prev, [clipKey]: !prev[clipKey] }))
  }, [])

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
          const isActive = expandedParent === key
          const clipCount = parent.clips?.length ?? 0
          const parentScoreText = parentScore(parent.scoreMax)
          const canToggle = clipCount > 0

          return (
            <div
              key={key}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.07]"
            >
              <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>{parent.channel}</span>
                    {parent.date ? <span>· {parent.date}</span> : null}
                    {parentScoreText ? (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-emerald-200/80">
                        {parentScoreText}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-base font-semibold text-zinc-100">{parent.parentTitle}</h3>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {parent.url ? (
                    <a
                      href={parent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-white/10"
                    >
                      Open source
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (canToggle ? handleToggle(key) : undefined)}
                    className={cn(
                      'rounded-full border border-white/15 px-3 py-1 text-xs font-semibold transition',
                      canToggle
                        ? 'text-zinc-100 hover:bg-white/10'
                        : 'cursor-not-allowed text-zinc-500 opacity-70'
                    )}
                    aria-expanded={isActive}
                    disabled={!canToggle}
                  >
                    {canToggle ? (isActive ? 'Hide clips' : `See clips (${clipCount})`) : 'No clips'}
                  </button>
                </div>
              </div>

              {isActive && clipCount > 0 ? (
                <ol className="mt-4 space-y-3">
                  {parent.clips.map((clip, clipIdx) => {
                    const clipKey = `${key}__${clipIdx}`
                    const clipScore = formatScore(clip.score)
                    const selected = selectionHandle.isSelected(parent, clip)
                    const playback = buildClipPlayback(parent, clip)
                    const thumbnailUrl = extractYouTubeThumbnail(clip.url ?? parent.url) ?? undefined
                    const isClipExpanded = Boolean(expandedClips[clipKey])

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
                        {selected ? (
                          <span className="absolute right-3 top-3 rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                            Selected
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-start gap-3">
                          <label
                            className={cn(
                              'shrink-0 cursor-pointer select-none rounded-md border border-transparent p-1 transition',
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
                          <button
                            type="button"
                            onClick={() => handleClipToggle(clipKey)}
                            className={cn(
                              'flex min-w-0 flex-1 items-stretch gap-3 rounded-lg border border-transparent px-2 py-1 text-left transition',
                              'hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50'
                            )}
                            aria-expanded={isClipExpanded}
                          >
                            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/60">
                              {thumbnailUrl ? (
                                <Image
                                  src={thumbnailUrl}
                                  alt={`Thumbnail for ${clip.parentTitle || parent.parentTitle}`}
                                  fill
                                  sizes="128px"
                                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                  priority={false}
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-400">
                                  No thumbnail
                                </div>
                              )}
                            </div>
                            <div className="flex flex-1 flex-col justify-center gap-1 pr-4">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200/80">
                                <span>{clipWindow(clip)}</span>
                                {clipScore ? (
                                  <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-100">
                                    {clipScore}
                                  </span>
                                ) : null}
                                {clip.speaker ? <span className="text-zinc-300">{clip.speaker}</span> : null}
                              </div>
                              {clip.excerpt ? (
                                <p className="line-clamp-2 text-sm text-zinc-100">{clip.excerpt}</p>
                              ) : (
                                <p className="text-xs text-zinc-400">Click to view clip details</p>
                              )}
                            </div>
                            <span
                              className={cn(
                                'mt-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-transform',
                                isClipExpanded ? 'rotate-180' : 'rotate-0'
                              )}
                              aria-hidden="true"
                            >
                              <IconChevronUpDown className="h-4 w-4" />
                            </span>
                          </button>
                          <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleClipSelect(parent, clip)}
                              className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-50 transition hover:bg-white/20"
                            >
                              Play
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCheckboxToggle(parent, clip)}
                              className={cn(
                                'rounded-md border px-3 py-1 text-xs font-medium transition',
                                selected
                                  ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                                  : 'border-white/20 text-zinc-100 hover:bg-white/10'
                              )}
                            >
                              {selected ? 'Remove' : 'Add to bundle'}
                            </button>
                          </div>
                        </div>
                        {isClipExpanded ? (
                          <div className="mt-3 rounded-lg border border-white/10 bg-black/60 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                              <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black sm:w-64">
                                <div className="relative pb-[56.25%]">
                                  {playback.embedUrl ? (
                                    <iframe
                                      title={`Preview for ${clip.parentTitle || parent.parentTitle}`}
                                      src={playback.embedUrl}
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                      allowFullScreen
                                      loading="lazy"
                                      className="absolute inset-0 h-full w-full"
                                    />
                                  ) : thumbnailUrl ? (
                                    <Image
                                      src={thumbnailUrl}
                                      alt={`Thumbnail for ${clip.parentTitle || parent.parentTitle}`}
                                      fill
                                      sizes="(max-width: 640px) 100vw, 256px"
                                      className="object-cover"
                                      priority={false}
                                    />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
                                      Preview unavailable
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0 flex-1 text-sm text-zinc-100">
                                {clip.excerpt ? (
                                  <p>{clip.excerpt}</p>
                                ) : (
                                  <p className="text-zinc-300">
                                    Click play to jump straight to this segment.
                                  </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                                  {clip.url ? (
                                    <a
                                      href={playback.watchUrl ?? clip.url ?? parent.url ?? '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded-md border border-white/20 px-3 py-1 font-medium text-zinc-100 transition hover:bg-white/10"
                                    >
                                      Open source
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => handleClipSelect(parent, clip)}
                                    className="rounded-md border border-white/20 px-3 py-1 font-medium text-zinc-100 transition hover:bg-white/10"
                                  >
                                    View details
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
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
