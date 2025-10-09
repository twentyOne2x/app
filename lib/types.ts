import { type Message } from 'ai'

export interface Chat extends Record<string, any> {
  id: string
  title: string
  createdAt: Date
  userId: string
  path: string
  messages: Message[]
  sharePath?: string
}

export type ServerActionResult<Result> = Promise<
  | Result
  | {
      error: string
    }
>

export interface ParsedMetadataEntry {
  index: number;
  type: string;
  title: string;
  link: string;
  extraInfo: string;
  publishedDate: Date | null; // Allow this to be null
  publishedDateString: string;
}

// Extend the Message type to include structured_metadata
export interface ExtendedMessage extends Message {
  structured_metadata?: ParsedMetadataEntry[]; // Use the correct metadata type here
}

// lib/types.ts
export type Role = 'system' | 'user' | 'assistant' | 'function' | 'tool';

export interface Message {
  id?: string;
  role: Role;
  content: string;
}

export interface ClipItem {
  // parent context
  parentId?: string;                // if available later
  parentTitle: string;
  channel: string;
  date?: string;
  url?: string;                     // exact-start URL if we can resolve it
  score?: number;

  // clip details
  startHMS?: string;
  endHMS?: string;
  startS?: number;
  endS?: number;
  speaker?: string;
  excerpt?: string;                 // short “edges” excerpt when provided
}

export interface ParsedMetadataEntry {
  // one parent row aggregating multiple clips
  parentTitle: string;
  channel: string;
  date?: string;
  url?: string;                     // canonical parent URL; first resolved exact-start ok
  scoreMax?: number;                // best among clips
  clips: ClipItem[];                // individual clips for hover “see clips”
}

// existing Chat shape used in KV
export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: number | string | Date;
  path: string;
  messages: Message[];
  structured_metadata?: ParsedMetadataEntry[];
  readOnly?: boolean;
  sharePath?: string;
  originalChatId?: string;
}
