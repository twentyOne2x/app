'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ClipItemV2, ParsedMetadataEntryV2 } from '@/lib/utils'
import type {
  ClipGenerationRecord,
  ClipGenerationRequestPayload,
  ClipGenerationStatus,
  ClipGenerationStore
} from '@/lib/types'
import { buildClipPreferenceKey } from './use-clip-padding'
import { computeClipTiming } from '@/lib/utils'
import { useLocalStorage } from './use-local-storage'
import type { ClipPaddingSettings } from './use-clip-padding'
import { nanoid } from 'nanoid'

export interface GenerateOptions {
  force?: boolean
}

const STORAGE_KEY = 'clip-generation-records/v1'

type PollingStatus = Extract<ClipGenerationStatus, 'queued' | 'processing'>

function normalizeRecord(
  input?: ClipGenerationRecord
): ClipGenerationRecord | undefined {
  if (!input) return undefined
  const status: ClipGenerationStatus = input.status ?? 'idle'
  return {
    ...input,
    status
  }
}

function buildGenerationKey(
  parent?: ParsedMetadataEntryV2,
  clip?: ClipItemV2,
  padding?: ClipPaddingSettings
): string | undefined {
  const base = buildClipPreferenceKey(parent, clip)
  if (!base || !padding) return undefined
  return [
    base,
    `mode=${padding.mode}`,
    `smart=${padding.smartPadSeconds}`,
    `before=${padding.padBeforeSeconds}`,
    `after=${padding.padAfterSeconds}`
  ].join('::')
}

async function postClipGeneration(payload: ClipGenerationRequestPayload) {
  const response = await fetch('/api/clips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to queue clip')
  }
  return (await response.json()) as { id: string; status: ClipGenerationStatus }
}

