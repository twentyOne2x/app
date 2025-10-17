'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import type { ClipSelectionEntry, ClipSelectionHandle } from './use-clip-selection'
import { resolveClipStartSeconds, resolveClipEndSeconds } from '@/lib/utils'

export type ClipBundleStatus = 'idle' | 'queued' | 'processing' | 'ready' | 'error'
export interface ClipBundleItem {
  key: string
  selection: ClipSelectionEntry
  clipId?: string
  status: ClipBundleStatus
  progress?: number
  downloadUrl?: string | null
  streamUrl?: string | null
  errorMessage?: string | null
}

export interface ClipBundleState {
  bundleId?: string
  status: ClipBundleStatus
  items: ClipBundleItem[]
  bundleStatus: ClipBundleStatus
  bundleDownloadUrl?: string | null
  diagnostics?: Record<string, unknown> | null
  createdAt?: number
  completedAt?: number
  errorMessage?: string | null
  lastPolledAt?: number
}

export interface ClipBundleHandle {
  state: ClipBundleState
  isRunning: boolean
  startBundle: () => Promise<void>
  clearBundle: () => void
  retryClip: (clipKey: string) => Promise<void>
  closeBundle: () => void
}

interface UseClipBundleOptions {
  selection: ClipSelectionHandle
  scope: string
  autoOpen?: (open: boolean) => void
}

const POLL_INTERVAL = 2000

