'use client'

import Image from 'next/image'
import { cn, formatDate, parseYouTubeIdFromString, youtubeThumbFor } from '@/lib/utils'
import type { CatalogResultRow } from '@/lib/types'

export interface MetadataCatalogProps {
  results: CatalogResultRow[]
  className?: string
}

function formatDuration(seconds?: number | null): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function canonicalWatchUrl(row: CatalogResultRow): string | null {
  const url = (row.url || '').trim()
  if (url) return url
  const videoId = (row.video_id || '').trim()
  if (!videoId) return null
  // Only default to YouTube when the ID is *exactly* a YouTube video id.
  if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return `https://www.youtube.com/watch?v=${videoId}`
  }
  return null
}

function deriveThumbUrl(row: CatalogResultRow): string | null {
  const direct = (row.thumbnail_url || '').trim()
  if (direct) return direct
  const url = canonicalWatchUrl(row)
  const videoId = row.video_id || (url ? parseYouTubeIdFromString(url) : undefined) || undefined
  return youtubeThumbFor(url ?? undefined, videoId ?? undefined) ?? null
}

export default function MetadataCatalog({ results, className }: MetadataCatalogProps) {
  if (!Array.isArray(results) || results.length === 0) return null

  return (
    <div className={cn('space-y-3', className)} data-testid="catalog-results">
      {results.map((row, idx) => {
        const href = canonicalWatchUrl(row)
        const title = (row.title || row.video_id || 'Untitled').trim()
        const channel = (row.channel_name || '').trim()
        const published = (row.published_at || '').trim()
        const duration = formatDuration(row.duration_s)
        const thumb = deriveThumbUrl(row)

        const metaParts = [
          channel || null,
          published ? formatDate(published) : null,
          duration
        ].filter(Boolean) as string[]

        return (
          <a
            key={`${row.video_id || row.parent_id || idx}`}
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-emerald-300/40 hover:bg-white/[0.08]"
            data-testid="catalog-card"
            aria-label={`Open video ${title}`}
          >
            <div className="flex gap-3">
              <div className="relative h-[60px] w-[106px] flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="106px"
                    className="object-cover"
                    priority={idx === 0}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold text-zinc-100" data-testid="catalog-title">
                  {title}
                </div>
                {metaParts.length ? (
                  <div className="mt-1 text-xs text-zinc-300" data-testid="catalog-meta">
                    {metaParts.join(' | ')}
                  </div>
                ) : null}
              </div>
            </div>
          </a>
        )
      })}
    </div>
  )
}