async function postClipRetry(clipId: string, idempotencyKey: string) {
  const response = await fetch(`/api/clips/${clipId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey })
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to retry clip')
  }
  return (await response.json()) as { id: string; status: ClipGenerationStatus }
}

async function fetchClipStatus(id: string) {
  const response = await fetch(`/api/clips/${id}`, {
    method: 'GET',
    cache: 'no-store'
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to fetch clip status')
  }
  return (await response.json()) as ClipGenerationRecord
}

function canPoll(status?: ClipGenerationStatus): status is PollingStatus {
  return status === 'queued' || status === 'processing'
}

export function useClipGeneration(
  parent?: ParsedMetadataEntryV2,
  clip?: ClipItemV2,
  padding?: ClipPaddingSettings
) {
  const [store, setStore] = useLocalStorage<ClipGenerationStore>(
    STORAGE_KEY,
    {}
  )
  const storeRef = useRef(store)

  useEffect(() => {
    storeRef.current = store
  }, [store])

  const key = useMemo(
    () => buildGenerationKey(parent, clip, padding),
    [parent, clip, padding]
  )
  const record = normalizeRecord(key ? store[key] : undefined)

  const updateStoreForKey = useCallback(
    (targetKey: string, value?: ClipGenerationRecord) => {
      const current = { ...storeRef.current }
      if (!value) {
        delete current[targetKey]
      } else {
        current[targetKey] = value
      }
      storeRef.current = current
      setStore(current)
    },
    [setStore]
  )

  const queueStatusUpdate = useCallback(
    (next: ClipGenerationRecord) => {
      if (!key) return
      updateStoreForKey(key, {
        ...next,
        lastUpdated: Date.now()
      })
    },
    [key, updateStoreForKey]
  )

  const clear = useCallback(() => {
    if (!key) return
    updateStoreForKey(key, undefined)
  }, [key, updateStoreForKey])

  const generate = useCallback(
    async (options?: GenerateOptions) => {
      if (!key || !parent || !clip || !padding) return

      const current = normalizeRecord(storeRef.current[key])
      if (!options?.force && current && canPoll(current.status)) {
        return
      }
      if (!options?.force && current?.status === 'ready') {
        return
      }

      const { start, end, derived } = computeClipTiming(clip)
      const mediaId =
        clip.mediaId ?? clip.media_id ?? parent.mediaId ?? parent.media_id

      const payload: ClipGenerationRequestPayload = {
        idempotencyKey:
          current?.requestPayload?.idempotencyKey ?? `clip-create-${nanoid(32)}`,
        mediaId,
        sourceUrl: mediaId ? undefined : (clip.url ?? parent.url),
        parentTitle: parent.parentTitle,
        clipLabel: clip.parentTitle,
        channel: clip.channel,
        start,
        end,
        contextMode: padding.mode === 'smart' ? 'sentence' : 'seconds',
        padBefore:
          padding.mode === 'smart'
            ? padding.smartPadSeconds
            : padding.padBeforeSeconds,
        padAfter:
          padding.mode === 'smart'
            ? padding.smartPadSeconds
            : padding.padAfterSeconds,
        preferVideo: true,
        renderProfile: 'hq-1080p-v1',
        derived
      }

      queueStatusUpdate({
        clipId: current?.clipId ?? '',
        status: 'queued',
        requestPayload: payload,
        lastUpdated: Date.now()
      })

      try {
        const { id, status } = await postClipGeneration(payload)
        queueStatusUpdate({
          clipId: id,
          status,
          requestPayload: payload,
          lastUpdated: Date.now()
        })
      } catch (error) {
        queueStatusUpdate({
          clipId: current?.clipId ?? '',
          status: 'error',
          errorMessage:
            error instanceof Error ? error.message : 'Failed to queue clip',
          requestPayload: payload,
          lastUpdated: Date.now()
        })
        throw error
      }
    },
    [clip, key, padding, parent, queueStatusUpdate]
  )

  const poll = useCallback(
    async (clipId: string) => {
      try {
        const status = await fetchClipStatus(clipId)
        queueStatusUpdate({
          ...status,
          clipId: status.clipId ?? clipId,
          lastUpdated: Date.now()
        })
        return status.status
      } catch (error) {
        queueStatusUpdate({
          clipId,
          status: 'error',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Failed to refresh clip status',
          requestPayload: record?.requestPayload,
          lastUpdated: Date.now()
        })
        return 'error'
      }
    },
    [queueStatusUpdate, record?.requestPayload]
  )

  const retry = useCallback(async () => {
    if (!key) return
    const current = normalizeRecord(storeRef.current[key])
    if (
      !current?.clipId ||
      (current.status !== 'error' && current.status !== 'expired') ||
      current.retrying
    ) {
      return
    }
    const retryIdempotencyKey =
      current.retryIdempotencyKey ?? `clip-retry-${nanoid(32)}`
    queueStatusUpdate({
      ...current,
      retrying: true,
      retryIdempotencyKey,
      errorMessage: undefined,
      lastUpdated: Date.now()
    })
    try {
      const result = await postClipRetry(current.clipId, retryIdempotencyKey)
      queueStatusUpdate({
        clipId: result.id,
        status: result.status,
        requestPayload: current.requestPayload,
        retrying: false,
        lastUpdated: Date.now()
      })
    } catch (error) {
      queueStatusUpdate({
        ...current,
        retrying: false,
        retryIdempotencyKey,
        errorMessage:
          error instanceof Error ? error.message : 'Failed to retry clip',
        lastUpdated: Date.now()
      })
      throw error
    }
  }, [key, queueStatusUpdate])

  useEffect(() => {
    if (!key || !record?.clipId || !canPoll(record.status)) {
      return
    }

    let isActive = true
    let timeout: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      if (!isActive) return
      const status = await poll(record.clipId!)
      if (!isActive) return
      if (canPoll(status)) {
        timeout = setTimeout(run, status === 'queued' ? 1500 : 2500)
      }
    }

    run()

    return () => {
      isActive = false
      if (timeout) clearTimeout(timeout)
    }
  }, [key, poll, record?.clipId, record?.status])

  const refresh = useCallback(async () => {
    if (!key || !record?.clipId) return
    await poll(record.clipId)
  }, [key, poll, record?.clipId])

  return {
    key,
    status: record?.status ?? 'idle',
    clipId: record?.clipId,
    streamUrl: record?.streamUrl,
    downloadUrl: record?.downloadUrl,
    error: record?.errorMessage,
    isGenerating: canPoll(record?.status) || record?.retrying === true,
    isReady: record?.status === 'ready',
    isExpired: record?.status === 'expired',
    generate,
    regenerate: useCallback(() => generate({ force: true }), [generate]),
    retry,
    refresh,
    clear,
    requestPayload: record?.requestPayload
  }
}
