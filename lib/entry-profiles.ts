// lib/entry-profiles.ts
export interface EntryProfile {
  code: string;
  label: string;
  headline: string;
  description: string;
  questions: string[];
}

export const ENTRY_PROFILE_COOKIE = 'entry_profile';
export const DEFAULT_ENTRY_PROFILE_CODE = 'default';

const DEFAULT_QUESTIONS: string[] = [
  'What are the latest trends in Internet Capital Markets this week?',
  'Summarize the newest DeFi research the chatbot has indexed.',
  'Highlight recent conversations or interviews about DATs and CCM innovations.',
  'What notable regulatory updates should I know about in ICM right now?'
];

const ENTRY_PROFILES: Record<string, EntryProfile> = {
  [DEFAULT_ENTRY_PROFILE_CODE]: {
    code: DEFAULT_ENTRY_PROFILE_CODE,
    label: 'Default ICM Research Feed',
    headline: 'icm.fyi is the Internet Capital Markets (ICM) chatbot.',
    description:
      'Discover the latest ICM-related content across DeFi, DATs, CCM, research papers, articles, YouTube videos, and Pump.fun streams.',
    questions: DEFAULT_QUESTIONS
  },
  orangie: {
    code: 'orangie',
    label: 'Orangie Web3 Creator Spotlight',
    headline: 'Welcome Orangie 👋 — let’s dive into your Web3 content.',
    description:
      'These starter prompts surface insights from your recent videos, streams, and interviews so you can demo how the assistant covers your work.',
    questions: [
      'What are the key takeaways from Orangie’s latest YouTube deep dive on web3 storytelling?',
      'Summarize Orangie’s collaborations with other creators over the past month.',
      'How is Orangie explaining crypto culture trends to the broader audience right now?',
      'Pull highlights from Orangie’s recent live streams that resonated with viewers.'
    ]
  },
  threadguy: {
    code: 'threadguy',
    label: 'Threadguy Spaces + Threads',
    headline: 'Hey Threadguy — here’s the fastest way to review your spaces and threads.',
    description:
      'Use these prompts to surface takeaways, viral moments, and community reactions from your recent X threads and audio sessions.',
    questions: [
      'Summarize the hottest alpha drops from Threadguy’s most recent X Space.',
      'Which projects did Threadguy spotlight in the last week and why did they stand out?',
      'Find the timestamps where Threadguy debated NFT market rotations with guests.',
      'Highlight viral community reactions pulled from Threadguy’s latest threads.'
    ]
  },
  ashrobin: {
    code: 'ashrobin',
    label: 'Ash Robin Builder Briefing',
    headline: 'Welcome Ash — let’s surface the smartest takes from your build logs.',
    description:
      'These questions focus on your technical deep dives, growth experiments, and AMAs so you can showcase product learnings quickly.',
    questions: [
      'Summarize Ash Robin’s latest shipping updates and what problems they solve.',
      'Find the clip where Ash explains the north-star metrics behind the current roadmap.',
      'Which guests joined Ash Robin recently to discuss product market fit and what did they share?',
      'Pull actionable tactics Ash recommends for founders in the most recent videos or streams.'
    ]
  }
};

export const entryProfileCodes = Object.keys(ENTRY_PROFILES);

export function normalizeEntryCode(code?: string | null): string | null {
  if (!code) return null;
  const trimmed = code.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function getEntryProfileByCode(code?: string | null): EntryProfile {
  const normalized = normalizeEntryCode(code);
  if (!normalized) return ENTRY_PROFILES[DEFAULT_ENTRY_PROFILE_CODE];
  return ENTRY_PROFILES[normalized] ?? ENTRY_PROFILES[DEFAULT_ENTRY_PROFILE_CODE];
}

export function isValidEntryCode(code?: string | null): boolean {
  const normalized = normalizeEntryCode(code);
  if (!normalized) return false;
  return normalized in ENTRY_PROFILES;
}

export function getEntryProfiles(): EntryProfile[] {
  return Object.values(ENTRY_PROFILES);
}

export function getDefaultQuestions(): string[] {
  return [...DEFAULT_QUESTIONS];
}
