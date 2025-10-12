// components/source-list-inline.tsx
'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils'
import Image from 'next/image'

type Props = {
  entries: ParsedMetadataEntryV2[]
  className?: string
}

function time(h?: string, e?: string) {
  if (!h || !e) return ''
  return `${h}–${e}`
}

function clipHref(parentUrl?: string, startS?: number, clipUrl?: string | null) {
  if (clipUrl) return clipUrl
  if (!parentUrl) return '#'
  try {
    const u = new URL(parentUrl)
    // YouTube supports &t=<seconds>s
    u.searchParams.set('t', `${Math.max(0, Math.floor(startS ?? 0))}s`)
    return u.toString()
  } catch {
    return parentUrl
  }
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return null
  // map [0..1] to 0–100 and clamp
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100)
  return (
    <span
      title={`Relevance score: ${pct}/100`}
      className="ml-2 inline-flex items-center rounded-full border border-white/15 px-2 py-0.5 text-[10px] leading-4 text-white/80"
    >
      {pct}/100
    </span>
  )
}

function youtubeThumb(videoId?: string | null, fallbackUrl?: string) {
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (!fallbackUrl) return '/default-video-thumbnail.jpg'
  try {
    const url = new URL(fallbackUrl)
    const v = url.searchParams.get('v')
    return v ? `https://i.ytimg.com/vi/${v}/hqdefault.jpg` : '/default-video-thumbnail.jpg'
  } catch {
    return '/default-video-thumbnail.jpg'
  }
}

function ClipRow({ parent, clip }: { parent: ParsedMetadataEntryV2; clip: ClipItemV2 }) {
  const href = clipHref(parent.url, clip.startS, clip.clipUrl)
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-white/10 bg-white/5 p-3 hover:border-white/20"
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="relative h-16 w-28 overflow-hidden rounded">
          <Image
            src={youtubeThumb(clip.videoId ?? parent.videoId, parent.url)}
            alt={parent.parentTitle}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            sizes="(max-width: 639px) 100vw, 11rem"
          />
          {/* Hover overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/30 group-hover:opacity-100">
            <div className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-black">
              ▶ {time(clip.startHMS, clip.endHMS) || 'Open clip'}
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-medium text-white/90">
            {clip.parentTitle ?? parent.parentTitle}
            <ScoreBadge score={clip.score} />
          </div>
          <div className="mt-0.5 text-xs text-white/60">
            {parent.channelName ?? parent.channel}
            {parent.publishedAt ?? parent.publishedDate ?? parent.date ? ` · ${parent.publishedAt ?? parent.publishedDate ?? parent.date}` : ''}
          </div>
          {clip.excerpt ? (
            <div className="mt-1 line-clamp-2 text-xs text-white/70">{clip.excerpt}</div>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export function SourceListInline({ entries, className }: Props) {
  if (!entries?.length) return null
  return (
    <div className={cn('mx-auto w-full max-w-3xl', className)}>
      {entries.map((p, i) => (
        <div key={i} className={cn('mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4')}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">{p.parentTitle}</div>
            <div className="text-xs text-white/60">
              {p.channelName ?? p.channel}
              {p.publishedAt ?? p.publishedDate ?? p.date ? ` · ${p.publishedAt ?? p.publishedDate ?? p.date}` : ''}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {p.clips.map((c, j) => (
              <ClipRow key={j} parent={p} clip={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SourceListInline
