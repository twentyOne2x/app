import { randomUUID } from 'crypto'
import type {
  ClipGenerationRecord,
  ClipGenerationRequestPayload,
  ClipGenerationStatus
} from '@/lib/types'

interface LocalClipJob {
  id: string
  status: ClipGenerationStatus
  payload: ClipGenerationRequestPayload
  createdAt: number
  updatedAt: number
  streamUrl?: string
  downloadUrl?: string
  errorMessage?: string
  timers: NodeJS.Timeout[]
}

const jobs = new Map<string, LocalClipJob>()
const dedupeIndex = new Map<string, string>()

const SAMPLE_STREAM_URL =
  'https://storage.googleapis.com/coverr-public/videos/coverr-sketching-while-sitting-in-a-cafe-7414/1080p.mp4'

function serializePayload(payload: ClipGenerationRequestPayload): string {
  return JSON.stringify({
    sourceUrl: payload.sourceUrl ?? null,
    parentTitle: payload.parentTitle ?? null,
    clipLabel: payload.clipLabel ?? null,
    channel: payload.channel ?? null,
    start: payload.start,
    end: payload.end,
    contextMode: payload.contextMode,
    padBefore: payload.padBefore,
    padAfter: payload.padAfter
  })
}

function jobToRecord(job: LocalClipJob): ClipGenerationRecord {
  return {
    clipId: job.id,
    status: job.status,
    streamUrl: job.streamUrl,
    downloadUrl: job.downloadUrl,
    errorMessage: job.errorMessage,
    requestPayload: job.payload,
    lastUpdated: job.updatedAt
  }
}

function updateJob(job: LocalClipJob, status: ClipGenerationStatus, overrides?: Partial<LocalClipJob>) {
  job.status = status
  job.updatedAt = Date.now()
  if (overrides) {
    Object.assign(job, overrides)
  }
}

export function enqueueLocalClipJob(payload: ClipGenerationRequestPayload): { id: string; status: ClipGenerationStatus } {
  const key = serializePayload(payload)
  const existingId = dedupeIndex.get(key)
  if (existingId) {
    const existing = jobs.get(existingId)
    if (existing) {
      return { id: existing.id, status: existing.status }
    }
  }

  const id = randomUUID()
  const now = Date.now()
  const job: LocalClipJob = {
    id,
    status: 'queued',
    payload,
    createdAt: now,
    updatedAt: now,
    timers: []
  }

  jobs.set(id, job)
  dedupeIndex.set(key, id)

  const processingTimer = setTimeout(() => {
    updateJob(job, 'processing')
  }, 1200)

  const readyTimer = setTimeout(() => {
    updateJob(job, 'ready', {
      streamUrl: SAMPLE_STREAM_URL,
      downloadUrl: SAMPLE_STREAM_URL
    })
  }, 3200)

  job.timers.push(processingTimer, readyTimer)

  return { id, status: job.status }
}

export function getLocalClipJob(id: string): ClipGenerationRecord | undefined {
  const job = jobs.get(id)
  console.log('clips:local:get', { id, found: Boolean(job) })
  if (!job) return undefined
  return jobToRecord(job)
}

export function __resetLocalJobsForTests() {
  jobs.clear()
  dedupeIndex.clear()
}
