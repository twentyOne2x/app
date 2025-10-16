'use client'

import { ChangeEvent, useCallback, useEffect, useMemo } from 'react'
import { useClipGeneration } from '@/lib/hooks/use-clip-generation'
import { useClipPadding } from '@/lib/hooks/use-clip-padding'
import { cn, sanitizeClipExcerptText } from '@/lib/utils'
import type { ClipItemV2, ParsedMetadataEntryV2 } from '@/lib/utils'
import { toast } from 'react-hot-toast'

export interface ClipPlayback {
  embedUrl?: string
  watchUrl?: string
  startSeconds?: number
  endSeconds?: number
  platform?: 'youtube' | 'generic'
}

function hmsToSeconds(hms?: string): number | undefined {
  if (!hms) return undefined
  const parts = hms.split(':').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

function ensureAbsoluteUrl(candidate?: string): string | undefined {
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.toString()
  } catch {
    return undefined
  }
}

function buildYouTubeUrls(base: URL, start?: number, end?: number): ClipPlayback {
  const videoId =
    base.hostname.includes('youtu.be')
      ? base.pathname.replace('/', '')
      : base.searchParams.get('v')

  if (!videoId) {
    return { watchUrl: base.toString(), startSeconds: start, endSeconds: end, platform: 'generic' }
  }

  const watch = new URL(`https://www.youtube.com/watch?v=${videoId}`)
  if (start != null) watch.searchParams.set('t', `${Math.max(0, Math.floor(start))}s`)

  const embed = new URL(`https://www.youtube.com/embed/${videoId}`)
  if (start != null) embed.searchParams.set('start', String(Math.max(0, Math.floor(start))))
  if (end != null && end > (start ?? 0)) embed.searchParams.set('end', String(Math.floor(end)))
  embed.searchParams.set('autoplay', '1')
  embed.searchParams.set('mute', '0')

  return {
    watchUrl: watch.toString(),
    embedUrl: embed.toString(),
    startSeconds: start,
    endSeconds: end,
    platform: 'youtube'
  }
}

function appendGenericTimestamp(base: URL, start?: number): ClipPlayback {
  if (start != null) {
    base.searchParams.set('start', String(Math.max(0, Math.floor(start))))
  }
  return {
    watchUrl: base.toString(),
    startSeconds: start,
    platform: 'generic'
  }
}

export function buildClipPlayback(parent: ParsedMetadataEntryV2, clip: ClipItemV2): ClipPlayback {
  const rawStart = clip.startS ?? hmsToSeconds(clip.startHMS)
  const start = rawStart != null ? Math.max(0, rawStart) : undefined
  const endRaw = clip.endS ?? hmsToSeconds(clip.endHMS)
  const end = endRaw != null ? Math.max(0, endRaw) : undefined

  const candidateUrl =
    ensureAbsoluteUrl(clip.clipUrl) ??
    ensureAbsoluteUrl(clip.url) ??
    ensureAbsoluteUrl(parent.url)

  if (candidateUrl) {
    try {
      const base = new URL(candidateUrl)
      if (base.hostname.includes('youtube.com') || base.hostname.includes('youtu.be')) {
        return buildYouTubeUrls(base, start, end)
      }
      return appendGenericTimestamp(base, start)
    } catch {
      return { watchUrl: candidateUrl, startSeconds: start, endSeconds: end }
    }
  }

  const videoId = clip.videoId ?? parent.videoId
  if (videoId) {
    const fallbackBase = new URL(`https://www.youtube.com/watch?v=${videoId}`)
    return buildYouTubeUrls(fallbackBase, start, end)
  }

  if (parent.url) {
    try {
      const base = new URL(parent.url)
      return appendGenericTimestamp(base, start)
    } catch {
      return { watchUrl: parent.url, startSeconds: start, endSeconds: end }
    }
  }

  return {}
}

interface ClipDrawerProps {
  isOpen: boolean
  parent?: ParsedMetadataEntryV2
  clip?: ClipItemV2
  playback?: ClipPlayback
  intent?: 'play' | 'edit'
  onClose: () => void
}

