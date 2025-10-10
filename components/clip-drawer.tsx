'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { ClipItemV2, ParsedMetadataEntryV2 } from '@/lib/utils'

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
  const candidateUrl = ensureAbsoluteUrl(clip.url) ?? ensureAbsoluteUrl(parent.url)
  if (!candidateUrl) return {}

  const start = clip.startS ?? hmsToSeconds(clip.startHMS)
  const end = clip.endS ?? hmsToSeconds(clip.endHMS)

  let base: URL
  try {
    base = new URL(candidateUrl)
  } catch {
    return { watchUrl: candidateUrl, startSeconds: start, endSeconds: end }
  }

  if (base.hostname.includes('youtube.com') || base.hostname.includes('youtu.be')) {
    return buildYouTubeUrls(base, start, end)
  }
  return appendGenericTimestamp(base, start)
}

interface ClipDrawerProps {
  isOpen: boolean
  parent?: ParsedMetadataEntryV2
  clip?: ClipItemV2
  playback?: ClipPlayback
  onClose: () => void
}

export function ClipDrawer({ isOpen, parent, clip, playback, onClose }: ClipDrawerProps) {
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  if (!isOpen || !clip || !parent) return null

  const data = playback ?? buildClipPlayback(parent, clip)

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end pointer-events-none">
      <button
        type="button"
        className="pointer-events-auto flex-1 bg-black/50"
        aria-label="Close clip viewer"
        onClick={onClose}
      />
      <div className="pointer-events-auto w-full bg-zinc-950 border-t border-white/10 shadow-2xl">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Now playing</p>
              <h2 className="text-base font-semibold text-zinc-100">{clip.parentTitle || parent.parentTitle}</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {parent.channel}
                {parent.date ? ` · ${parent.date}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>

          <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            {data.embedUrl ? (
              <iframe
                title={`Clip from ${clip.parentTitle || parent.parentTitle}`}
                src={data.embedUrl}
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-300">
              {clip.startHMS ?? (clip.startS != null ? `Starts at ${Math.floor(clip.startS)}s` : 'Start unknown')}
              {clip.endHMS ? ` → ${clip.endHMS}` : clip.endS ? ` → ${Math.floor(clip.endS)}s` : ''}
              {clip.speaker ? ` · ${clip.speaker}` : ''}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={data.watchUrl ?? clip.url ?? parent.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-white/15 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-white/10"
              >
                Open on YouTube
              </a>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border border-white/15 px-3 py-1 text-xs font-medium text-zinc-400"
                title="Clip generation service coming soon"
              >
                Generate HQ (coming soon)
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pad presets</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[-10, -5, 5, 10].map((pad) => (
                <button
                  key={pad}
                  type="button"
                  disabled
                  className={cn(
                    'cursor-not-allowed rounded-md border border-white/10 px-2 py-1 text-xs',
                    pad < 0 ? 'text-rose-300/80' : 'text-emerald-300/80'
                  )}
                  title="Pad controls will be enabled once HQ clips are available"
                >
                  {pad > 0 ? `+${pad}s` : `${pad}s`}
                </button>
              ))}
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300"
              >
                Custom…
              </button>
            </div>
          </div>

          {clip.excerpt ? (
            <blockquote className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-zinc-200">
              {clip.excerpt}
            </blockquote>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ClipDrawer
