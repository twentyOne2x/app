// components/chat.tsx
'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Message } from 'ai';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils'
import { ChatList } from '@/components/chat-list'
import { ChatPanel } from '@/components/chat-panel'
import { EmptyScreen } from '@/components/empty-screen'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { toast } from 'react-hot-toast'
import SourceList from '@/components/source-list';
import ClipDrawer, { type ClipPlayback } from '@/components/clip-drawer';
import ChannelFilterPanel from '@/components/channel-filter';
import { LoginButton } from '@/components/login-button';
import ClipBundleBar from '@/components/clip-bundle-bar'
import ClipBundleDrawer from '@/components/clip-bundle-drawer'
import { useClipBundle } from '@/lib/hooks/use-clip-bundle'
import styles from './ChatListContainer.module.css'; // Import the CSS module
import QuestionsOverlayStyles from './QuestionsOverlay.module.css'; // Import the CSS module
import { QuestionsOverlay, QuestionsOverlayLeftPanel } from './question-overlay';
import {
  extractSourcesBlock,
  parseMetadata,
  type ParsedMetadataEntryV2,
  type ClipItemV2
} from '@/lib/utils';
import { coerceContent, isRenderableMessage } from '@/lib/coerce-content';
import Modal from '@/components/Modal'; // Import the Modal component
import { useEntryProfile } from '@/components/entry-profile-context';
import type { DiagnosticsPayload, ChannelFilterPayload } from '@/lib/types';
import { DEFAULT_PIPELINE, normalizeProgress } from '@/lib/progress-display';
import { useClipSelection } from '@/lib/hooks/use-clip-selection'

// Extend the Message type to include structured_metadata
export interface MetadataMessage extends Message {
  structured_metadata?: ParsedMetadataEntryV2[]; // Ideally, define a more specific type instead of any[]
  diagnostics?: DiagnosticsPayload | null;
}

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview'

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const cloned = response.clone()
    const data = await cloned.json()
    if (typeof data === 'string' && data.trim()) return data.trim()
    if (data && typeof data === 'object') {
      const maybeMessage =
        (typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message?: string }).message
          : null) ??
        (typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error?: string }).error
          : null)
      if (maybeMessage && maybeMessage.trim()) return maybeMessage.trim()
    }
  } catch {
    // fall through to text handling
  }

  try {
    const text = await response.text()
    const trimmed = text.trim()
    if (trimmed) return trimmed
  } catch {
    // ignore
  }

  if (response.statusText) return response.statusText
  if (response.status) return `Request failed with status ${response.status}`
  return null
}

function AuthButtonsCallout({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 text-center text-zinc-300', className)}>
      <div className="flex items-center justify-center gap-2">
        <LoginButton
          loginType="twitter"
          text="Twitter"
          showIcon
          size="sm"
          className="min-w-[112px] justify-center px-4"
        />
        <LoginButton
          loginType="privy"
          text="Privy"
          showIcon
          size="sm"
          className="min-w-[112px] justify-center px-4"
        />
      </div>
      <p className="max-w-[260px] text-xs text-zinc-400">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
          Quick sign-in
        </span>
        Connect Twitter or Privy to save chats and unlock sharing.
      </p>
    </div>
  )
}

function RightPanelAuthCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) return null

  return (
    <div className="mb-4 flex flex-col items-center rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-center shadow-[0_18px_38px_-22px_rgba(34,197,94,0.35)]">
      <AuthButtonsCallout />
    </div>
  )
}
export interface ChatProps extends React.ComponentProps<'div'> {
  initialMessages?: MetadataMessage[];
  id?: string;
  showQuestionsOverlay?: boolean; // Prop to toggle QuestionsOverlay visibility
  shared_chat?: boolean; // Prop to toggle shared_chat visibility
  structured_metadata?: ParsedMetadataEntryV2[]; // Optional structured metadata prop
  noPaddingTop?: boolean; // New optional bottom padding property
  currentUser?: {
    id?: string | null
    name?: string | null
    email?: string | null
  } | null
}

