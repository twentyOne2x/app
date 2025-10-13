'use client'

import React from 'react'
import Link from 'next/link'
import { cn, youtubeThumbFor, buildCanonicalClipLink } from '@/lib/utils'
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils'
import Image from 'next/image'

type Props = {
  entries: ParsedMetadataEntryV2[]
  className?: string
}

function secondsToHms(seconds: number): string {
  const totalMillis = Math.round(seconds * 1000)
  const hours = Math.floor(totalMillis / 3600000)
  const minutes = Math.floor((totalMillis % 3600000) / 60000)
  const secs = Math.floor((totalMillis % 60000) / 1000)
  const millis = totalMillis % 1000
  const base = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':')
  return millis ? `${base}.${millis.toString().padStart(3, '0')}` : base
}

const normalizeHmsLabel = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes('-1:-1:-1')) return null
  if (/^[-]+/.test(trimmed)) return null
  return trimmed
}

function formatClipRange(clip: ClipItemV2): string {
  const start =
    normalizeHmsLabel(clip.startHMS) ??
    (typeof clip.startS === 'number' && clip.startS >= 0
      ? secondsToHms(Math.max(0, clip.startS))
      : '')
  const end =
    normalizeHmsLabel(clip.endHMS) ??
    (typeof clip.endS === 'number' && clip.endS >= 0
      ? secondsToHms(Math.max(0, clip.endS))
      : '')
  if (start && end) return `${start} – ${end}`
  return start || end || ''
}

function ClipRow({
  parent,
  clip
}: {
  parent: ParsedMetadataEntryV2
  clip: ClipItemV2
}) {
  const href =
    buildCanonicalClipLink(clip, parent) ??
    clip.clipUrl ??
    clip.url ??
    parent.url ??
    '#'

  const thumbnailSrc =
    clip.thumbnailUrl ??
    parent.thumbnailUrl ??
    youtubeThumbFor(clip.clipUrl ?? clip.url ?? parent.url, clip.videoId ?? parent.videoId) ??
    '/default-video-thumbnail.jpg'

  const timestampLabel = formatClipRange(clip)
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-white/10 bg-white/5 p-3 hover:border-white/20"
    >
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-28 overflow-hidden rounded">
          {thumbnailSrc ? (
            <Image
              src={thumbnailSrc}
              alt={parent.parentTitle}
              fill
              className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              sizes="(max-width: 639px) 100vw, 11rem"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-white/10 text-[10px] text-white/60">
              No preview
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/30 group-hover:opacity-100">
            <div className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-black">
              ▶ {timestampLabel || 'Play clip'}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-medium text-white/90">
            {clip.parentTitle ?? parent.parentTitle}
          </div>
          <div className="mt-0.5 text-xs text-white/60">
            {parent.channelName ?? parent.channel}
            {(parent.publishedAt ?? parent.publishedDate ?? parent.date)
              ? ` · ${parent.publishedAt ?? parent.publishedDate ?? parent.date}`
              : ''}
          </div>
          {clip.excerpt ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/70">
              {clip.excerpt}
            </div>
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
        <div
          key={i}
          className={cn(
            'mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4'
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">
              {p.parentTitle}
            </div>
            <div className="text-xs text-white/60">
              {p.channelName ?? p.channel}
              {(p.publishedAt ?? p.publishedDate ?? p.date)
                ? ` · ${p.publishedAt ?? p.publishedDate ?? p.date}`
                : ''}
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
