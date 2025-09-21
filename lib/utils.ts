import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'
import { ParsedMetadataEntry } from 'lib/types';


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
) // 7-character random string

// Assuming you've set REACT_APP_BACKEND_URL in your environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL;

export async function fetcher<JSON = any>(
  endpoint: string,
  init?: RequestInit
): Promise<JSON> {
  // Prepend the backend URL to the endpoint
  const res = await fetch(`${backendUrl}${endpoint}`, init)

  if (!res.ok) {
    const json = await res.json()
    if (json.error) {
      const error = new Error(json.error) as Error & {
        status: number
      }
      error.status = res.status
      throw error
    } else {
      throw new Error('An unexpected error occurred')
    }
  }

  return res.json()
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

export function parseMetadata(formattedMetadata: string): ParsedMetadataEntry[] {
  // console.log('Parsing metadata...');
  const formattedEntries = formattedMetadata.split('\n');

  const parsedEntries: (ParsedMetadataEntry | null)[] = formattedEntries.map((entry, index) => {
    // console.log(`Parsing entry ${index + 1}:`, entry);
    const videoDetails = entry.match(/\[Title\]: (.*?), \[Channel name\]: (.*?), \[Video Link\]: (.*?), \[Published date\]: ([\d-]+|nan)/);
    // Updated regex to handle empty release date and include highest score
    const paperDetails = entry.match(/\[Title\]: (.*?), \[Authors\]: (.*?), \[Link\]: (.*?), \[Release date\]: ([\d-]*|nan), \[Highest Score\]: ([0-9.]+)/);

    if (videoDetails) {
      // console.log(`Found video details for entry ${index + 1}`);
      return createVideoEntry(videoDetails, index);
    } else if (paperDetails) {
      // console.log(`Found paper details for entry ${index + 1}`);
      return createPaperEntry(paperDetails, index);
    } else {
      // console.log(`No valid details found for entry ${index + 1}`);
    }

    return null;
  });

  const filteredEntries = parsedEntries.filter(Boolean) as ParsedMetadataEntry[];
  console.log(`Parsed metadata with ${filteredEntries.length} valid entries.`);
  return filteredEntries;
}

function createVideoEntry(details: RegExpMatchArray, index: number): ParsedMetadataEntry {
  // console.log(`Creating video entry for index ${index + 1}`);
  const publishedDateString = sanitizeField("Date", details[4]);
  const publishedDate = publishedDateString.toLowerCase() === 'nan' ? null : new Date(publishedDateString);

  return {
    index: index + 1,
    type: 'youtubeVideo',
    title: sanitizeField("Title", details[1]),
    extraInfo: sanitizeField("Authors", details[2]),
    link: sanitizeField("URL", details[3]),
    publishedDate: publishedDate,
    publishedDateString: publishedDate ? publishedDateString : ''
  };
}

function createPaperEntry(details: RegExpMatchArray, index: number): ParsedMetadataEntry {
  // console.log(`Creating paper entry for index ${index + 1}`);
  const publishedDateString = sanitizeField("Date", details[4]);
  // Handle empty release date
  const publishedDate = publishedDateString && publishedDateString.toLowerCase() !== 'nan' ? new Date(publishedDateString) : null;

  return {
    index: index + 1,
    type: 'researchPaper',
    title: sanitizeField("Title", details[1]),
    extraInfo: processAuthors(sanitizeField("Authors", details[2]), details[3]),
    link: sanitizeField("URL", details[3]),
    publishedDate: publishedDate,
    publishedDateString: publishedDate ? publishedDateString : ''
    // Note: 'Highest Score' is not used in the return object as per your current requirements
  };
}


function processAuthors(authors: string, link: string): string {
  try {
    if (!isValidField(authors) && link) {
      const url = new URL(link);
      const domain = url.hostname;
      const parts = domain.split('.');
      const commonExtensions = ['com', 'xyz', 'io', 'org', 'net'];
      if (commonExtensions.includes(parts[parts.length - 1]) && parts.length > 2) {
        return parts.slice(-2, -1)[0].charAt(0).toUpperCase() + parts.slice(-2, -1)[0].slice(1);
      } else {
        return parts.slice(-2).join('.');
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error(`Error parsing URL: ${e.message}. Using full URL as fallback.`);
    } else {
      console.error(`An unexpected error occurred. Using full URL as fallback.`);
    }
    return link; // Fallback to using the full URL
  }

  const authorsArray = authors.split(', ');
  if (authorsArray.every(author => isValidField(author) && author.match(/^https?:\/\//))) {
    return authorsArray.map(author => {
      const lastSegment = author.split('/').filter(Boolean).pop();
      return `<a href="${author}" target="_blank" style="text-decoration: underline;">${lastSegment}</a>`;
    }).join(', ');
  } else {
    let combinedAuthors = authorsArray.join(', ');
    if (combinedAuthors.length > 44) {
      const firstAuthorLastName = authorsArray[0].split(' ').pop();
      combinedAuthors = `${firstAuthorLastName} et al.`;
    }
    return combinedAuthors;
  }
}

function sanitizeField(field_name: string, field: string): string {
  return isValidField(field) ? field : ''; // `${field_name} unspecified`;
}

function isValidField(field: string): boolean {
  const isFieldValid = !(!field || field.trim() === '' || field.trim().toLowerCase() === 'nan');
  if (!isFieldValid) {
    console.error(`Invalid field detected: "${field}"`);
  }
  return isFieldValid;
}