export function Chat({
  id,
  initialMessages,
  className,
  showQuestionsOverlay = true,
  shared_chat = false,
  structured_metadata = [], // Initialize structured_metadata with an empty array
  noPaddingTop = false, // New boolean prop for bottom padding
  currentUser = null
}: ChatProps) {
  const [previewToken, setPreviewToken] = useLocalStorage<string | null>(
    'ai-token',
    null
  )
  const entryProfile = useEntryProfile();

  // State to hold structured metadata entries
  const [structuredMetadataEntries, setStructuredMetadataEntries] = useState<ParsedMetadataEntryV2[]>(structured_metadata);
  // State to control the visibility of "Top Sources" title
  const [showTopSources, setShowTopSources] = useState(false);
  const [newMessages, setMessages] = useState(() => {
    const seed = (Array.isArray(initialMessages)
      ? initialMessages.filter((message) => {
          const renderable = isRenderableMessage(message)
          if (!renderable) {
            console.warn('chat:init skipping non-renderable message', message)
          }
          return renderable
        })
      : []) as MetadataMessage[]
    console.debug('chat:init messages', { count: seed.length, shared_chat })
    return seed
  });
  const [lastMessageRole, setLastMessageRole] = useState('assistant');

  // Initialize a state to control the initial render of QuestionsOverlay
  const [initialLoad, setInitialLoad] = useState(true);

  // Additional state to track if the fade-out animation has completed
  const [fadeOutCompleted, setFadeOutCompleted] = useState(true);

  const [metadataContainerVisible, setMetadataContainerVisible] = useState(true);

  // State to control the visibility of QuestionsOverlayLeftPanel
  const [showLeftPanelOverlay, setShowLeftPanelOverlay] = useState(false);  

  // New state for controlling the visibility of QuestionsOverlay
  const [showMiddlePanelOverlay, setShowMiddlePanelOverlay] = useState(true);

  const [showEmptyScreen, setShowEmptyScreen] = useState(true);
  const [showChatList, setShowChatList] = useState(false); // New state for ChatList visibility
  const [isMobile, setIsMobile] = useState(false);
  const initialPayloadSignatureRef = useRef<string | null>(null)

  // State for Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState<{
    parent: ParsedMetadataEntryV2
    clip: ClipItemV2
    playback: ClipPlayback
  } | null>(null);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [currentDiagnostics, setCurrentDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [liveProgress, setLiveProgress] = useState<Array<Record<string, unknown>>>([]);
  const [input, setInput] = useState('');
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [isBundleDrawerOpen, setBundleDrawerOpen] = useState(false)
  const channelDefaultsAppliedRef = useRef<string | null>(null)
  const channelCatalogStateRef = useRef<{
    code: string
    lastFetched: number
    fetchInFlight: boolean
    defaultsApplied: boolean
  }>({
    code: '',
    lastFetched: 0,
    fetchInFlight: false,
    defaultsApplied: false
  })
  const metadataChannelSignatureRef = useRef<string | null>(null)
  const currentTraceIdRef = useRef<string | null>(null)

  const channelFilterStorageKey = useMemo(
    () => `channel-filter:${entryProfile.code}`,
    [entryProfile.code]
  );
  const [excludedChannelNames, setExcludedChannelNames] = useLocalStorage<string[]>(
    channelFilterStorageKey,
    []
  );

  useEffect(() => {
    console.debug('chat: component mounted', {
      entryProfileCode: entryProfile.code,
      shared_chat,
      chatId: id ?? null
    })
    return () => {
      console.debug('chat: component unmounted', {
        entryProfileCode: entryProfile.code,
        shared_chat,
        chatId: id ?? null
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    const lastMessage = newMessages.length ? newMessages[newMessages.length - 1] : null
    console.debug('chat: messages state updated', {
      total: newMessages.length,
      lastRole: lastMessage?.role ?? null,
      lastId: lastMessage?.id ?? null,
      traceId: currentTraceIdRef.current
    })
  }, [newMessages])

  useEffect(() => {
    const firstEntry = structuredMetadataEntries.length ? structuredMetadataEntries[0] : null
    console.debug('chat: structured metadata updated', {
      count: structuredMetadataEntries.length,
      firstParent: firstEntry?.parentTitle ?? null,
      traceId: currentTraceIdRef.current
    })
  }, [structuredMetadataEntries])

  useEffect(() => {
    if (!liveProgress.length) return
    const stageSummaries = liveProgress.map((stage, index) => {
      const label =
        stage && typeof stage === 'object' && typeof (stage as { label?: unknown }).label === 'string'
          ? (stage as { label: string }).label
          : null
      const status =
        stage && typeof stage === 'object' && typeof (stage as { status?: unknown }).status === 'string'
          ? (stage as { status: string }).status
          : null
      return { index, label, status }
    })
    console.debug('chat: live progress update', {
      traceId: currentTraceIdRef.current,
      stages: stageSummaries
    })
  }, [liveProgress])

  useEffect(() => {
    console.debug('chat: processing state changed', {
      isProcessingQuery,
      progressEvents: liveProgress.length,
      traceId: currentTraceIdRef.current
    })
  }, [isProcessingQuery, liveProgress])

  useEffect(() => {
    if (!currentDiagnostics) {
      console.debug('chat: diagnostics cleared', { traceId: currentTraceIdRef.current })
      return
    }
    const progressCount = Array.isArray(currentDiagnostics.progress)
      ? currentDiagnostics.progress.length
      : 0
    console.debug('chat: diagnostics updated', {
      traceId: currentTraceIdRef.current,
      keys: Object.keys(currentDiagnostics ?? {}),
      progressCount
    })
  }, [currentDiagnostics])

  useEffect(() => {
    console.debug('chat: ui visibility toggled', {
      showEmptyScreen,
      showChatList,
      showMiddlePanelOverlay,
      showLeftPanelOverlay,
      traceId: currentTraceIdRef.current
    })
  }, [showEmptyScreen, showChatList, showMiddlePanelOverlay, showLeftPanelOverlay])

  useEffect(() => {
    console.debug('chat: top sources visibility toggled', {
      showTopSources,
      traceId: currentTraceIdRef.current
    })
  }, [showTopSources])

  useEffect(() => {
    console.debug('chat: metadata container visibility toggled', {
      metadataContainerVisible,
      traceId: currentTraceIdRef.current
    })
  }, [metadataContainerVisible])

  useEffect(() => {
    console.debug('chat: available channels updated', {
      count: availableChannels.length,
      preview: availableChannels.slice(0, 10)
    })
  }, [availableChannels])

  useEffect(() => {
    console.debug('chat: excluded channels updated', {
      count: excludedChannelNames.length,
      excluded: excludedChannelNames
    })
  }, [excludedChannelNames])

  useEffect(() => {
    channelDefaultsAppliedRef.current = null
    channelCatalogStateRef.current = {
      code: '',
      lastFetched: 0,
      fetchInFlight: false,
      defaultsApplied: false
    }
    console.debug('chat: entry profile changed, resetting channel catalog state', {
      entryProfileCode: entryProfile.code
    })
  }, [entryProfile.code])

  useEffect(() => {
    console.debug('chat: input value updated', {
      length: input.length,
      isEmpty: input.length === 0,
      traceId: currentTraceIdRef.current
    })
  }, [input])

  useEffect(() => {
    if (!availableChannels.length) return
    setExcludedChannelNames((prev) => {
      if (!prev?.length) return prev ?? []
      const availableSet = new Set(availableChannels)
      const filtered = prev.filter((name) => availableSet.has(name))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [availableChannels, setExcludedChannelNames])

  useEffect(() => {
    const now = Date.now()
    const state = channelCatalogStateRef.current
    const sameProfile = state.code === entryProfile.code
    const hasStoredSelection = excludedChannelNames.length > 0
    const catalogAlreadyLoaded = sameProfile && availableChannels.length > 0
    const recentlyFetched = sameProfile && now - state.lastFetched < 15000

    if (state.fetchInFlight) {
      console.debug('chat: channel catalog fetch already in-flight', {
        entryProfileCode: entryProfile.code,
        traceId: currentTraceIdRef.current,
        hasStoredSelection,
        availableChannelCount: availableChannels.length
      })
      return
    }

    if (catalogAlreadyLoaded && recentlyFetched) {
      console.debug('chat: skipping channel catalog fetch (cached)', {
        entryProfileCode: entryProfile.code,
        traceId: currentTraceIdRef.current,
        lastFetchedMsAgo: now - state.lastFetched,
        availableChannelCount: availableChannels.length,
        hasStoredSelection
      })
      return
    }

    let cancelled = false
    channelCatalogStateRef.current = {
      code: entryProfile.code,
      lastFetched: state.lastFetched,
      fetchInFlight: true,
      defaultsApplied: state.defaultsApplied
    }

    console.debug('chat: requesting channel catalog', {
      entryProfileCode: entryProfile.code,
      traceId: currentTraceIdRef.current,
      hasStoredSelection,
      cachedChannels: availableChannels.length
    })

    const loadChannelCatalog = async () => {
      try {
        const response = await fetch('/api/channels?scope=videos', { method: 'GET' })
        if (!response.ok) {
          console.warn('chat: channel catalog request failed', {
            status: response.status,
            traceId: currentTraceIdRef.current
          })
          return
        }
        const data = await response.json().catch(() => null)
        if (!data || cancelled) {
          console.debug('chat: channel catalog response ignored', {
            cancelled,
            hasData: Boolean(data),
            traceId: currentTraceIdRef.current
          })
          return
        }

        const channelEntries: unknown[] = Array.isArray(data)
          ? (data as unknown[])
          : Array.isArray((data as { channels?: unknown }).channels)
          ? ((data as { channels: unknown[] }).channels as unknown[])
          : Array.isArray((data as { channelDetails?: unknown }).channelDetails)
          ? ((data as { channelDetails: unknown[] }).channelDetails as unknown[])
          : []

        const names = channelEntries
          .map((entry) => {
            if (typeof entry === 'string') return entry.trim()
            if (
              entry &&
              typeof entry === 'object' &&
              typeof (entry as { name?: unknown }).name === 'string'
            ) {
              return ((entry as { name: string }).name).trim()
            }
            return ''
          })
          .filter((name): name is string => Boolean(name))

        const sanitized = Array.from(new Set(names))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        console.debug('chat: channel catalog sanitized', {
          traceId: currentTraceIdRef.current,
          receivedCount: channelEntries.length,
          sanitizedCount: sanitized.length
        })
        if (!sanitized.length) return

        setAvailableChannels((prev) => {
          if (prev.length === sanitized.length && prev.every((name, idx) => name === sanitized[idx])) {
            console.debug('chat: channel catalog unchanged', {
              traceId: currentTraceIdRef.current,
              count: sanitized.length
            })
            return prev
          }
          console.debug('chat: channel catalog updated', {
            traceId: currentTraceIdRef.current,
            previousCount: prev.length,
            nextCount: sanitized.length
          })
          return sanitized
        })

        let defaultsApplied = state.defaultsApplied
        const hasStoredSelectionNow = excludedChannelNames.length > 0
        if (!hasStoredSelectionNow && channelDefaultsAppliedRef.current !== entryProfile.code) {
          const defaultsSource =
            (data as { defaultSelected?: unknown }).defaultSelected ??
            (data as { default_selected?: unknown }).default_selected ??
            sanitized
          const defaults = Array.isArray(defaultsSource)
            ? (defaultsSource as unknown[])
                .map((name) => (typeof name === 'string' ? name.trim() : ''))
                .filter((name): name is string => Boolean(name))
            : sanitized
          const defaultSet = new Set<string>(defaults)
          const excluded: string[] = sanitized.filter((name) => !defaultSet.has(name))
          console.debug('chat: applying default channel selection', {
            traceId: currentTraceIdRef.current,
            defaultCount: defaults.length,
            excludedCount: excluded.length
          })
          setExcludedChannelNames(excluded)
          channelDefaultsAppliedRef.current = entryProfile.code
          defaultsApplied = true
        }

        channelCatalogStateRef.current = {
          code: entryProfile.code,
          lastFetched: Date.now(),
          fetchInFlight: false,
          defaultsApplied
        }
      } catch (error) {
        console.error('chat: failed to load channel catalog', error)
      } finally {
        if (channelCatalogStateRef.current.fetchInFlight) {
          channelCatalogStateRef.current = {
            ...channelCatalogStateRef.current,
            fetchInFlight: false,
            lastFetched: Date.now()
          }
        }
      }
    }

    void loadChannelCatalog()

    return () => {
      cancelled = true
    }
  }, [
    entryProfile.code,
    excludedChannelNames,
    availableChannels.length,
    setExcludedChannelNames
  ])

  const selectionScope = useMemo(() => {
    if (shared_chat && id) return `shared-chat:${id}`
    return `chat:${entryProfile.code}:${id ?? 'local'}`
  }, [shared_chat, id, entryProfile.code])
  const clipSelection = useClipSelection(selectionScope)
  const bundleHandle = useClipBundle({
    selection: clipSelection,
    scope: selectionScope,
    autoOpen: (open) => setBundleDrawerOpen(open)
  })
  const handleGenerateBundle = useCallback(() => {
    console.debug('chat: generate bundle requested', {
      traceId: currentTraceIdRef.current,
      selectionCount: clipSelection.selectionCount
    })
    void bundleHandle.startBundle()
  }, [bundleHandle, clipSelection.selectionCount])

  const handleClearSelection = useCallback(() => {
    console.debug('chat: clear selection requested', {
      traceId: currentTraceIdRef.current,
      selectionCount: clipSelection.selectionCount
    })
    bundleHandle.clearBundle()
  }, [bundleHandle, clipSelection.selectionCount])

  const handleCloseBundleDrawer = useCallback(() => {
    console.debug('chat: closing bundle drawer', {
      traceId: currentTraceIdRef.current
    })
    setBundleDrawerOpen(false)
    bundleHandle.closeBundle()
  }, [bundleHandle])

  // Effect to toggle visibility of metadataContainer based on structuredMetadataEntries
  useEffect(() => {
    let timer1: number | null = null;
    let timer2: number | null = null;

    if (structuredMetadataEntries.length > 0) {
      console.debug('chat: scheduling metadata container transitions', {
        traceId: currentTraceIdRef.current,
        entryCount: structuredMetadataEntries.length
      })
      setShowTopSources(true); // Show "Top Sources" once there are entries

      // Set a timeout to fade out first
      timer1 = window.setTimeout(() => {
        console.debug('chat: metadata container fade-out executing', {
          traceId: currentTraceIdRef.current
        })
        setMetadataContainerVisible(false);
      }, 500); // Adjust this duration to match your CSS transition

      // Set another timeout to fade back in
      timer2 = window.setTimeout(() => {
        console.debug('chat: metadata container fade-in executing', {
          traceId: currentTraceIdRef.current
        })
        setMetadataContainerVisible(true);
      }, 500); // This starts after the first timer completes
    }

    return () => {
      if (timer1 !== null) clearTimeout(timer1);
      if (timer2 !== null) clearTimeout(timer2);
    };
  }, [structuredMetadataEntries]);

  // Process the response content to replace specified phrases with "ICM"
  const processResponseContent = useCallback((content: string): string => {
    const original = content ?? ''
    console.debug('chat: processResponseContent invoked', {
      originalLength: original.length,
      traceId: currentTraceIdRef.current
    })
    let processedContent = original

    const replacements: Array<[RegExp, string]> = [
      [/ICM \(Internet Capital Markets\)/g, 'ICM'],
      [/Internet Capital Markets \(ICM\)/g, 'ICM'],
      [/Internet Capital Markets/g, 'ICM'],
      [/hyper\s*liquid/gi, 'Hyperliquid']
    ]

    replacements.forEach(([pattern, replacement]) => {
      processedContent = processedContent.replace(pattern, replacement)
    })

    if (processedContent !== original) {
      console.debug('chat: processResponseContent normalized terms', {
        traceId: currentTraceIdRef.current
      })
    }
    console.debug('chat: processResponseContent completed', {
      resultLength: processedContent.length,
      traceId: currentTraceIdRef.current
    })
    return processedContent
  }, [])

  const stripSourcesBlock = useCallback((content: string) => {
    if (!content) {
      console.debug('chat: stripSourcesBlock skipped (empty content)', {
        traceId: currentTraceIdRef.current
      })
      return content
    }
    const marker = 'Fetched based on the following sources:'
    const index = content.lastIndexOf(marker)
    if (index === -1) {
      console.debug('chat: stripSourcesBlock marker not found', {
        traceId: currentTraceIdRef.current
      })
      return content
    }
    const stripped = content.slice(0, index).trimEnd()
    console.debug('chat: stripSourcesBlock removed sources block', {
      originalLength: content.length,
      strippedLength: stripped.length,
      traceId: currentTraceIdRef.current
    })
    return stripped
  }, [])

  const handleClipSelect = useCallback(
    (payload: { parent: ParsedMetadataEntryV2; clip: ClipItemV2; playback: ClipPlayback }) => {
      console.debug('chat: clip selected', {
        traceId: currentTraceIdRef.current,
        parentTitle: payload.parent?.parentTitle ?? null,
        clipStart: payload.clip?.startHMS ?? null,
        clipUrl: payload.clip?.url ?? null
      })
      setSelectedClip(payload);
    },
    []
  );

  const handleCloseClipDrawer = useCallback(() => {
    console.debug('chat: clip drawer closed', { traceId: currentTraceIdRef.current })
    setSelectedClip(null);
  }, []);

  const handleExcludedChannelsChange = useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next.filter(Boolean)));
      console.debug('chat: excluded channels change requested', {
        incomingCount: next.length,
        uniqueCount: unique.length,
        traceId: currentTraceIdRef.current
      })
      setExcludedChannelNames(unique);
    },
    [setExcludedChannelNames]
  );

  const selectedChannelNames = useMemo(() => {
    if (!availableChannels.length) return []
    const excludedSet = new Set(excludedChannelNames.filter(Boolean))
    return availableChannels.filter((channel) => !excludedSet.has(channel))
  }, [availableChannels, excludedChannelNames])

  useEffect(() => {
    if (!availableChannels.length) return
    console.debug('chat: channel catalog updated', {
      totalAvailable: availableChannels.length,
      selected: selectedChannelNames,
      excluded: excludedChannelNames
    })
  }, [availableChannels, selectedChannelNames, excludedChannelNames])

  const channelFilterPayload = useMemo<ChannelFilterPayload | undefined>(() => {
    if (!availableChannels.length) return undefined
    if (selectedChannelNames.length === 0) {
      return { include_names: [] }
    }
    if (selectedChannelNames.length === availableChannels.length) {
      return undefined
    }
    return { include_names: selectedChannelNames }
  }, [availableChannels, selectedChannelNames]);

  const buildChatRequestPayload = useCallback(
    (history: MetadataMessage[], options?: { clientTraceId?: string }) => {
      const wireMessages = history.map((message) => ({
        role: message.role,
        content: message.content
      }))
      const payload = {
        id,
        previewToken,
        entryProfileCode: entryProfile.code,
        channel_filter: channelFilterPayload,
        client_trace_id: options?.clientTraceId,
        messages: wireMessages,
        chat_history: wireMessages
      }
      console.debug('chat: request payload prepared', {
        traceId: options?.clientTraceId ?? null,
        historyCount: history.length,
        channelFilter: channelFilterPayload,
        hasPreviewToken: Boolean(previewToken),
        lastRole: history.length ? history[history.length - 1].role : null,
        lastMessageLength: history.length ? coerceContent(history[history.length - 1].content).length : 0
      })
      return payload
    },
    [channelFilterPayload, entryProfile.code, id, previewToken]
  )

  const renderAssistantPayload = useCallback(
    (payload: unknown, traceId: string) => {
      const data =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      console.debug('chat: renderAssistantPayload invoked', {
        traceId,
        payloadKeys: Object.keys(data),
        hasMessage: Boolean(data.message),
        hasDiagnostics: Boolean(data.diagnostics)
      })

      const rawAssistantContentValue =
        typeof data.response === 'string'
          ? data.response
          : data.message &&
            typeof data.message === 'object' &&
            typeof (data.message as { content?: unknown }).content === 'string'
          ? ((data.message as { content: string }).content)
          : typeof data.content === 'string'
          ? data.content
          : ''
      const rawAssistantContent = coerceContent(rawAssistantContentValue)

      let metadata: ParsedMetadataEntryV2[] = Array.isArray(
        data.message && typeof data.message === 'object'
          ? (data.message as { structured_metadata?: unknown }).structured_metadata
          : null
      )
        ? ((data.message as { structured_metadata: ParsedMetadataEntryV2[] }).structured_metadata)
        : Array.isArray(data.structured_metadata)
        ? (data.structured_metadata as ParsedMetadataEntryV2[])
        : []

      if ((!metadata || metadata.length === 0) && rawAssistantContent) {
        const sourcesBlock = extractSourcesBlock(rawAssistantContent) ?? ''
        if (sourcesBlock) {
          metadata = parseMetadata(sourcesBlock, rawAssistantContent)
        }
      }

      if (metadata?.length) {
        console.debug('chat: structured metadata received', {
          traceId,
          count: metadata.length
        })
        setStructuredMetadataEntries(metadata)
      } else {
        console.debug('chat: no structured metadata present', {
          traceId
        })
      }

      const sanitizedContent = processResponseContent(
        stripSourcesBlock(rawAssistantContent)
      )

      const diagnostics: DiagnosticsPayload | null =
        (data.diagnostics as DiagnosticsPayload | undefined) ??
        ((data.message as { diagnostics?: DiagnosticsPayload })?.diagnostics ?? null)

      const rawRole = (data.message as { role?: string })?.role ?? null
      const allowedRoles: MetadataMessage['role'][] = [
        'user',
        'assistant',
        'system',
        'tool',
        'function'
      ]
      const safeRole = allowedRoles.includes(rawRole as MetadataMessage['role'])
        ? ((rawRole as MetadataMessage['role']))
        : 'assistant'
      if (rawRole && safeRole !== rawRole) {
        console.debug('chat: normalizing assistant role', { traceId, rawRole, safeRole })
      }

      const assistantMessage: MetadataMessage = {
        id:
          (data.message as { id?: string })?.id ??
          (typeof data.id === 'string' ? data.id : undefined) ??
          nanoid(),
        role: safeRole,
        content: sanitizedContent,
        structured_metadata: metadata ?? [],
        diagnostics
      }

      console.debug('chat: assistant content prepared', {
        traceId,
        contentLength: sanitizedContent.length
      })

      setMessages((prev) => {
        const next = [...prev, assistantMessage]
        console.debug('chat: assistant message appended', {
          traceId,
          messageId: assistantMessage.id,
          totalMessages: next.length
        })
        return next
      })
      setLastMessageRole('assistant')

      if (diagnostics) {
        console.debug('chat: diagnostics payload applied', {
          traceId,
          progressCount: Array.isArray(diagnostics.progress) ? diagnostics.progress.length : 0
        })
        setCurrentDiagnostics(diagnostics)
        if (Array.isArray(diagnostics.progress)) {
          setLiveProgress(diagnostics.progress as Array<Record<string, unknown>>)
        }
      } else {
        setCurrentDiagnostics(null)
        setLiveProgress([])
        console.debug('chat: diagnostics missing, cleared progress state', { traceId })
      }

      return assistantMessage
    },
    [
      processResponseContent,
      stripSourcesBlock,
      setMessages,
      setLastMessageRole,
      setStructuredMetadataEntries,
      setCurrentDiagnostics,
      setLiveProgress
    ]
  )

  const sendChatLegacy = useCallback(
    async (history: MetadataMessage[], clientTraceId: string) => {
      const traceId = clientTraceId ?? 'unset-trace'
      const payload = buildChatRequestPayload(history, { clientTraceId: traceId })
      console.debug('chat: issuing backend request', {
        traceId,
        messageCount: history.length,
        channelFilter: payload.channel_filter,
        previewToken: payload.previewToken ? 'present' : 'absent'
      })
      let response: Response
      const requestStartedAt = Date.now()
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } catch (error) {
        console.error('chat: network error reaching backend', {
          traceId,
          durationMs: Date.now() - requestStartedAt
        }, error)
        throw error instanceof Error ? error : new Error('Failed to reach the chat service.')
      }

      const durationMs = Date.now() - requestStartedAt
      console.debug('chat: backend responded', {
        traceId,
        status: response.status,
        durationMs
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        console.error('chat: backend returned error status', {
          traceId,
          status: response.status,
          message
        })
        throw new Error(
          message ?? 'The chat service encountered an error. Please try again.'
        )
      }

      const data = await response.json().catch(() => null)
      if (!data) {
        throw new Error('The chat service returned an unexpected response.')
      }

      console.debug('chat: backend response summary', {
        traceId,
        hasMessage: Boolean(data?.message),
        hasDiagnostics: Boolean(data?.diagnostics),
        responseKeys: data ? Object.keys(data) : []
      })

      renderAssistantPayload(data, traceId)

      return data
    },
    [
      buildChatRequestPayload,
      renderAssistantPayload
    ]
  )

  // Function to parse messages and apply structured metadata
  const parseMessagesAndMetadata = useCallback(
    (messages: MetadataMessage[], metadata: ParsedMetadataEntryV2[]) => {
      console.debug('chat: parseMessagesAndMetadata invoked', {
        messageCount: messages.length,
        metadataCount: metadata.length,
        traceId: currentTraceIdRef.current
      })
      const parsedMessages = messages.map((message) => {
        if (message.role === 'assistant') {
          const raw = coerceContent(message.content)
          let nextContent = raw
          try {
            // Try to parse the content as JSON
            const parsedContent = JSON.parse(raw)

            if (parsedContent.message?.content) {
              nextContent = parsedContent.message.content
            }
          } catch (error) {
            console.error('Error parsing message content:', error)
          }

          message.content = processResponseContent(stripSourcesBlock(coerceContent(nextContent)))
        }
        return message
      })

    // Apply structured metadata
    setMessages(parsedMessages);
    setLastMessageRole('assistant');
    setStructuredMetadataEntries(metadata);
  }, [processResponseContent, stripSourcesBlock, setMessages, setLastMessageRole, setStructuredMetadataEntries]);

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);

    const hasInitialMessages = Array.isArray(initialMessages) && initialMessages.length > 0
    const hasStructuredMetadata =
      Array.isArray(structured_metadata) && structured_metadata.length > 0

    if (hasInitialMessages && hasStructuredMetadata) {
      const messageSignature = initialMessages
        .map((message) => {
          const identifier =
            (message as { id?: string }).id ??
            `${message.role ?? 'unknown'}:${coerceContent(message.content).slice(0, 32)}`
          return identifier
        })
        .join('|')
      const metadataSignature = structured_metadata
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return String(entry)
          }
          const parentParts = [
            entry.parentTitle ?? '',
            entry.channel ?? '',
            entry.date ?? '',
            entry.url ?? '',
            entry.scoreMax?.toString() ?? ''
          ]
          const clipSignature = Array.isArray(entry.clips)
            ? entry.clips
                .map((clip) => {
                  if (!clip || typeof clip !== 'object') {
                    return String(clip)
                  }
                  const clipParts = [
                    clip.parentTitle ?? '',
                    clip.channel ?? '',
                    clip.date ?? '',
                    clip.url ?? '',
                    clip.startHMS ?? '',
                    clip.endHMS ?? '',
                    clip.startS?.toString() ?? '',
                    clip.endS?.toString() ?? '',
                    clip.speaker ?? '',
                    clip.excerpt ?? ''
                  ]
                  return clipParts.join('^')
                })
                .join('~')
            : ''
          return [...parentParts, clipSignature].join('|')
        })
        .join('||')
      const signature = `${shared_chat ? 'shared' : 'standard'}:${id ?? 'local'}:${messageSignature}:${metadataSignature}`

      if (signature !== initialPayloadSignatureRef.current) {
        console.debug('chat: applying initial payload', {
          messageCount: initialMessages.length,
          metadataCount: structured_metadata.length,
          signature
        })
        parseMessagesAndMetadata(initialMessages, structured_metadata)
        initialPayloadSignatureRef.current = signature
      } else {
        console.debug('chat: initial payload already processed, skipping reapply', { signature })
      }
    } else {
      console.debug('chat: initial payload skipped', {
        hasInitialMessages,
        hasStructuredMetadata
      })
    }

    // Set showChatList to true when shared_chat is true
    if (shared_chat) {
      setShowChatList(true);
    }
  }, [shared_chat, initialMessages, structured_metadata, parseMessagesAndMetadata, id]);

  useEffect(() => {
    const source =
      structuredMetadataEntries.length > 0 ? structuredMetadataEntries : structured_metadata
    if (!Array.isArray(source) || !source.length) return

    const collected = source
      .map((entry) =>
        entry && typeof entry === 'object' && typeof entry.channel === 'string'
          ? entry.channel.trim()
          : ''
      )
      .filter(Boolean)

    if (!collected.length) return

    const signature = Array.from(new Set(collected)).sort().join('|')
    if (metadataChannelSignatureRef.current === signature) {
      console.debug('chat: metadata channel signature unchanged, skipping merge', {
        traceId: currentTraceIdRef.current
      })
      return
    }
    metadataChannelSignatureRef.current = signature

    setAvailableChannels((prev) => {
      const next = new Set(prev)
      let added = false
      for (const name of collected) {
        if (!next.has(name)) {
          next.add(name)
          added = true
        }
      }
      if (!added) {
        console.debug('chat: metadata channels already present', {
          traceId: currentTraceIdRef.current
        })
        return prev
      }

      const sorted = Array.from(next).filter(Boolean)
      sorted.sort((a, b) => a.localeCompare(b))

      console.debug('chat: metadata channels merged from clip metadata', {
        traceId: currentTraceIdRef.current,
        added: sorted.filter((name) => !prev.includes(name)),
        total: sorted.length
      })

      return sorted
    })
  }, [structuredMetadataEntries, structured_metadata])

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    // Set the initial value
    handleResize();
    console.debug('chat: initial viewport evaluated', {
      width: window.innerWidth,
      isMobile: window.innerWidth <= 768
    })

    // Listen for window resize events
    window.addEventListener('resize', handleResize);

    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    console.debug('chat: mobile breakpoint toggled', { isMobile })
  }, [isMobile])

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);

    // Set showChatList to true when shared_chat is true
    if (shared_chat) {
      setShowChatList(true);
    }
  }, [shared_chat]);

  // Function to handle user input submission
  const handleUserInputSubmit = useCallback(
    async (value: string) => {
    const rawInput = typeof value === 'string' ? value : coerceContent(value)
    const trimmedInput = rawInput.trim()
    if (!trimmedInput) {
      console.debug('chat: ignoring empty user submission')
      return
    }

    console.debug('chat: request pipeline initiated', {
      incomingLength: trimmedInput.length,
      currentTraceId: currentTraceIdRef.current
    })

    // Fade out EmptyScreen and QuestionsOverlay
    setShowMiddlePanelOverlay(false);
    console.debug('chat: scheduling overlay transitions', {
      traceId: currentTraceIdRef.current,
      hideDelayMs: 300,
      showDelayMs: 300
    })

    // Set a timeout to hide the EmptyScreen after the fade-out animation
    window.setTimeout(() => {
      console.debug('chat: hide empty screen timer fired', { traceId: currentTraceIdRef.current })
      setShowEmptyScreen(false);
    }, 300); // This should match the duration of the fade-out animation

    // Delay the fade-in of ChatList
    window.setTimeout(() => {
      console.debug('chat: show chat list timer fired', { traceId: currentTraceIdRef.current })
      setShowChatList(true); // Show ChatList with fade-in
    }, 300); // Delay should match the fade-out duration
  
    setIsProcessingQuery(true);
    console.debug('chat: processing flag set', { traceId: currentTraceIdRef.current })
    setCurrentDiagnostics(null);
    setLiveProgress([]);
  
    const messageId = nanoid();
    currentTraceIdRef.current = messageId
    console.debug('chat: user submitted prompt', {
      messageId,
      length: trimmedInput.length,
      preview: trimmedInput.slice(0, 160)
    })
    const newUserMessage: MetadataMessage = {
      id: messageId,
      content: trimmedInput,
      role: 'user',
      structured_metadata: [],
      diagnostics: null
    };
    const nextMessages = [...newMessages, newUserMessage];
    setMessages(nextMessages);
    console.debug('chat: user message appended', {
      traceId: messageId,
      totalMessages: nextMessages.length
    })
    setLastMessageRole('user');

    let backendPayload: unknown = null
    try {
      backendPayload = await sendChatLegacy(nextMessages, messageId)
      console.debug('chat: rendered backend payload', {
        traceId: messageId,
        hasContent: Boolean(backendPayload)
      })
    } catch (error) {
      console.error('chat: failed to fetch message', { traceId: messageId }, error)
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to reach the chat service. Please try again.'
      )
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setCurrentDiagnostics(null);
      setLiveProgress([]);
      setLastMessageRole('user')
      backendPayload = { error: error instanceof Error ? error.message : String(error) }
      console.debug('chat: cleared transient state after error', { traceId: messageId })
    } finally {
      setIsProcessingQuery(false);
      console.debug('chat: query cycle complete', {
        backendResult:
          backendPayload &&
          typeof backendPayload === 'object' &&
          backendPayload &&
          'error' in (backendPayload as Record<string, unknown>)
            ? 'error'
            : 'success',
        submittedMessageId: messageId,
        traceId: messageId
      })
    }

    // Hide the QuestionsOverlayLeftPanel on user input
    setShowLeftPanelOverlay(false);
    
    // Hide the middle panel overlay on user input
    setShowMiddlePanelOverlay(false);
    setFadeOutCompleted(false); // Animation starts, not yet completed
  },
  [
    newMessages,
    setShowMiddlePanelOverlay,
    setShowEmptyScreen,
    setShowChatList,
    setIsProcessingQuery,
    setCurrentDiagnostics,
    setMessages,
    sendChatLegacy,
    setLastMessageRole,
    setShowLeftPanelOverlay,
    setFadeOutCompleted,
    setLiveProgress
  ]);
  
  // Add an animation end handler
  const onAnimationEnd = () => {
    if (!showLeftPanelOverlay) {
      setFadeOutCompleted(true); // Animation completed
    }
  };

  // Update visibility of QuestionsOverlayLeftPanel based on message count and lastMessageRole
  useEffect(() => {
    // Show the overlay only if there are messages and the last message is from the assistant
    setShowLeftPanelOverlay(newMessages.length > 0 && lastMessageRole === 'assistant');
  }, [newMessages, lastMessageRole]);
  
  // Create a ref for the end of the chat list
  const chatListEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const attemptScroll = () => {
      if (lastMessageRole === 'assistant' && chatListEndRef.current) {
        const chatListElement = chatListEndRef.current.closest('.scrollableContainer'); // Use closest to find the scrollable container
        if (chatListElement) {
          const messageHeight = chatListEndRef.current.clientHeight;
          const messageTop = chatListEndRef.current.offsetTop;
          const containerHeight = chatListElement.clientHeight;
  
          const scrollPosition = messageTop + messageHeight / 2 - containerHeight / 2;
          chatListElement.scrollTop = scrollPosition;
        }
      }
    };
    // Use setTimeout to allow time for the message to fully render, especially if it contains images
    const timeoutId = setTimeout(attemptScroll, 100);
  
    return () => clearTimeout(timeoutId);
  }, [newMessages, lastMessageRole]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoad(false);
    }, 50); // Adjust this delay as needed
  
    return () => clearTimeout(timer); // Cleanup the timer
  }, []);

  // Determine the overlay class for QuestionsOverlay
  const overlayClass = isMobile 
    ? `${styles.questionsOverlay} ${styles.mobileHide}` 
    : initialLoad || (newMessages.length === 0 && showMiddlePanelOverlay)
      ? `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeIn}`
      : `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeOut}`;

  // Determine the overlay class for QuestionsOverlayLeftPanel
  const leftPanelOverlayClass = showLeftPanelOverlay 
    ? `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeIn}` 
    : `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeOut}`;

  const metadataContainerClass = cn(styles.metadataContainer, {
    [styles.metadataContainerVisible]: metadataContainerVisible,
  });

 // Assuming noPaddingTop is a boolean that dictates the presence of padding-top
 const middlePanelClass = cn(styles.middlePanel, {
   [styles.middlePanelNoPaddingTop]: noPaddingTop,
 });

 // Assuming noPaddingTop is a boolean that dictates the presence of padding-top
 const rightPanelClass = cn(styles.rightPanel, {
  [styles.rightPanelNoPaddingTop]: noPaddingTop,
  });

  const progressSummary = useMemo(() => {
    if (!isProcessingQuery) return null
    const progressSource =
      liveProgress.length > 0
        ? liveProgress
        : (currentDiagnostics?.progress as Array<Record<string, unknown>> | undefined)
    const normalized = normalizeProgress(progressSource)
    if (!normalized.length) {
      const initialLabel = DEFAULT_PIPELINE[0]?.label ?? 'Processing'
      return `▍ Working… ${initialLabel}\n\nWaiting for backend progress…`
    }

    const total = normalized.length
    const completed = normalized.filter((stage) => stage.status === 'completed').length
    const currentStage =
      [...normalized].reverse().find((stage) => stage.status === 'running') ??
      normalized.find((stage) => stage.status === 'pending') ??
      normalized[normalized.length - 1]

    const activeLabel = currentStage?.label ?? 'Processing'
    const statusLine = `Progress ${Math.min(completed, total)}/${total}`
    return `▍ Working… ${activeLabel}\n\n${statusLine}`
  }, [isProcessingQuery, liveProgress, currentDiagnostics])

  const displayMessages = useMemo(() => {
    if (!progressSummary) return newMessages
    const progressMessage: MetadataMessage = {
      id: `progress-status-${newMessages.length}`,
      role: 'assistant',
      content: progressSummary,
      structured_metadata: [],
      diagnostics: null
    }
    return [...newMessages, progressMessage]
  }, [newMessages, progressSummary])

  return (
    <>
      <div className={styles.layoutContainer}>
        <div className={styles.leftPanel}>
          <div className={styles.leftPanelContent}>
            <div className={leftPanelOverlayClass} onAnimationEnd={onAnimationEnd}>
              {/* Render conditionally based on fadeOutCompleted and shared_chat */}
              {!shared_chat && (showLeftPanelOverlay || !fadeOutCompleted) ? (
                <QuestionsOverlayLeftPanel onSubmit={handleUserInputSubmit} showOverlay={showLeftPanelOverlay} />
              ) : null}
            </div>
            {!shared_chat && !isMobile ? (
              <div className={styles.leftPanelFilter}>
                <ChannelFilterPanel
                  channels={availableChannels}
                  excluded={excludedChannelNames}
                  onExcludedChange={handleExcludedChannelsChange}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className={middlePanelClass}>
          <div className={styles.scrollableContainer}>
            {/* Conditional rendering for ChatList */}
            {showChatList && (
              <div className={QuestionsOverlayStyles.fadeIn}>
                <ChatList 
                  ref={chatListEndRef} 
                  messages={displayMessages} 
                  lastMessageRole={lastMessageRole}
                  onViewSources={() => setIsModalOpen(true)}
                  isMobile={isMobile}
                />
              </div>
            )}

            {/* Conditional rendering for EmptyScreen */}
            {!shared_chat && !showChatList && showEmptyScreen && (
              <div className={QuestionsOverlayStyles.fadeIn}>
                <EmptyScreen onSubmit={handleUserInputSubmit} showOverlay={showMiddlePanelOverlay} isVisible={showEmptyScreen} />
              </div>
            )}

            {newMessages.length === 0 && !isMobile && showQuestionsOverlay && (
              <div className={`${overlayClass} ${showMiddlePanelOverlay ? QuestionsOverlayStyles.fadeIn : QuestionsOverlayStyles.fadeOut}`}>
                <QuestionsOverlay onSubmit={handleUserInputSubmit} showOverlay={showMiddlePanelOverlay} />
              </div>
            )}
          </div>
          

          {!shared_chat && (
            <div className={styles.chatPanel}>
              {isMobile && (
                <div className="mb-4">
                  <ChannelFilterPanel
                    channels={availableChannels}
                    excluded={excludedChannelNames}
                    onExcludedChange={handleExcludedChannelsChange}
                  />
                </div>
              )}
              <ChatPanel
                id={id}
                isLoading={isProcessingQuery}
                input={input}
                setInput={setInput}
                onSubmit={handleUserInputSubmit}
                setMessages={setMessages}
                setStructuredMetadataEntries={setStructuredMetadataEntries}
                setLastMessageRole={setLastMessageRole}
                setShowTopSources={setShowTopSources}
                setFadeOutCompleted={setFadeOutCompleted}
                setMetadataContainerVisible={setMetadataContainerVisible}
                setShowLeftPanelOverlay={setShowLeftPanelOverlay}
                setShowMiddlePanelOverlay={setShowMiddlePanelOverlay}
                setShowEmptyScreen={setShowEmptyScreen}
                setShowChatList={setShowChatList}
              />
            </div>
          )}
        </div>

        <div className={rightPanelClass}>
          <div className={metadataContainerClass}>
            <RightPanelAuthCta isAuthenticated={Boolean(currentUser)} />
            {newMessages.length > 0 && (
              <div className={styles.metadataTitle}>Top Sources</div>
            )}
            <SourceList
              entries={structuredMetadataEntries}
              onSelectClip={handleClipSelect}
              selectionScope={selectionScope}
              selection={clipSelection}
            />
          </div>
        </div>
      </div>

      {/* Modal to display MetadataList on mobile */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <h2 className={styles.metadataTitle}>Top Sources</h2>
        <RightPanelAuthCta isAuthenticated={Boolean(currentUser)} />
        <SourceList
          entries={structuredMetadataEntries}
          onSelectClip={handleClipSelect}
          selectionScope={selectionScope}
          selection={clipSelection}
        />
      </Modal>
      <ClipBundleDrawer
        isOpen={isBundleDrawerOpen && bundleHandle.state.items.length > 0}
        onClose={handleCloseBundleDrawer}
        state={bundleHandle.state}
        onRetryClip={(key) => void bundleHandle.retryClip(key)}
      />
      <ClipBundleBar
        selectionCount={clipSelection.selectionCount}
        entries={clipSelection.selectedEntries}
        onGenerate={handleGenerateBundle}
        onClear={handleClearSelection}
        disabled={bundleHandle.state.errorMessage === 'not_implemented'}
        isRunning={bundleHandle.isRunning}
      />
      <ClipDrawer
        isOpen={Boolean(selectedClip)}
        parent={selectedClip?.parent}
        clip={selectedClip?.clip}
        playback={selectedClip?.playback}
        onClose={handleCloseClipDrawer}
      />
    </>
  );
}

export default Chat;