export function useClipBundle({ selection, scope, autoOpen }: UseClipBundleOptions): ClipBundleHandle {
  const [state, setState] = useState<ClipBundleState>({
    status: 'idle',
    bundleStatus: 'idle',
    items: [],
    bundleDownloadUrl: null,
    diagnostics: null,
    lastPolledAt: undefined
  })
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const resetState = useCallback(() => {
    setState({
      status: 'idle',
      bundleStatus: 'idle',
      items: [],
      bundleDownloadUrl: null,
      diagnostics: null,
      createdAt: undefined,
      completedAt: undefined,
      errorMessage: null,
      lastPolledAt: undefined,
      bundleId: undefined
    })
  }, [])

  const startBundle = useCallback(async () => {
    if (!selection.selectionCount) {
      toast('Select clips to generate a bundle.')
      return
    }

    const sanitizedEntries = selection.selectedEntries.map((entry) => {
      const start = resolveClipStartSeconds(entry.clip)
      const end = resolveClipEndSeconds(entry.clip)
      return { entry, start, end }
    })

    const invalid = sanitizedEntries.filter(
      ({ start, end }) => typeof start !== 'number' || typeof end !== 'number' || end <= start
    )

    if (invalid.length) {
      toast.error('One or more clips are missing valid timestamps. Please adjust them before bundling.')
      return
    }

    const clipsPayload = sanitizedEntries.map(({ entry, start, end }) => ({
      key: entry.key,
      sourceUrl: entry.clip.url ?? entry.parent.url ?? undefined,
      start,
      end,
      startHMS: entry.clip.startHMS ?? undefined,
      endHMS: entry.clip.endHMS ?? undefined,
      contextMode: 'seconds',
      padBefore: 5,
      padAfter: 5,
      derived: entry.timingFallback ?? false
    }))

    const initialItems: ClipBundleItem[] = selection.selectedEntries.map((entry) => ({
      key: entry.key,
      selection: entry,
      status: 'queued'
    }))

    const startedAt = Date.now()
    setState({
      status: 'queued',
      bundleStatus: 'queued',
      bundleId: undefined,
      items: initialItems,
      createdAt: startedAt,
      completedAt: undefined,
      bundleDownloadUrl: null,
      diagnostics: null,
      errorMessage: null,
      lastPolledAt: startedAt
    })
    autoOpen?.(true)

    let response: Response
    try {
      response = await fetch('/api/clips/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          clips: clipsPayload,
          dedupe: true
        })
      })
    } catch (error) {
      console.error('clip-bundle: failed to reach batch endpoint', error)
      toast.error('Unable to reach the clip service. Please try again.')
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'network_error'
      }))
      return
    }

    if (response.status === 501) {
      toast('Batch clip service is not yet available. Single clip downloads still work.')
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'not_implemented'
      }))
      return
    }

    if (!response.ok) {
      const text = await response.text()
      console.error('clip-bundle: backend error', response.status, text)
      toast.error('Clip bundle could not be started.')
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: text || `http_${response.status}`
      }))
      return
    }

    const data = await response.json().catch(() => null)
    if (!data || !data.batchId) {
      toast.error('Clip bundle request returned an unexpected response.')
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'invalid_response'
      }))
      return
    }

    const itemsByKey = new Map<string, ClipBundleItem>()
    initialItems.forEach((item) => itemsByKey.set(item.key, item))
    if (Array.isArray(data.clips)) {
      for (const clip of data.clips) {
        if (clip.key && itemsByKey.has(clip.key)) {
          const original = itemsByKey.get(clip.key)!
          itemsByKey.set(clip.key, {
            ...original,
            clipId: clip.clipId ?? clip.clip_id ?? original.clipId,
            status: clip.status ?? original.status
          })
        }
      }
    }

    const now = Date.now()
    setState({
      status: 'queued',
      bundleStatus: (data.bundle?.status as ClipBundleStatus | undefined) ?? 'queued',
      bundleId: data.batchId,
      items: Array.from(itemsByKey.values()),
      createdAt: startedAt,
      completedAt: undefined,
      bundleDownloadUrl: data.bundle?.downloadUrl ?? data.bundle?.download_url ?? null,
      diagnostics: (data.diagnostics as Record<string, unknown> | null) ?? null,
      errorMessage: null,
      lastPolledAt: now
    })
    toast('Generating HQ bundle…')
  }, [selection, scope, autoOpen])

  const activeBundleId = state.bundleId
  const activeStatus = state.status

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    if (!activeBundleId || (activeStatus !== 'queued' && activeStatus !== 'processing')) {
      return
    }

    let cancelled = false
    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    const performPoll = async () => {
      if (cancelled) return
      let response: Response
      try {
        response = await fetch(`/api/clips/batch/${activeBundleId}`, { method: 'GET' })
      } catch (error) {
        console.error('clip-bundle: poll error', error)
        toast.error('Clip bundle polling failed.')
        stopPolling()
        setState((prev) => ({
          ...prev,
          status: 'error',
          bundleStatus: 'error',
          errorMessage: 'poll_failed'
        }))
        return
      }

      if (response.status === 404) {
        toast.error('Clip bundle expired or not found.')
        stopPolling()
        setState((prev) => ({
          ...prev,
          status: 'error',
          bundleStatus: 'error',
          errorMessage: 'not_found'
        }))
        return
      }

      if (response.status === 501) {
        toast('Clip bundle polling is not yet supported by the backend.')
        stopPolling()
        setState((prev) => ({
          ...prev,
          status: 'error',
          bundleStatus: 'error',
          errorMessage: 'not_implemented'
        }))
        return
      }

      if (!response.ok) {
        const text = await response.text()
        console.error('clip-bundle: polling backend error', response.status, text)
        toast.error('Clip bundle encountered an error.')
        stopPolling()
        setState((prev) => ({
          ...prev,
          status: 'error',
          bundleStatus: 'error',
          errorMessage: text || `http_${response.status}`
        }))
        return
      }

      const data = await response.json().catch(() => null)
      if (!data) {
        stopPolling()
        setState((prev) => ({
          ...prev,
          status: 'error',
          bundleStatus: 'error',
          errorMessage: 'invalid_poll_response'
        }))
        return
      }

      let toastTrigger: 'ready' | 'error' | null = null
      let shouldStop = false

      setState((prev) => {
        const itemsByKey = new Map(prev.items.map((item) => [item.key, item]))
        if (Array.isArray(data.clips)) {
          for (const clip of data.clips) {
            const key = clip.key ?? clip.selection?.key
            const existing = key ? itemsByKey.get(key) : undefined
            if (!existing) continue
            itemsByKey.set(existing.key, {
              ...existing,
              clipId: clip.clipId ?? clip.clip_id ?? existing.clipId,
              status: (clip.status as ClipBundleStatus | undefined) ?? existing.status,
              progress:
                typeof clip.progress === 'number' ? Math.max(0, Math.min(1, clip.progress)) : existing.progress,
              downloadUrl: clip.downloadUrl ?? clip.download_url ?? existing.downloadUrl,
              streamUrl: clip.streamUrl ?? clip.stream_url ?? existing.streamUrl,
              errorMessage: clip.error ?? existing.errorMessage ?? null
            })
          }
        }

        const items = Array.from(itemsByKey.values())
        const bundleStatus =
          (data.bundle?.status as ClipBundleStatus | undefined) ??
          (items.every((item) => item.status === 'ready') ? 'ready' : prev.bundleStatus)
        const anyClipError = items.some((item) => item.status === 'error')

        const nextStatus =
          bundleStatus === 'error'
            ? 'error'
            : bundleStatus === 'ready' && !anyClipError
            ? 'ready'
            : anyClipError
            ? 'error'
            : bundleStatus === 'queued'
            ? 'queued'
            : 'processing'

        if (prev.status !== nextStatus) {
          if (nextStatus === 'ready') toastTrigger = 'ready'
          else if (nextStatus === 'error') toastTrigger = 'error'
        }

        const nextState: ClipBundleState = {
          ...prev,
          status: nextStatus,
          bundleStatus,
          items,
          bundleId: (data.batchId as string | undefined) ?? prev.bundleId,
          bundleDownloadUrl:
            data.bundle?.downloadUrl ?? data.bundle?.download_url ?? prev.bundleDownloadUrl ?? null,
          diagnostics: (data.diagnostics as Record<string, unknown> | null) ?? prev.diagnostics ?? null,
          completedAt:
            nextStatus === 'ready' && !prev.completedAt ? Date.now() : prev.completedAt,
          errorMessage:
            nextStatus === 'error'
              ? prev.errorMessage ?? (data.bundle?.error as string | undefined) ?? 'clip_error'
              : null,
          lastPolledAt: Date.now()
        }

        shouldStop = nextState.status === 'ready' || nextState.status === 'error'
        return nextState
      })

      if (shouldStop) {
        stopPolling()
      }

      if (!cancelled && toastTrigger === 'ready') {
        toast.success('Clip bundle is ready to download.')
      } else if (!cancelled && toastTrigger === 'error') {
        toast.error('Some clips could not be generated.')
      }
    }

    void performPoll()
    pollIntervalRef.current = setInterval(() => {
      void performPoll()
    }, POLL_INTERVAL)

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [activeBundleId, activeStatus])

  const retryClip = useCallback(
    async (clipKey: string) => {
      if (!state.bundleId) {
        toast('No active bundle to retry.')
        return
      }
      try {
        const response = await fetch(`/api/clips/batch/${state.bundleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipKey })
        })
        if (!response.ok) {
          const text = await response.text()
          toast.error('Could not retry this clip.')
          console.error('clip-bundle: retry error', response.status, text)
          return
        }
        toast.success('Clip requeued.')
        setState((prev) => ({
          ...prev,
          status: 'processing',
          items: prev.items.map((item) =>
            item.key === clipKey
              ? { ...item, status: 'queued', errorMessage: null, progress: 0 }
              : item
          )
        }))
      } catch (error) {
        console.error('clip-bundle: retry network error', error)
        toast.error('Network error retrying clip.')
      }
    },
    [state.bundleId]
  )

  const clearBundle = useCallback(() => {
    resetState()
    selection.clearSelection()
  }, [selection, resetState])

  const closeBundle = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const isRunning = useMemo(
    () => state.status === 'queued' || state.status === 'processing',
    [state.status]
  )

  return {
    state,
    isRunning,
    startBundle,
    clearBundle,
    retryClip,
    closeBundle
  }
}
