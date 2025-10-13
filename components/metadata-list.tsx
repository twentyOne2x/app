// components/metadata-list.tsx
import React, { useState, useEffect } from 'react'
import { type ParsedMetadataEntryV2, type ClipItemV2 } from '@/lib/utils'
import styles from './MetadataList.module.css'
import { toast } from 'react-hot-toast'
import Image from 'next/image'

const MetadataList: React.FC<{ entries: ParsedMetadataEntryV2[] }> = ({
  entries
}) => {
  const [docMappings, setDocMappings] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    const url = '/docs_mapping.json'
    fetch(url)
      .then(response => {
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`)
        return response.json()
      })
      .then(data => setDocMappings(data))
      .catch(error => console.error('Error fetching document mappings:', error))
  }, [])

  const extractDomain = (link: string): string => {
    try {
      const url = new URL(link)
      return url.hostname
    } catch {
      const m = link.match(/^(?:https?:\/\/)?([^/]+)/)
      return m?.[1] ?? 'default'
    }
  }

  const predefinedDomains = [
    'papers.ssrn.com',
    'www.sciencedirect.com',
    'www.researchgate.net',
    'xenophonlabs.com',
    'moallemi.com',
    'uniswap.org',
    'www.sec.gov',
    'cms.nil.foundation',
    'arxiv.org',
    'dl.acm.org',
    'eprint.iacr.org',
    'www.nature.com',
    'angeris.github.io',
    'fc24.ifca.ai',
    'people.eecs.berkeley.edu',
    'pub.tik.ee.ethz.ch',
    'anthonyleezhang.github.io',
    'atiselsts.github.io',
    'lamport.azurewebsites.net',
    'pmg.csail.mit.edu',
    'business.columbia.edu',
    'www.cs.purdue.edu',
    'www.cfainstitute.org'
  ]

  const normalizeUrl = (u: string) => {
    const urlObj = new URL(u)
    return urlObj.origin + urlObj.pathname.replace(/\/$/, '')
  }

  const getDocumentName = (link: string) => {
    const normalizedLink = normalizeUrl(link)
    return docMappings[normalizedLink] || null
  }

  const YOUTUBE_ID_REGEX = /[A-Za-z0-9_-]{11}/

  const parseYoutubeIdFromUrl = (value: string): string | null => {
    try {
      const url = value.match(/^[a-z]+:\/\//i)
        ? new URL(value)
        : new URL(`https://${value}`)
      const host = url.hostname.toLowerCase()
      if (!host.includes('youtube.com') && !host.includes('youtu.be'))
        return null
      if (host.includes('youtu.be')) {
        const slug = url.pathname.split('/').filter(Boolean)[0]
        return slug && YOUTUBE_ID_REGEX.test(slug) ? slug.slice(0, 11) : null
      }
      const idParam = url.searchParams.get('v')
      if (idParam && YOUTUBE_ID_REGEX.test(idParam)) return idParam.slice(0, 11)
      const segments = url.pathname.split('/').filter(Boolean)
      for (const segment of segments) {
        if (segment.length >= 11 && YOUTUBE_ID_REGEX.test(segment.slice(-11))) {
          return segment.slice(-11)
        }
      }
    } catch {
      // ignore
    }
    return null
  }

  const extractYoutubeId = (candidate?: string | null): string | null => {
    if (!candidate) return null
    const trimmed = candidate.trim()
    if (!trimmed) return null
    if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed
    if (trimmed.includes('youtube')) {
      const parsed = parseYoutubeIdFromUrl(trimmed)
      if (parsed) return parsed
    }
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = parseYoutubeIdFromUrl(trimmed)
      if (parsed) return parsed
    }
    const match = trimmed.match(YOUTUBE_ID_REGEX)
    if (match) return match[0]
    return null
  }

  const resolveFallbackVideoId = (
    entry: ParsedMetadataEntryV2
  ): string | null => {
    const candidates: Array<string | null | undefined> = [
      entry.videoId,
      entry.parentId,
      (entry as { id?: string }).id,
      entry.parentTitle,
      entry.url
    ]

    entry.clips?.forEach(clip => {
      candidates.push(
        clip.videoId,
        clip.parentId,
        clip.segmentId,
        clip.url,
        clip.clipUrl,
        clip.parentTitle
      )
    })

    for (const candidate of candidates) {
      const id = extractYoutubeId(candidate)
      if (id) return id
    }
    return null
  }

  const getThumbnailUrl = (entry: ParsedMetadataEntryV2) => {
    const fallbackVideoId = resolveFallbackVideoId(entry)
    const anyUrl = entry.url || entry.clips.find(c => c.url)?.url || ''

    if (entry.thumbnailUrl) {
      return entry.thumbnailUrl
    }

    if (fallbackVideoId) {
      return `https://img.youtube.com/vi/${fallbackVideoId}/hqdefault.jpg`
    }

    if (anyUrl.includes('youtube.com') || anyUrl.includes('youtu.be')) {
      try {
        const id = parseYoutubeIdFromUrl(anyUrl)
        return id
          ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
          : '/default-youtube-thumbnail.jpg'
      } catch {
        return '/default-youtube-thumbnail.jpg'
      }
    }

    if (anyUrl) {
      const domain = extractDomain(anyUrl)
      const documentName = getDocumentName(anyUrl)
      if (documentName) {
        return `/research_paper_thumbnails/${domain}/${encodeURIComponent(documentName)}`
      }
      if (predefinedDomains.includes(domain)) {
        const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png'
        return `/research_paper_thumbnails/${encodedTitle}`
      }
      const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png'
      return `/research_paper_thumbnails/${domain}/${encodedTitle}`
    }

    try {
      const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png'
      return `/research_paper_thumbnails/${encodedTitle}`
    } catch (error) {
      console.error(
        `Error parsing URL: ${error}. Using default thumbnail as fallback.`
      )
      return '/default-thumbnail.jpg'
    }
  }

  const formatClipRange = (clip: ClipItemV2) => {
    const start =
      (clip.startHMS && clip.startHMS.trim()) ||
      (typeof clip.startS === 'number'
        ? new Date(Math.max(0, clip.startS) * 1000).toISOString().slice(11, 23)
        : '')
    const end =
      (clip.endHMS && clip.endHMS.trim()) ||
      (typeof clip.endS === 'number'
        ? new Date(Math.max(0, clip.endS) * 1000).toISOString().slice(11, 23)
        : '')

    if (start && end) return `(${start} – ${end})`
    if (start) return `(${start})`
    if (end) return `(${end})`
    return ''
  }

  const sanitizeClipExcerpt = (value?: string | null): string =>
    (typeof value === 'string' ? value.trim() : '') || ''

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
                    const clipExcerpt = sanitizeClipExcerpt(c.excerpt)
                    if (!clipRange && !clipExcerpt) return null

                    return (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {c.clipUrl || c.url ? (
                          <a
                            href={c.clipUrl ?? c.url ?? '#'}
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
