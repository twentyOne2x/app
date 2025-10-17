import type { Chat, Message } from '@/lib/types'

export const E2E_USER_ID = 'e2e-user'
export const E2E_USER_NAME = 'E2E Researcher'
export const E2E_USER_EMAIL = 'researcher@example.com'

type SampleTemplate = {
  slug: string
  title: string
  createdAt: number
  messages: Message[]
  structured_metadata: Chat['structured_metadata']
}

const BASE_TEMPLATES: SampleTemplate[] = [
  {
    slug: 'icm-weekly-brief',
    title: 'Weekly brief: What moved ICM this week?',
    createdAt: Date.UTC(2024, 8, 12, 15, 30), // 2024-09-12T15:30:00Z
    messages: [
      {
        id: 'msg-user-weekly',
        role: 'user',
        content: 'Give me the highlights from the latest ICM research brief and link to the best sources.'
      },
      {
        id: 'msg-assistant-weekly',
        role: 'assistant',
        content:
          [
            'Here’s the quick read on this week’s ICM momentum:',
            '• Firedancer hit public testnet, pushing Solana throughput past 1M TPS in lab trials.',
            '• Modular rollups keep compounding — AltLayer shared a 35% latency reduction after the async prover rollout.',
            '• EigenLayer restaking surpassed $20B TVL, with the first AVS cohort landing next week.',
            '',
            'Fetched based on the following sources:',
            '1. [Solana Firedancer testnet recap](https://www.youtube.com/watch?v=solana-fd-weekly)',
            '2. [AltLayer async proving AMA](https://mirror.xyz/altlayer/async-proving)',
            '3. [Restaking dashboards thread](https://warpcast.com/icm/0xrestaking)'
          ].join('\n')
      }
    ],
    structured_metadata: [
      {
        parentTitle: 'Solana Firedancer testnet recap',
        channel: 'icm.fyi',
        date: '2024-09-10',
        url: 'https://www.youtube.com/watch?v=solana-fd-weekly',
        scoreMax: 0.91,
        clips: [
          {
            parentTitle: 'Solana Firedancer testnet recap',
            channel: 'icm.fyi',
            startHMS: '00:01:42',
            endHMS: '00:02:08',
            startS: 102,
            endS: 128,
            excerpt: 'Firedancer public testnet went live with 1M TPS synthetic throughput in lab tests.',
            clipUrl: 'https://www.youtube.com/watch?v=solana-fd-weekly&t=102s'
          }
        ]
      },
      {
        parentTitle: 'AltLayer async proving AMA',
        channel: 'AltLayer',
        date: '2024-09-08',
        url: 'https://mirror.xyz/altlayer/async-proving',
        scoreMax: 0.84,
        clips: [
          {
            parentTitle: 'AltLayer async proving AMA',
            channel: 'AltLayer',
            startHMS: '00:00:55',
            endHMS: '00:01:22',
            startS: 55,
            endS: 82,
            excerpt: 'Async provers cut proving latency by 35% in the latest rollup benchmark.',
            clipUrl: 'https://mirror.xyz/altlayer/async-proving#benchmarks'
          }
        ]
      }
    ]
  },
  {
    slug: 'modular-stack-roadmap',
    title: 'Roadmap: Modular stack priorities for Q4',
    createdAt: Date.UTC(2024, 7, 22, 18, 5), // 2024-08-22T18:05:00Z
    messages: [
      {
        id: 'msg-user-modular',
        role: 'user',
        content: 'I want an actionable roadmap for the modular stack, with clips I can grab for the next investor update.'
      },
      {
        id: 'msg-assistant-modular',
        role: 'assistant',
        content:
          [
            'Here’s a Q4 roadmap that keeps the modular stack on track:',
            '1. Finalize blobstream integration for Celestia → rollups (AltLayer demo shows the latency target).',
            '2. Ship the Morpho vault solver to production — see the live coding clip for key constraints.',
            '3. Align the consortium nodes for Lava v2, since infra teams need the QoS guarantees.',
            '',
            'Fetched based on the following sources:',
            '1. [AltLayer blobstream demo](https://warpcast.com/altlayer/blobstream)',
            '2. [Morpho solver live coding](https://www.youtube.com/watch?v=morpho-solver)',
            '3. [Lava v2 operator call](https://www.youtube.com/watch?v=lava-network)'
          ].join('\n')
      }
    ],
    structured_metadata: [
      {
        parentTitle: 'AltLayer blobstream demo',
        channel: 'AltLayer',
        date: '2024-08-20',
        url: 'https://warpcast.com/altlayer/blobstream',
        scoreMax: 0.87,
        clips: [
          {
            parentTitle: 'AltLayer blobstream demo',
            channel: 'AltLayer',
            startHMS: '00:02:11',
            endHMS: '00:02:49',
            startS: 131,
            endS: 169,
            excerpt: 'Blobstream reduces settlement latency by anchoring rollup batches directly on Celestia DA.',
            clipUrl: 'https://warpcast.com/altlayer/blobstream#demo'
          }
        ]
      },
      {
        parentTitle: 'Morpho solver live coding',
        channel: 'Morpho Labs',
        date: '2024-08-18',
        url: 'https://www.youtube.com/watch?v=morpho-solver',
        scoreMax: 0.81,
        clips: [
          {
            parentTitle: 'Morpho solver live coding',
            channel: 'Morpho Labs',
            startHMS: '00:04:05',
            endHMS: '00:04:44',
            startS: 245,
            endS: 284,
            excerpt: 'Solver constraints ensure vault slots remain profitable while minimizing MEV exposure.',
            clipUrl: 'https://www.youtube.com/watch?v=morpho-solver&t=245s'
          }
        ]
      }
    ]
  }
]

function cloneMessages(messages: Message[], namespace: string): Message[] {
  return messages.map((message, index) => ({
    ...message,
    id: `${message.id ?? `${namespace}-${index}`}-${namespace}`
  }))
}

function deepCloneMetadata(metadata: Chat['structured_metadata']): Chat['structured_metadata'] {
  return metadata.map((entry) => ({
    ...entry,
    clips: entry.clips.map((clip, index) => ({
      ...clip,
      segmentId: clip.segmentId ?? `${entry.parentTitle.toLowerCase().replace(/\s+/g, '-')}-${index}`
    }))
  }))
}

export const E2E_SAMPLE_CHATS: Chat[] = BASE_TEMPLATES.map((template) => ({
  id: template.slug,
  title: template.title,
  userId: E2E_USER_ID,
  createdAt: template.createdAt,
  path: `/chat/${template.slug}`,
  messages: cloneMessages(template.messages, template.slug),
  structured_metadata: deepCloneMetadata(template.structured_metadata)
}))

export function buildSampleChatsForUser(userId: string): Chat[] {
  return BASE_TEMPLATES.map((template, templateIndex) => {
    const slug = `${template.slug}-${userId}-${templateIndex}`
    return {
      id: slug,
      title: template.title,
      userId,
      createdAt: template.createdAt,
      path: `/chat/${slug}`,
      messages: cloneMessages(template.messages, slug),
      structured_metadata: deepCloneMetadata(template.structured_metadata)
    }
  })
}
