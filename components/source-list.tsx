'use client'

import { useMemo, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils'
import type { ClipPlayback } from '@/components/clip-drawer'
import { buildClipPlayback } from '@/components/clip-drawer'

export interface SourceListProps {
  entries: ParsedMetadataEntryV2[]
  className?: string
  onSelectClip?: (payload: {
    parent: ParsedMetadataEntryV2
    clip: ClipItemV2
    playback: ClipPlayback
  }) => void
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

export function SourceList({ entries, className, onSelectClip }: SourceListProps) {
  const parents = useMemo(() => entries ?? [], [entries])
  const [expandedParent, setExpandedParent] = useState<string | null>(null)
  const [hoveredParent, setHoveredParent] = useState<string | null>(null)

  const handleToggle = useCallback(
    (key: string) => {
      setExpandedParent((current) => (current === key ? null : key))
    },
    [setExpandedParent]
  )

  const handleClipSelect = useCallback(
    (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => {
      if (!onSelectClip) return
      const playback = buildClipPlayback(parent, clip)
      onSelectClip({ parent, clip, playback })
    },
    [onSelectClip]
  )

  if (!parents.length) return null

  return (
    <div className={cn('space-y-4', className)}>
      {parents.map((parent, idx) => {
        const key = `${parent.parentTitle}__${parent.channel}__${idx}`
        const isActive = expandedParent === key || hoveredParent === key
        const clipCount = parent.clips?.length ?? 0
        const parentScoreText = parentScore(parent.scoreMax)

        return (
          <div
            key={key}
            onMouseEnter={() => setHoveredParent(key)}
            onMouseLeave={() => setHoveredParent((current) => (current === key ? null : current))}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.07]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>{parent.channel}</span>
                  {parent.date ? <span>· {parent.date}</span> : null}
                  {parentScoreText ? (
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-emerald-200/80">
                      {parentScoreText}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 text-base font-semibold text-zinc-100 line-clamp-2">{parent.parentTitle}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => handleToggle(key)}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                  aria-expanded={isActive}
                >
                  {isActive ? 'Hide clips' : `See clips (${clipCount})`}
                </button>
              </div>
            </div>

            {isActive && clipCount > 0 ? (
              <ol className="mt-4 space-y-3">
                {parent.clips.map((clip, clipIdx) => {
                  const clipKey = `${key}__${clipIdx}`
                  const clipScore = formatScore(clip.score)

                  const playback = buildClipPlayback(parent, clip)

                  return (
                    <li
                      key={clipKey}
                      className="rounded-xl border border-white/10 bg-black/40 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-emerald-200/80">
                            {clipWindow(clip)}
                            {clipScore ? ` · ${clipScore}` : ''}
                            {clip.speaker ? ` · ${clip.speaker}` : ''}
                          </p>
                          {clip.excerpt ? (
                            <p className="mt-1 text-sm text-zinc-100 line-clamp-3">{clip.excerpt}</p>
                          ) : (
                            <p className="mt-1 text-sm text-zinc-300 line-clamp-3">
                              Click play to jump straight to this segment.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleClipSelect(parent, clip)}
                            className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-50 hover:bg-white/20"
                          >
                            Play
                          </button>
                          <a
                            href={playback.watchUrl ?? clip.url ?? parent.url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-white/10"
                          >
                            Open in new tab
                          </a>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled
                          className="cursor-not-allowed rounded-md border border-dashed border-white/20 px-3 py-1 text-xs font-medium text-zinc-400"
                          title="High quality clips will be available once the clip service ships"
                        >
                          Generate HQ (coming soon)
                        </button>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          Pad presets:
                          <div className="flex items-center gap-1">
                            {[-10, -5, 5, 10].map((pad) => (
                              <button
                                type="button"
                                key={`${clipKey}-pad-${pad}`}
                                disabled
                                className={cn(
                                  'cursor-not-allowed rounded border border-white/15 px-2 py-0.5',
                                  pad < 0 ? 'text-rose-300/80' : 'text-emerald-300/80'
                                )}
                              >
                                {pad > 0 ? `+${pad}s` : `${pad}s`}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded border border-white/15 px-2 py-0.5 text-zinc-300"
                            >
                              Custom…
                            </button>
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
