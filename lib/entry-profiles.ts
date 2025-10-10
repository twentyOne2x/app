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
  'What are the latest trends in Internet Capital Markets this week?',
  'Summarize the newest DeFi research the chatbot has indexed.',
  'Highlight recent conversations or interviews about DATs and CCM innovations.',
  'What notable regulatory updates should I know about in ICM right now?'
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
    headline: 'Welcome Orangie 👋 — let’s dive into your Web3 content.',
    description:
      'These starter prompts surface insights from your recent videos, streams, and interviews so you can demo how the assistant covers your work.',
    questions: [
      'What are the key takeaways from Orangie’s latest YouTube deep dive on web3 storytelling?',
      'Summarize Orangie’s collaborations with other creators over the past month.',
      'How is Orangie explaining crypto culture trends to the broader audience right now?',
      'Pull highlights from Orangie’s recent live streams that resonated with viewers.',
      'Which on-chain metrics does Orangie track to evaluate a new project before covering it?',
      'Collect the top audience questions that came up during Orangie’s last three Twitter Spaces.',
      'Find the most-shared clips where Orangie discusses creator monetization strategies in web3.',
      'Where has Orangie spoken about the tooling stack used to produce and distribute content?'
    ]
  },
  [THREADGUY_PROFILE_CODE]: {
    code: THREADGUY_PROFILE_CODE,
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
  [ASHROBIN_PROFILE_CODE]: {
    code: ASHROBIN_PROFILE_CODE,
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
