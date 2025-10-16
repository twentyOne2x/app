'use client'

import React, { useCallback } from 'react'
import { ClipBundleState, ClipBundleStatus } from '@/lib/hooks/use-clip-bundle'
import { cn, resolveClipStartSeconds, formatSecondsToHms } from '@/lib/utils'
import { toast } from 'react-hot-toast'
import { buildClipPlayback } from '@/components/clip-drawer'

interface ClipBundleDrawerProps {
  isOpen: boolean
  onClose: () => void
  state: ClipBundleState
  onRetryClip: (clipKey: string) => void
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return null
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)
  if (absSeconds < 60) return relativeFormatter.format(diffSeconds, 'second')
  const diffMinutes = Math.round(diffSeconds / 60)
  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 7) return relativeFormatter.format(diffDays, 'day')
  const diffWeeks = Math.round(diffDays / 7)
  if (Math.abs(diffWeeks) < 4) return relativeFormatter.format(diffWeeks, 'week')
  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) return relativeFormatter.format(diffMonths, 'month')
  const diffYears = Math.round(diffDays / 365)
  return relativeFormatter.format(diffYears, 'year')
}

const statusColors: Record<ClipBundleStatus, string> = {
  idle: 'bg-zinc-500/20 text-zinc-300',
  queued: 'bg-zinc-500/20 text-zinc-300',
  processing: 'bg-amber-400/15 text-amber-300',
  ready: 'bg-emerald-400/15 text-emerald-300',
  error: 'bg-rose-500/15 text-rose-300'
}

export function ClipBundleDrawer({ isOpen, onClose, state, onRetryClip }: ClipBundleDrawerProps) {
  const isBundleReady = state.status === 'ready' && Boolean(state.bundleDownloadUrl)
  const bundleStatusLabel =
    state.bundleStatus === 'idle' && state.status !== 'idle' ? state.status : state.bundleStatus
  const buildTimestampList = useCallback(() => {
    if (!state.items.length) return ''
    const lines = state.items.map((item) => {
      const playback = buildClipPlayback(item.selection.parent, item.selection.clip)
      const href = playback.watchUrl ?? item.selection.clip.url ?? item.selection.parent.url ?? ''
      const startSeconds = resolveClipStartSeconds(item.selection.clip)
      const label = startSeconds != null ? formatSecondsToHms(startSeconds) : 'unknown'
      const title = item.selection.parent.parentTitle ?? item.selection.clip.parentTitle ?? 'Clip'
      return `${title} — ${label} — ${href}`.trim()
    })
    return lines.filter(Boolean).join('\n')
  }, [state.items])
  const handleCopyTimestamps = useCallback(async () => {
    const payload = buildTimestampList()
    if (!payload) {
      toast('No clip timestamps available yet.')
      return
    }
    try {
      await navigator.clipboard.writeText(payload)
      toast.success('Copied clip timestamps to clipboard.')
    } catch (error) {
      console.error('clip-bundle: copy timestamps failed', error)
      toast.error('Unable to copy timestamps. Please try again.')
    }
  }, [buildTimestampList])

  const handleDownload = () => {
    if (!state.bundleDownloadUrl) return
    if (typeof window !== 'undefined') {
      window.open(state.bundleDownloadUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-[1200] flex justify-end',
        isOpen ? 'opacity-100' : 'opacity-0'
      )}
      aria-hidden={!isOpen}
    >
      <div
        className={cn(
          'size-full max-w-xl border-l border-white/10 bg-zinc-950 shadow-2xl transition-transform duration-300 ease-out md:w-[480px]',
          isOpen ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full'
        )}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-100">Bundle progress</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                  statusColors[bundleStatusLabel ?? 'idle']
                )}
              >
                {bundleStatusLabel}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {state.status === 'ready'
                ? 'All clips ready'
                : state.status === 'error'
                ? 'Some clips failed'
                : 'Processing clips in the background'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            Close
          </button>
        </header>

        {state.errorMessage ? (
          <div className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {state.errorMessage === 'not_implemented'
              ? 'Batch generation is not yet available. Please try again once the clip service ships this feature.'
              : 'An error occurred while generating the bundle.'}
          </div>
        ) : null}

        <section className="max-h-full space-y-3 overflow-y-auto p-4">
          {state.items.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-300">
              Select clips from the sources list and choose “Generate bundle” to track them here.
            </div>
          ) : (
            state.items.map((item) => (
              <article key={item.key} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-400">
                      {item.selection.parent.parentTitle}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-zinc-100">
                      {item.selection.clip.startHMS ?? item.selection.clip.startS ?? 'Start unknown'}{' '}
                      → {item.selection.clip.endHMS ?? item.selection.clip.endS ?? 'End unknown'}
                    </div>
                    {item.selection.clip.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-xs text-zinc-400">
                        {item.selection.clip.excerpt}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      statusColors[item.status]
                    )}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  {item.status === 'ready' && item.downloadUrl ? (
                    <a
                      href={item.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-emerald-400/30 px-2 py-1 text-emerald-200 hover:bg-emerald-400/10"
                    >
                      Download clip
                    </a>
                  ) : null}
                  {item.status === 'error' ? (
                    <button
                      type="button"
                      onClick={() => onRetryClip(item.key)}
                      className="rounded-md border border-white/20 px-2 py-1 text-zinc-200 hover:bg-white/10"
                    >
                      Retry
                    </button>
                  ) : null}
                  {item.progress != null && item.status === 'processing' ? (
                    <span>{Math.round(item.progress * 100)}%</span>
                  ) : null}
                  {item.errorMessage ? (
                    <span className="text-rose-300">{item.errorMessage}</span>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>

        <footer className="border-t border-white/10 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-zinc-400">
              {state.createdAt ? (
                <span>Started {formatRelativeTime(state.createdAt)}</span>
              ) : (
                <span>Bundle created when you start generating clips.</span>
              )}
              {state.completedAt ? (
                <span className="ml-2 text-emerald-300/80">
                  Completed {formatRelativeTime(state.completedAt)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!isBundleReady}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold text-black transition',
                  isBundleReady
                    ? 'bg-emerald-400 hover:bg-emerald-300'
                    : 'cursor-not-allowed bg-emerald-400/50 text-black/60'
                )}
              >
                Download ZIP
              </button>
              <button
                type="button"
                onClick={handleCopyTimestamps}
                className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
              >
                Copy clip timestamps
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-white/15 px-3 py-1 text-xs font-medium text-zinc-300/70"
                title="Sharing bundle links is coming soon"
              >
                Copy share link
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default ClipBundleDrawer
