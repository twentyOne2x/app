// components/metadata-list.tsx
import React, { useState, useEffect } from 'react';
import { type ParsedMetadataEntryV2, type ClipItemV2 } from '@/lib/utils';
import styles from './MetadataList.module.css';
import { toast } from 'react-hot-toast';
import Image from 'next/image';

const MetadataList: React.FC<{ entries: ParsedMetadataEntryV2[] }> = ({ entries }) => {
  const [docMappings, setDocMappings] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const url = '/docs_mapping.json';
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => setDocMappings(data))
      .catch((error) => console.error('Error fetching document mappings:', error));
  }, []);

  const extractDomain = (link: string): string => {
    try {
      const url = new URL(link);
      return url.hostname;
    } catch {
      const m = link.match(/^(?:https?:\/\/)?([^/]+)/);
      return m?.[1] ?? 'default';
    }
  };

  const predefinedDomains = [
    'papers.ssrn.com', 'www.sciencedirect.com', 'www.researchgate.net', 'xenophonlabs.com', 'moallemi.com',
    'uniswap.org', 'www.sec.gov', 'cms.nil.foundation', 'arxiv.org', 'dl.acm.org', 'eprint.iacr.org',
    'www.nature.com', 'angeris.github.io', 'fc24.ifca.ai', 'people.eecs.berkeley.edu', 'pub.tik.ee.ethz.ch',
    'anthonyleezhang.github.io', 'atiselsts.github.io', 'lamport.azurewebsites.net', 'pmg.csail.mit.edu',
    'business.columbia.edu', 'www.cs.purdue.edu', 'www.cfainstitute.org',
  ];

  const normalizeUrl = (u: string) => {
    const urlObj = new URL(u);
    return urlObj.origin + urlObj.pathname.replace(/\/$/, '');
  };

  const getDocumentName = (link: string) => {
    const normalizedLink = normalizeUrl(link);
    return docMappings[normalizedLink] || null;
  };

  const getThumbnailUrl = (entry: ParsedMetadataEntryV2) => {
    let thumbnailUrl: string | undefined;
    const videoId = entry.videoId || entry.clips.find((c) => c.videoId)?.videoId || null;
    const anyUrl = entry.url || entry.clips.find((c) => c.url)?.url || '';

    if (videoId) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else if (anyUrl.includes('youtube.com') || anyUrl.includes('youtu.be')) {
      try {
        const u = new URL(anyUrl);
        const id = u.searchParams.get('v') || u.pathname.split('/').pop() || '';
        thumbnailUrl = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '/default-youtube-thumbnail.jpg';
      } catch {
        thumbnailUrl = '/default-youtube-thumbnail.jpg';
      }
    } else if (anyUrl) {
      const domain = extractDomain(anyUrl);
      const documentName = getDocumentName(anyUrl);
      if (documentName) {
        thumbnailUrl = `/research_paper_thumbnails/${domain}/${encodeURIComponent(documentName)}`;
      } else if (predefinedDomains.includes(domain)) {
        const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${encodedTitle}`;
      } else {
        const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${domain}/${encodedTitle}`;
      }
    } else {
      try {
        const encodedTitle = encodeURIComponent(entry.parentTitle) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${encodedTitle}`;
      } catch (error) {
        console.error(`Error parsing URL: ${error}. Using default thumbnail as fallback.`);
        thumbnailUrl = '/default-thumbnail.jpg';
      }
    }

    return thumbnailUrl!;
  };

  const clipTime = (c: ClipItemV2) => (c.startHMS && c.endHMS ? `(${c.startHMS}–${c.endHMS})` : '');

  const parentHref = (e: ParsedMetadataEntryV2) =>
    e.url || e.clips.find((c) => c.clipUrl || c.url)?.clipUrl || e.clips.find((c) => c.url)?.url || '#';

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
              <a href={parentHref(entry)} target="_blank" rel="noopener noreferrer" className={styles.metadataListLink}>
                {entry.parentTitle}
              </a>
            </div>
            <div className={styles.metadataMiddle}>
              <span className={styles.metadataListSpan}>
                {entry.channelName ?? entry.channel}
                {entry.publishedAt ?? entry.publishedDate ?? entry.date ? ` · ${entry.publishedAt ?? entry.publishedDate ?? entry.date}` : ''}
              </span>
              {entry.clips?.length ? (
                <ul style={{ marginTop: 6 }}>
                  {entry.clips.map((c, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {c.clipUrl || c.url ? (
                        <a href={c.clipUrl ?? c.url ?? '#'} target="_blank" rel="noopener noreferrer">
                          {clipTime(c)} {c.speaker ? `· ${c.speaker}` : ''}
                          {c.excerpt ? ` — ${c.excerpt}` : ''}
                        </a>
                      ) : (
                        <span>
                          {clipTime(c)} {c.speaker ? `· ${c.speaker}` : ''}
                          {c.excerpt ? ` — ${c.excerpt}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className={styles.metadataBottom}>
              <span className={styles.metadataListSpan}>
                {entry.scoreMax != null ? `Score: ${entry.scoreMax.toFixed(3)}` : ''}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
};

export default MetadataList;
