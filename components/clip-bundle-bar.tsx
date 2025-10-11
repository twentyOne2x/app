'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { ClipSelectionEntry } from '@/lib/hooks/use-clip-selection'

function selectionChipLabel(entry: ClipSelectionEntry) {
  const title = entry.parent.parentTitle ?? 'Clip'
  const start =
    entry.clip.startHMS ??
    (entry.clip.startS != null ? `${Math.max(0, Math.round(entry.clip.startS))}s` : null)
  return start ? `${title} • ${start}` : title
}

interface ClipBundleBarProps {
  selectionCount: number
  entries: ClipSelectionEntry[]
  onGenerate: () => void
  onClear: () => void
  disabled?: boolean
  isRunning?: boolean
}

export function ClipBundleBar({
  selectionCount,
  entries,
  onGenerate,
  onClear,
  disabled = false,
  isRunning = false
}: ClipBundleBarProps) {
  if (selectionCount === 0) return null

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-30 max-w-sm rounded-2xl border border-emerald-300/40 bg-black/70 p-4 text-sm text-zinc-100 shadow-[0_20px_45px_-25px_rgba(16,185,129,0.5)] backdrop-blur md:bottom-8 md:right-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-emerald-200/70">
            Bundle selection
          </div>
          <div className="font-semibold text-zinc-50">
            {selectionCount} clip{selectionCount === 1 ? '' : 's'} selected
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            {entries.slice(0, 3).map((entry) => (
              <span
                key={entry.key}
                className="truncate rounded-full border border-white/15 px-2 py-0.5"
                title={selectionChipLabel(entry)}
              >
                {selectionChipLabel(entry)}
              </span>
            ))}
            {selectionCount > 3 ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">
                +{selectionCount - 3} more
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled || isRunning}
            className={cn(
              'rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-400/60 disabled:text-black/70'
            )}
          >
            {isRunning ? 'Generating…' : 'Generate bundle'}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClipBundleBar
