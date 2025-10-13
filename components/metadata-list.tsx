// components/metadata-list.tsx
import React from 'react'
import {
  type ParsedMetadataEntryV2,
  type ClipItemV2,
  youtubeThumbFor,
  buildCanonicalClipLink,
  sanitizeClipExcerptText
} from '@/lib/utils'
import styles from './MetadataList.module.css'
import { toast } from 'react-hot-toast'
import Image from 'next/image'

const MetadataList: React.FC<{ entries: ParsedMetadataEntryV2[] }> = ({
  entries
}) => {
  const getThumbnailUrl = (entry: ParsedMetadataEntryV2) => {
    if (entry.thumbnailUrl) return entry.thumbnailUrl
    const primaryClip = entry.clips?.find(clip =>
      Boolean(
        clip.thumbnailUrl ||
          clip.videoId ||
          clip.parentId ||
          clip.clipUrl ||
          clip.url
      )
    )

    const thumbnail = youtubeThumbFor(
      primaryClip?.clipUrl ?? primaryClip?.url ?? entry.url,
      primaryClip?.videoId ?? primaryClip?.parentId ?? entry.videoId ?? entry.parentId ?? null
    )

    return thumbnail ?? '/default-thumbnail.jpg'
  }

  const normalizeHmsLabel = (value?: string | null): string | null => {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.includes('-1:-1:-1')) return null
    if (/^[-]+/.test(trimmed)) return null
    return trimmed
  }

  const formatClipRange = (clip: ClipItemV2) => {
    const startLabel =
      normalizeHmsLabel(clip.startHMS) ||
      (typeof clip.startS === 'number' && clip.startS >= 0
        ? new Date(Math.max(0, clip.startS) * 1000).toISOString().slice(11, 23)
        : '')
    const endLabel =
      normalizeHmsLabel(clip.endHMS) ||
      (typeof clip.endS === 'number' && clip.endS >= 0
        ? new Date(Math.max(0, clip.endS) * 1000).toISOString().slice(11, 23)
        : '')

    if (startLabel && endLabel) return `(${startLabel} – ${endLabel})`
    if (startLabel) return `(${startLabel})`
    if (endLabel) return `(${endLabel})`
    return ''
  }

  const parentHref = (e: ParsedMetadataEntryV2) =>
    e.url ||
    e.clips.find(c => c.clipUrl || c.url)?.clipUrl ||
    e.clips.find(c => c.url)?.url ||
    '#'

  return (
    <ol className={styles.metadataList}>
      {entries.map((entry, index) => (
        <li key={index} className={styles.metadataListItem}>
          <a
            href={parentHref(entry)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.metadataThumbnailLink}
            onClick={() => toast.success('Opened in a new tab!')}
          >
            <div className={styles.metadataThumbnail}>
              <Image
                src={getThumbnailUrl(entry)}
                alt={entry.parentTitle}
                fill
                sizes="(max-width: 767px) 100vw, 200px"
                className="object-contain"
              />
            </div>
          </a>
          <div className={styles.metadataContent}>
            <div className={styles.metadataTop}>
              <a
                href={parentHref(entry)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.metadataListLink}
              >
                {entry.parentTitle}
              </a>
            </div>
            <div className={styles.metadataMiddle}>
              <span className={styles.metadataListSpan}>
                {entry.channelName ?? entry.channel}
                {(entry.publishedAt ?? entry.publishedDate ?? entry.date)
                  ? ` · ${entry.publishedAt ?? entry.publishedDate ?? entry.date}`
                  : ''}
              </span>
              {entry.clips?.length ? (
                <ul style={{ marginTop: 6 }}>
                  {entry.clips.map((c, i) => {
                    const clipRange = formatClipRange(c)
                    const clipExcerpt = sanitizeClipExcerptText(c.excerpt)
                    if (!clipRange && !clipExcerpt) return null

                    return (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {c.clipUrl || c.url ? (
                          <a
                            href={
                              buildCanonicalClipLink(c, entry) ??
                              c.clipUrl ??
                              c.url ??
                              '#'
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.metadataClipText}
                          >
                            {clipRange}
                            {clipExcerpt && (
                              <>
                                {clipRange ? ' — ' : ''}
                                {clipExcerpt}
                              </>
                            )}
                          </a>
                        ) : (
                          <span className={styles.metadataClipText}>
                            {clipRange}
                            {clipExcerpt && (
                              <>
                                {clipRange ? ' — ' : ''}
                                {clipExcerpt}
                              </>
                            )}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
            <div className={styles.metadataBottom}>
              <span className={styles.metadataListSpan}>
                {entry.scoreMax != null
                  ? `Score: ${entry.scoreMax.toFixed(3)}`
                  : ''}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default MetadataList
