'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClipItemV2, ParsedMetadataEntryV2 } from '@/lib/utils'
import { useLocalStorage } from './use-local-storage'

const STORAGE_KEY = 'clip-pad-preferences/v1'

export type ClipContextMode = 'smart' | 'manual'

export interface ClipPaddingSettings {
  mode: ClipContextMode
  smartPadSeconds: number
  padBeforeSeconds: number
  padAfterSeconds: number
}

type ClipPaddingStore = Record<string, ClipPaddingSettings>

const DEFAULT_SETTINGS: ClipPaddingSettings = {
  mode: 'smart',
  smartPadSeconds: 5,
  padBeforeSeconds: 5,
  padAfterSeconds: 5
}

function ensureNonNegative(value: number): number {
  if (Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }
  return 0
}

function normalizeSettings(candidate?: Partial<ClipPaddingSettings>): ClipPaddingSettings {
  if (!candidate) return { ...DEFAULT_SETTINGS }
  const mode: ClipContextMode = candidate.mode === 'manual' ? 'manual' : 'smart'
  return {
    mode,
    smartPadSeconds: ensureNonNegative(candidate.smartPadSeconds ?? DEFAULT_SETTINGS.smartPadSeconds),
    padBeforeSeconds: ensureNonNegative(candidate.padBeforeSeconds ?? DEFAULT_SETTINGS.padBeforeSeconds),
    padAfterSeconds: ensureNonNegative(candidate.padAfterSeconds ?? DEFAULT_SETTINGS.padAfterSeconds)
  }
}

export function buildClipPreferenceKey(parent?: ParsedMetadataEntryV2, clip?: ClipItemV2): string | undefined {
  if (!parent || !clip) return undefined
  const parts = [
    parent.parentTitle ?? '',
    parent.channel ?? '',
    parent.date ?? '',
    clip.parentTitle ?? '',
    clip.channel ?? '',
    clip.startHMS ?? '',
    clip.endHMS ?? '',
    clip.startS != null ? `s${clip.startS}` : '',
    clip.endS != null ? `e${clip.endS}` : '',
    clip.url ?? parent.url ?? ''
  ]
  const key = parts.join('::').trim()
  return key || undefined
}

export function useClipPadding(parent?: ParsedMetadataEntryV2, clip?: ClipItemV2) {
  const clipKey = useMemo(() => buildClipPreferenceKey(parent, clip), [parent, clip])
  const [store, setStore] = useLocalStorage<ClipPaddingStore>(STORAGE_KEY, {})
  const [settings, setSettings] = useState<ClipPaddingSettings>({ ...DEFAULT_SETTINGS })

  useEffect(() => {
    if (!clipKey) {
      setSettings({ ...DEFAULT_SETTINGS })
      return
    }
    const stored = store[clipKey]
    setSettings(normalizeSettings(stored))
  }, [clipKey, store])

  const persist = useCallback(
    (next: ClipPaddingSettings) => {
      if (!clipKey) return
      setStore({
        ...store,
        [clipKey]: next
      })
    },
    [clipKey, setStore, store]
  )

  const updateSettings = useCallback(
    (updater: (prev: ClipPaddingSettings) => ClipPaddingSettings) => {
      setSettings((prev) => {
        const next = normalizeSettings(updater(prev))
        persist(next)
        return next
      })
    },
    [persist]
  )

  const reset = useCallback(() => {
    if (!clipKey) {
      setSettings({ ...DEFAULT_SETTINGS })
      return
    }
    setSettings({ ...DEFAULT_SETTINGS })
    const nextStore = { ...store }
    delete nextStore[clipKey]
    setStore(nextStore)
  }, [clipKey, setStore, store])

  return {
    clipKey,
    settings,
    setMode: useCallback(
      (mode: ClipContextMode) => {
        updateSettings((prev) => ({ ...prev, mode }))
      },
      [updateSettings]
    ),
    setSmartPadSeconds: useCallback(
      (seconds: number) => {
        updateSettings((prev) => ({ ...prev, smartPadSeconds: ensureNonNegative(seconds) }))
      },
      [updateSettings]
    ),
    setPadBeforeSeconds: useCallback(
      (seconds: number) => {
        updateSettings((prev) => ({ ...prev, padBeforeSeconds: ensureNonNegative(seconds) }))
      },
      [updateSettings]
    ),
    setPadAfterSeconds: useCallback(
      (seconds: number) => {
        updateSettings((prev) => ({ ...prev, padAfterSeconds: ensureNonNegative(seconds) }))
      },
      [updateSettings]
    ),
    adjustPadBefore: useCallback(
      (delta: number) => {
        updateSettings((prev) => ({
          ...prev,
          padBeforeSeconds: ensureNonNegative(prev.padBeforeSeconds + delta)
        }))
      },
      [updateSettings]
    ),
    adjustPadAfter: useCallback(
      (delta: number) => {
        updateSettings((prev) => ({
          ...prev,
          padAfterSeconds: ensureNonNegative(prev.padAfterSeconds + delta)
        }))
      },
      [updateSettings]
    ),
    reset
  }
}

export function getDefaultClipPadding(): ClipPaddingSettings {
  return { ...DEFAULT_SETTINGS }
}
