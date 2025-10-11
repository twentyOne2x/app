'use client'

import { useCallback, useMemo } from 'react'
import type { ClipItemV2, ParsedMetadataEntryV2 } from '@/lib/utils'
import { useLocalStorage } from './use-local-storage'
import { toast } from 'react-hot-toast'

export interface ClipSelectionEntry {
  key: string
  parent: Pick<ParsedMetadataEntryV2, 'parentTitle' | 'channel' | 'date' | 'url'>
  clip: Pick<
    ClipItemV2,
    | 'parentTitle'
    | 'channel'
    | 'startHMS'
    | 'endHMS'
    | 'startS'
    | 'endS'
    | 'speaker'
    | 'excerpt'
    | 'url'
  >
}

export interface ClipSelectionHandle {
  selectedEntries: ClipSelectionEntry[]
  selectionCount: number
  isSelected: (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => boolean
  toggleClip: (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => void
  clearSelection: () => void
}

export function buildClipSelectionKey(parent: ParsedMetadataEntryV2, clip: ClipItemV2): string {
  const parts = [
    parent.parentTitle ?? '',
    parent.channel ?? '',
    parent.date ?? '',
    parent.url ?? '',
    clip.parentTitle ?? '',
    clip.channel ?? '',
    clip.startHMS ?? '',
    clip.endHMS ?? '',
    clip.startS != null ? `s${clip.startS}` : '',
    clip.endS != null ? `e${clip.endS}` : '',
    clip.url ?? ''
  ]
  return parts.join('::')
}

function toSelectionEntry(parent: ParsedMetadataEntryV2, clip: ClipItemV2): ClipSelectionEntry {
  return {
    key: buildClipSelectionKey(parent, clip),
    parent: {
      parentTitle: parent.parentTitle,
      channel: parent.channel,
      date: parent.date,
      url: parent.url
    },
    clip: {
      parentTitle: clip.parentTitle,
      channel: clip.channel,
      startHMS: clip.startHMS,
      endHMS: clip.endHMS,
      startS: clip.startS,
      endS: clip.endS,
      speaker: clip.speaker,
      excerpt: clip.excerpt,
      url: clip.url
    }
  }
}

export function useClipSelection(scope: string): ClipSelectionHandle {
  const storageKey = `clip-selection:${scope}`
  const [storedEntries, setStoredEntries] = useLocalStorage<ClipSelectionEntry[]>(storageKey, [])

  const isSelected = useCallback(
    (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => {
      const key = buildClipSelectionKey(parent, clip)
      return storedEntries.some((entry) => entry.key === key)
    },
    [storedEntries]
  )

  const toggleClip = useCallback(
    (parent: ParsedMetadataEntryV2, clip: ClipItemV2) => {
      const key = buildClipSelectionKey(parent, clip)
      setStoredEntries((prev) => {
        const next = Array.isArray(prev) ? [...prev] : []
        const existingIndex = next.findIndex((entry) => entry.key === key)
        if (existingIndex >= 0) {
          next.splice(existingIndex, 1)
          toast('Removed clip from bundle.')
          return next
        }
        next.push(toSelectionEntry(parent, clip))
        toast.success('Added clip to bundle.')
        return next
      })
    },
    [setStoredEntries]
  )

  const clearSelection = useCallback(() => {
    setStoredEntries([])
    toast('Cleared bundle selection.')
  }, [setStoredEntries])

  const selectedEntries = useMemo(() => storedEntries ?? [], [storedEntries])

  return {
    selectedEntries,
    selectionCount: selectedEntries.length,
    isSelected,
    toggleClip,
    clearSelection
  }
}