export function ClipDrawer({
  isOpen,
  parent,
  clip,
  playback,
  intent = 'play',
  onClose
}: ClipDrawerProps) {
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const {
    settings,
    setMode,
    setSmartPadSeconds,
    setPadBeforeSeconds,
    setPadAfterSeconds,
    adjustPadBefore,
    adjustPadAfter,
    reset: resetPadding
  } = useClipPadding(parent, clip)

  const handleSmartPadChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSmartPadSeconds(Number(event.target.value) || 0)
    },
    [setSmartPadSeconds]
  )

  const handlePadBeforeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPadBeforeSeconds(Number(event.target.value) || 0)
    },
    [setPadBeforeSeconds]
  )

  const handlePadAfterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPadAfterSeconds(Number(event.target.value) || 0)
    },
    [setPadAfterSeconds]
  )

  const handleResetToManualDefault = useCallback(() => {
    setMode('manual')
    setPadBeforeSeconds(5)
    setPadAfterSeconds(5)
  }, [setMode, setPadAfterSeconds, setPadBeforeSeconds])

  const handleResetAll = useCallback(() => {
    resetPadding()
  }, [resetPadding])

  const {
    status: generationStatus,
    isGenerating,
    isReady,
    streamUrl,
    downloadUrl,
    error: generationError,
    generate
  } = useClipGeneration(parent, clip, settings)

  const handleGenerate = useCallback(async () => {
    try {
      await generate()
      toast.success('High-quality clip requested. We will let you know when it is ready.')
    } catch (error) {
      console.error('clip-drawer: failed to queue HQ clip', error)
      toast.error('Unable to queue a high-quality clip. Please adjust the timestamps or try another source.')
    }
  }, [generate])

  if (!isOpen || !clip || !parent) return null

  const data = playback ?? buildClipPlayback(parent, clip)
  const clipIntent = intent ?? 'play'
  const shouldAutoplay = clipIntent === 'play'
  const isSmart = settings.mode === 'smart'
  const smartPresets = [0, 5, 10, 15]
  const startSecondsRaw = clip.startS ?? hmsToSeconds(clip.startHMS)
  const endSecondsRaw = clip.endS ?? hmsToSeconds(clip.endHMS)
  const startSeconds = startSecondsRaw != null ? Math.max(0, startSecondsRaw) : undefined
  const endSeconds = endSecondsRaw != null ? Math.max(0, endSecondsRaw) : undefined
  const hasBoundaries = typeof startSeconds === 'number' && typeof endSeconds === 'number' && endSeconds > startSeconds
  const cannotGenerateReason = !hasBoundaries ? 'Clip timestamps are unavailable — generation disabled' : undefined
  const showHqVideo = isReady && Boolean(streamUrl)
  const showYouTubeEmbed = !showHqVideo && Boolean(data.embedUrl)
  const buttonLabel = isGenerating
    ? generationStatus === 'queued'
      ? 'Queued…'
      : 'Processing…'
    : isReady
      ? 'Regenerate high-quality clip'
      : 'Generate high-quality clip'

  const embedSrc = (() => {
    if (!data.embedUrl) return undefined
    try {
      const url = new URL(data.embedUrl)
      url.searchParams.set('autoplay', shouldAutoplay ? '1' : '0')
      return url.toString()
    } catch {
      return data.embedUrl
    }
  })()

  return (
    <div className="pointer-events-none fixed inset-0 z-[1200] flex flex-col justify-end">
      <button
        type="button"
        className="pointer-events-auto flex-1 bg-black/50"
        aria-label="Close clip viewer"
        onClick={onClose}
      />
      <div className="pointer-events-auto w-full border-t border-white/20 bg-zinc-950/90 text-zinc-100 shadow-[0_-24px_48px_rgba(15,23,42,0.4)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Now playing</p>
              <h2 className="text-lg font-semibold leading-tight text-white sm:text-xl">
                {clip.parentTitle || parent.parentTitle}
              </h2>
              <p className="text-sm text-zinc-300">
                <span className="font-medium text-emerald-200">{parent.channel}</span>
                {parent.date ? <span className="text-zinc-500"> · {parent.date}</span> : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>

          <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-black">
            {showHqVideo ? (
              <video
                key={streamUrl}
                controls
                preload="metadata"
                autoPlay={shouldAutoplay}
                className="h-64 w-full bg-black sm:h-80"
              >
                <source src={streamUrl ?? ''} />
                Your browser does not support inline playback for the generated clip.
              </video>
            ) : showYouTubeEmbed ? (
              <iframe
                title={`Clip from ${clip.parentTitle || parent.parentTitle}`}
                src={embedSrc ?? data.embedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-64 w-full sm:h-80"
                loading="lazy"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center bg-zinc-900 text-sm text-zinc-400 sm:h-80">
                Inline playback is available for YouTube links. Use the external link below to view this clip.
              </div>
            )}
            {isGenerating ? (
              <div className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-zinc-100">
                {generationStatus === 'queued' ? 'Queued' : 'Processing'}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-300">
              {clip.startHMS ?? (clip.startS != null ? `Starts at ${Math.floor(clip.startS)}s` : 'Start unknown')}
              {clip.endHMS ? ` → ${clip.endHMS}` : clip.endS ? ` → ${Math.floor(clip.endS)}s` : ''}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={data.watchUrl ?? clip.url ?? parent.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20"
                data-testid="open-youtube"
              >
                Open on YouTube
              </a>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/30"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download HQ
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!hasBoundaries || isGenerating}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs font-medium shadow-sm transition',
                  !hasBoundaries
                    ? 'cursor-not-allowed border-zinc-700 bg-zinc-800 text-zinc-500'
                    : isReady
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-400/30'
                      : 'border-white/20 bg-emerald-400/20 text-white hover:bg-emerald-400/30',
                  isGenerating && 'cursor-progress opacity-70'
                )}
                title={cannotGenerateReason}
                data-testid="generate-hq"
              >
                {buttonLabel}
              </button>
            </div>
          </div>

          {generationError ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700">
              {generationError}
            </div>
          ) : null}

          {!hasBoundaries ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-100 p-3 text-xs text-amber-900">
              The structured metadata for this clip is missing start/end timestamps. HQ clips require timestamps, so this
              request is disabled until the source data includes them.
            </div>
          ) : null}

          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context padding</div>
                <p className="mt-1 text-xs text-zinc-500">
                  Choose how much extra audio to include before and after the selected segment.
                </p>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 bg-white">
                <button
                  type="button"
                  onClick={() => setMode('smart')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium transition',
                    isSmart ? 'bg-zinc-900 text-white' : 'bg-transparent text-zinc-600 hover:bg-zinc-100'
                  )}
                  aria-pressed={isSmart}
                >
                  Smart context
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium transition',
                    !isSmart ? 'bg-zinc-900 text-white' : 'bg-transparent text-zinc-600 hover:bg-zinc-100'
                  )}
                  aria-pressed={!isSmart}
                >
                  Manual padding
                </button>
              </div>
            </div>

            {isSmart ? (
              <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-white p-3">
                <p className="text-sm text-zinc-700">
                  We&apos;ll request transcript-aware boundaries plus{' '}
                  <span className="font-semibold text-zinc-900">{settings.smartPadSeconds}s</span> of buffer on each side.
                </p>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick presets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {smartPresets.map((pad) => {
                      const isActive = settings.smartPadSeconds === pad
                      return (
                        <button
                          key={pad}
                          type="button"
                          onClick={() => setSmartPadSeconds(pad)}
                          className={cn(
                            'rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium transition',
                            isActive ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                          )}
                        >
                          {pad === 0 ? 'No buffer' : `±${pad}s`}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="flex max-w-xs items-center gap-3 text-sm text-zinc-600">
                  Custom
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={settings.smartPadSeconds}
                    onChange={handleSmartPadChange}
                    className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1 text-right text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-0"
                    aria-label="Custom smart padding in seconds"
                  />
                  <span className="text-xs text-zinc-500">seconds</span>
                </label>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pad before</div>
                    <p className="mt-1 text-xs text-zinc-500">Add extra lead-in ahead of the clip.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustPadBefore(-5)}
                        disabled={settings.padBeforeSeconds === 0}
                        className={cn(
                          'rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium transition',
                          settings.padBeforeSeconds === 0
                            ? 'cursor-not-allowed text-zinc-400'
                            : 'text-zinc-600 hover:bg-zinc-100'
                        )}
                      >
                        −5s
                      </button>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={settings.padBeforeSeconds}
                        onChange={handlePadBeforeChange}
                        className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-0"
                        aria-label="Pad before in seconds"
                      />
                      <button
                        type="button"
                        onClick={() => adjustPadBefore(5)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
                      >
                        +5s
                      </button>
                    </div>
                  </div>
                  <div className="rounded-md border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pad after</div>
                    <p className="mt-1 text-xs text-zinc-500">Keep trailing context after the clip.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustPadAfter(-5)}
                        disabled={settings.padAfterSeconds === 0}
                        className={cn(
                          'rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium transition',
                          settings.padAfterSeconds === 0
                            ? 'cursor-not-allowed text-zinc-400'
                            : 'text-zinc-600 hover:bg-zinc-100'
                        )}
                      >
                        −5s
                      </button>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={settings.padAfterSeconds}
                        onChange={handlePadAfterChange}
                        className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-0"
                        aria-label="Pad after in seconds"
                      />
                      <button
                        type="button"
                        onClick={() => adjustPadAfter(5)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
                      >
                        +5s
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleResetToManualDefault}
                    className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
                  >
                    Reset to 5s / 5s
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-rose-600 transition hover:bg-zinc-100"
                  >
                    Clear saved preference
                  </button>
                </div>
              </div>
            )}
          </div>

          {clip.excerpt ? (
            <blockquote className="rounded-lg border border-zinc-200 bg-white/90 p-3 text-sm text-zinc-700 shadow-inner" data-testid="clip-excerpt">
              {sanitizeClipExcerptText(clip.excerpt)}
            </blockquote>
          ) : (
            <blockquote className="rounded-lg border border-dashed border-zinc-300 bg-white/40 p-3 text-sm italic text-zinc-500" data-testid="clip-excerpt-empty">
              No excerpt provided for this clip.
            </blockquote>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClipDrawer
