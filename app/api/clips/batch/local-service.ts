import { randomUUID } from 'crypto'
import type { ClipBundleStatus } from '@/lib/hooks/use-clip-bundle'

interface ClipBundleRequestClip {
  key?: string
  sourceUrl?: string
  start?: number
  end?: number
}

interface CreateBatchPayload {
  scope?: string
  clips?: ClipBundleRequestClip[]
  dedupe?: boolean
}

interface LocalBatchClip {
  key: string
  clipId: string
  status: ClipBundleStatus
  downloadUrl?: string | null
  streamUrl?: string | null
  error?: string | null
  timers: NodeJS.Timeout[]
}

interface LocalBatch {
  id: string
  scope?: string
  status: ClipBundleStatus
  items: LocalBatchClip[]
  downloadUrl?: string | null
  createdAt: number
  updatedAt: number
  timers: NodeJS.Timeout[]
}

const batches = new Map<string, LocalBatch>()

const SAMPLE_STREAM_URL =
  'https://storage.googleapis.com/coverr-public/videos/coverr-sketching-while-sitting-in-a-cafe-7414/1080p.mp4'

const SAMPLE_ZIP_URL =
  'https://storage.googleapis.com/coverr-public/videos/coverr-sketching-while-sitting-in-a-cafe-7414/1080p.mp4'

function makeClipId(index: number) {
  return `local-clip-${index}-${randomUUID()}`
}

function toResponse(batch: LocalBatch) {
  return {
    batchId: batch.id,
    status: batch.status,
    bundle: {
      status: batch.status,
      downloadUrl: batch.downloadUrl
    },
    clips: batch.items.map((item) => ({
      key: item.key,
      clipId: item.clipId,
      status: item.status,
      downloadUrl: item.downloadUrl,
      streamUrl: item.streamUrl,
      error: item.error ?? null
    }))
  }
}

function updateBatch(batch: LocalBatch, status: ClipBundleStatus, overrides?: Partial<LocalBatch>) {
  batch.status = status
  batch.updatedAt = Date.now()
  if (overrides) {
    Object.assign(batch, overrides)
  }
}

function updateClip(
  clip: LocalBatchClip,
  status: ClipBundleStatus,
  overrides?: Partial<LocalBatchClip>
) {
  clip.status = status
  clip.timers = clip.timers ?? []
  if (overrides) {
    Object.assign(clip, overrides)
  }
}

export function createLocalBatch(payload: CreateBatchPayload) {
  const clips = Array.isArray(payload.clips) ? payload.clips : []
  if (!clips.length) {
    throw new Error('No clips provided for bundle')
  }

  const now = Date.now()
  const batchId = randomUUID()
  const items: LocalBatchClip[] = clips.map((clip, index) => ({
    key: clip.key ?? `clip-${index}`,
    clipId: makeClipId(index),
    status: 'queued',
    timers: []
  }))

  const batch: LocalBatch = {
    id: batchId,
    scope: payload.scope,
    status: 'queued',
    items,
    downloadUrl: null,
    createdAt: now,
    updatedAt: now,
    timers: []
  }

  const processingTimer = setTimeout(() => {
    updateBatch(batch, 'processing')
    batch.items.forEach((item) => updateClip(item, 'processing'))
    console.log('clips:batch:processing', {
      batchId: batch.id,
      clipCount: batch.items.length
    })
  }, 1200)

  const readyTimer = setTimeout(() => {
    batch.items.forEach((item) => {
      updateClip(item, 'ready', {
        downloadUrl: SAMPLE_STREAM_URL,
        streamUrl: SAMPLE_STREAM_URL
      })
    })
    updateBatch(batch, 'ready', {
      downloadUrl: SAMPLE_ZIP_URL
    })
    console.log('clips:batch:ready', {
      batchId: batch.id,
      clipCount: batch.items.length
    })
  }, 3200)

  batch.timers.push(processingTimer, readyTimer)

  batches.set(batchId, batch)

  console.log('clips:batch:queued', {
    batchId,
    scope: payload.scope ?? 'default',
    clipCount: clips.length
  })

  return toResponse(batch)
}

export function getLocalBatch(batchId: string) {
  const batch = batches.get(batchId)
  if (!batch) return undefined
  return toResponse(batch)
}

export function retryLocalBatchClip(batchId: string, clipKey: string) {
  const batch = batches.get(batchId)
  if (!batch) return false
  const clip = batch.items.find((item) => item.key === clipKey)
  if (!clip) return false

  clip.timers.forEach((timer) => clearTimeout(timer))
  clip.timers = []

  updateClip(clip, 'queued', {
    downloadUrl: null,
    streamUrl: null,
    error: null
  })
  updateBatch(batch, 'processing')

  const processingTimer = setTimeout(() => {
    updateClip(clip, 'processing')
  }, 500)

  const readyTimer = setTimeout(() => {
    updateClip(clip, 'ready', {
      downloadUrl: SAMPLE_STREAM_URL,
      streamUrl: SAMPLE_STREAM_URL
    })
    const allReady = batch.items.every((item) => item.status === 'ready')
    if (allReady) {
      updateBatch(batch, 'ready', {
        downloadUrl: SAMPLE_ZIP_URL
      })
    }
  }, 2200)

  clip.timers.push(processingTimer, readyTimer)

  console.log('clips:batch:retry', {
    batchId,
    clipKey
  })

  return true
}

export function __resetLocalBatchesForTests() {
  batches.forEach((batch) => {
    batch.timers.forEach((timer) => clearTimeout(timer))
    batch.items.forEach((clip) => clip.timers.forEach((timer) => clearTimeout(timer)))
  })
  batches.clear()
}
