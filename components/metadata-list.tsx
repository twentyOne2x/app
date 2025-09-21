// components/metadata-list.tsx
import React, { useState, useEffect } from 'react';
import { ParsedMetadataEntry } from '@/lib/types';
import styles from './MetadataList.module.css';
import { toast } from 'react-hot-toast'; // Import toast

const MetadataList: React.FC<{ entries: ParsedMetadataEntry[] }> = ({ entries }) => {
  const [docMappings, setDocMappings] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const url = '/docs_mapping.json';
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setDocMappings(data);
      })
      .catch(error => {
        console.error('Error fetching document mappings:', error);
      });
  }, []);
  
  const extractDomain = (link: string): string => {
    try {
      const url = new URL(link);
      return url.hostname;
    } catch (error) {
      const regexMatch = link.match(/^(?:https?:\/\/)?([^\/]+)/);
      if (regexMatch && regexMatch[1]) {
        return regexMatch[1];
      } else {
        return 'default';
      }
    }
  };


  // List of predefined domains for research papers
  const predefinedDomains = [
    'papers.ssrn.com', 'www.sciencedirect.com', 'www.researchgate.net', 'xenophonlabs.com', 'moallemi.com', 'uniswap.org', 'www.sec.gov', 'cms.nil.foundation',
    'arxiv.org', 'dl.acm.org', 'eprint.iacr.org', 'www.nature.com', 'angeris.github.io', 'fc24.ifca.ai', 'people.eecs.berkeley.edu', 'pub.tik.ee.ethz.ch',
    'anthonyleezhang.github.io', 'atiselsts.github.io', 'lamport.azurewebsites.net', 'pmg.csail.mit.edu', 'business.columbia.edu', 'www.cs.purdue.edu',
    'www.cfainstitute.org',
  ];

  const normalizeUrl = (url: string) => {
    const urlObj = new URL(url);
    const normalizedUrl = urlObj.origin + urlObj.pathname.replace(/\/$/, ""); // Remove trailing slash and directly return the string
    return normalizedUrl;
  };
  
  const getDocumentName = (link: string) => {
    const normalizedLink = normalizeUrl(link); // This is now correctly a string
    const documentName = docMappings[normalizedLink] || null; // No error as normalizedLink is a string
    return documentName;
  };
  
  const getThumbnailUrl = (entry: ParsedMetadataEntry) => {
    let thumbnailUrl;

    if (entry.type === 'youtubeVideo') {
      const videoId = entry.link ? new URL(entry.link).searchParams.get('v') : null;
      thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '/default-youtube-thumbnail.jpg';
    } else if (entry.type === 'researchPaper' && entry.link) {
      const domain = extractDomain(entry.link);
      const documentName = getDocumentName(entry.link);

      if (documentName) {
        thumbnailUrl = `/research_paper_thumbnails/${domain}/${encodeURIComponent(documentName)}`;
      } else if (predefinedDomains.includes(domain)) {
        const encodedTitle = encodeURIComponent(entry.title) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${encodedTitle}`;
      } else {
        const encodedTitle = encodeURIComponent(entry.title) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${domain}/${encodeURIComponent(entry.title)}.png`;
      }
    } else {
      try {
        const encodedTitle = encodeURIComponent(entry.title) + '.png';
        thumbnailUrl = `/research_paper_thumbnails/${encodedTitle}`;
      } catch (error) {
        console.error(`Error parsing URL: ${error}. Using default thumbnail as fallback.`);
        thumbnailUrl = '/default-thumbnail.jpg';
      }
    }

    return thumbnailUrl;
  };

  return (
    <ol className={styles.metadataList}>
      {entries.map((entry, index) => (
        <li key={index} className={styles.metadataListItem}>
          <a
            href={entry.link}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.metadataThumbnailLink}
            onClick={() => toast.success('Opened in a new tab!')} // Show toast on click
          >
            <div className={styles.metadataThumbnail}>
              <img src={getThumbnailUrl(entry)} alt={entry.title} loading="lazy" />
            </div>
          </a>
          <div className={styles.metadataContent}>
            <div className={styles.metadataTop}>
              <a href={entry.link} target="_blank" rel="noopener noreferrer" className={styles.metadataListLink}>
                {entry.title}
              </a>
            </div>
            <div className={styles.metadataMiddle}>
              <span 
                className={styles.metadataListSpan} 
                dangerouslySetInnerHTML={{ __html: entry.extraInfo }} 
              />
            </div>
            <div className={styles.metadataBottom}>
              <span className={styles.metadataListSpan}>{entry.publishedDateString}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
};

export default MetadataList;
