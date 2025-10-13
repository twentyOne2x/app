// lib/entry-profiles.ts
export interface EntryProfile {
  code: string;
  label: string;
  headline: string;
  description: string;
  questions: string[];
}

export const ENTRY_PROFILE_COOKIE = 'entry_profile';

const DEFAULT_PROFILE_CODE = 'prf-default-e9b6fbea';
const ORANGIE_PROFILE_CODE = 'prf-orangie-4c17a89d';
const THREADGUY_PROFILE_CODE = 'prf-threadguy-93f1d2ba';
const ASHROBIN_PROFILE_CODE = 'prf-ashrobin-1de848f6';

const CODE_ALIASES: Record<string, string> = {
  default: DEFAULT_PROFILE_CODE,
  orangie: ORANGIE_PROFILE_CODE,
  threadguy: THREADGUY_PROFILE_CODE,
  ashrobin: ASHROBIN_PROFILE_CODE,
};

export const DEFAULT_ENTRY_PROFILE_CODE = DEFAULT_PROFILE_CODE;

const DEFAULT_QUESTIONS: string[] = [
  "What's Helius?",
  "What's Jito?",
  'Return all videos about DATs and Kyle Samani',
  'What is a DAT on Solana?',
  'Show me all clips where Kyle Samani details how DATs will be deployed in DeFi',
  'In the video where Cooker talks to Threadguy about Aster, did Cooker call the fact that Threadguy will soon interview CZ, the CEO of Binance?',
  "Who's Cupsey?",
  "What's Aster?",
  "Who's Cookerflips?",
  "What's Alpenglow?",
  "What's Firedancer?",
  'Return all videos about Firedancer',
  'Return all videos from Anza',
  'How much money has been raised on solana DATs and where will it be deployed in defi?',
  'What is the first and most recent mention of Firedancer?',
  "What does SIMD mean?",
  "What's SIMD-0326?",
  "What is done concretely to Increase Bandwitdth and Reduce Latency?",
];

const ENTRY_PROFILES: Record<string, EntryProfile> = {
  [DEFAULT_PROFILE_CODE]: {
    code: DEFAULT_PROFILE_CODE,
    label: 'Default ICM Research Feed',
    headline: 'icm.fyi is the Internet Capital Markets (ICM) chatbot.',
    description:
      'Discover the latest ICM-related content across DeFi, DATs, CCM, research papers, articles, YouTube videos, and Pump.fun streams.',
    questions: DEFAULT_QUESTIONS
  },
  [ORANGIE_PROFILE_CODE]: {
    code: ORANGIE_PROFILE_CODE,
    label: 'Orangie Web3 Creator Spotlight',
    headline: 'Spotlight on your latest Web3 content and conversations.',
    description:
      'These starter prompts surface insights from your recent videos, streams, and interviews so you can demo how the assistant covers your work.',
    questions: DEFAULT_QUESTIONS
  },
  [THREADGUY_PROFILE_CODE]: {
    code: THREADGUY_PROFILE_CODE,
    label: 'Threadguy Spaces + Threads',
    headline: 'Hey Threadguy — here’s the fastest way to review your spaces and threads.',
    description:
      'Use these prompts to surface takeaways, viral moments, and community reactions from your recent X threads and audio sessions.',
    questions: DEFAULT_QUESTIONS
  },
  [ASHROBIN_PROFILE_CODE]: {
    code: ASHROBIN_PROFILE_CODE,
    label: 'Ash Robin Builder Briefing',
    headline: 'Welcome Ash — let’s surface the smartest takes from your build logs.',
    description:
      'These questions focus on your technical deep dives, growth experiments, and AMAs so you can showcase product learnings quickly.',
    questions: DEFAULT_QUESTIONS
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
  const resolved = normalized ? CODE_ALIASES[normalized] ?? normalized : DEFAULT_PROFILE_CODE;
  return ENTRY_PROFILES[resolved] ?? ENTRY_PROFILES[DEFAULT_PROFILE_CODE];
}

export function isValidEntryCode(code?: string | null): boolean {
  const normalized = normalizeEntryCode(code);
  if (!normalized) return false;
  const resolved = CODE_ALIASES[normalized] ?? normalized;
  return resolved in ENTRY_PROFILES;
}

export function getEntryProfiles(): EntryProfile[] {
  return Object.values(ENTRY_PROFILES);
}

export function getDefaultQuestions(): string[] {
  return [...DEFAULT_QUESTIONS];
}
