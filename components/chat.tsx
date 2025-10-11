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

function AuthButtonStack() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <LoginButton loginType="twitter" text="Twitter" showIcon />
      <LoginButton loginType="privy" text="Privy" showIcon />
    </div>
  )
}

function RightPanelAuthCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) return null

  return (
    <div className="mb-4 flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/60 p-4 text-center shadow-[0_20px_45px_-25px_rgba(34,197,94,0.45)]">
      <h3 className="text-sm font-semibold text-zinc-100">Sign in for extras</h3>
      <p className="mt-1 max-w-[220px] text-xs text-zinc-400">
        Connect Twitter or a wallet to save chats, share threads, and unlock future features.
      </p>
      <div className="mt-3">
        <AuthButtonStack />
      </div>
    </div>
  )
}

function FloatingAuthCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) return null

  return (
    <div className="pointer-events-none fixed top-6 right-6 z-[1300] hidden flex-col items-end gap-3 md:flex lg:right-10 lg:top-8">
      <div className="pointer-events-auto flex flex-col items-end gap-2 rounded-2xl border border-white/15 bg-black/75 px-4 py-3 text-xs text-zinc-200 shadow-[0_20px_45px_-25px_rgba(34,197,94,0.45)] backdrop-blur">
        <span className="text-[11px] uppercase tracking-wide text-emerald-200/80">
          Quick sign-in
        </span>
        <span className="max-w-[220px] text-right text-xs text-zinc-300">
          Connect Twitter or Privy to save chats and unlock sharing.
        </span>
        <div className="pt-1">
          <AuthButtonStack />
        </div>
      </div>
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

  const channelFilterStorageKey = useMemo(
    () => `channel-filter:${entryProfile.code}`,
    [entryProfile.code]
  );
  const [excludedChannelNames, setExcludedChannelNames] = useLocalStorage<string[]>(
    channelFilterStorageKey,
    []
  );

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    console.debug('chat: messages state updated', newMessages)
  }, [newMessages])

  useEffect(() => {
    console.debug('chat: structured metadata updated', structuredMetadataEntries)
  }, [structuredMetadataEntries])

  useEffect(() => {
    if (!liveProgress.length) return
    console.debug('chat: live progress update', liveProgress)
  }, [liveProgress])

  useEffect(() => {
    console.debug('chat: processing state changed', {
      isProcessingQuery,
      progressEvents: liveProgress.length
    })
  }, [isProcessingQuery, liveProgress])

  useEffect(() => {
    if (!currentDiagnostics) {
      console.debug('chat: diagnostics cleared')
      return
    }
    console.debug('chat: diagnostics updated', currentDiagnostics)
  }, [currentDiagnostics])

  useEffect(() => {
    console.debug('chat: ui visibility toggled', {
      showEmptyScreen,
      showChatList,
      showMiddlePanelOverlay,
      showLeftPanelOverlay
    })
  }, [showEmptyScreen, showChatList, showMiddlePanelOverlay, showLeftPanelOverlay])

  useEffect(() => {
    channelDefaultsAppliedRef.current = null
  }, [entryProfile.code])

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
    let cancelled = false

    const loadChannelCatalog = async () => {
      try {
        const response = await fetch('/api/channels?scope=videos', { method: 'GET' })
        if (!response.ok) return
        const data = await response.json().catch(() => null)
        if (!data || cancelled) return

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

        const sanitized = Array.from(new Set(names)).filter(Boolean).sort((a, b) => a.localeCompare(b))
        if (!sanitized.length) return
        setAvailableChannels(sanitized)

        const hasStoredSelection = excludedChannelNames.length > 0
        if (!hasStoredSelection && channelDefaultsAppliedRef.current !== entryProfile.code) {
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
          setExcludedChannelNames(excluded)
          channelDefaultsAppliedRef.current = entryProfile.code
        }
      } catch (error) {
        console.error('chat: failed to load channel catalog', error)
      }
    }

    void loadChannelCatalog()

    return () => {
      cancelled = true
    }
  }, [entryProfile.code, excludedChannelNames.length, setExcludedChannelNames])

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
    void bundleHandle.startBundle()
  }, [bundleHandle])

  const handleClearSelection = useCallback(() => {
    bundleHandle.clearBundle()
  }, [bundleHandle])

  const handleCloseBundleDrawer = useCallback(() => {
    setBundleDrawerOpen(false)
    bundleHandle.closeBundle()
  }, [bundleHandle])

  // Effect to toggle visibility of metadataContainer based on structuredMetadataEntries
  useEffect(() => {
    let timer1: number | null = null;
    let timer2: number | null = null;

    if (structuredMetadataEntries.length > 0) {
      setShowTopSources(true); // Show "Top Sources" once there are entries

      // Set a timeout to fade out first
      timer1 = window.setTimeout(() => {
        setMetadataContainerVisible(false);
      }, 500); // Adjust this duration to match your CSS transition

      // Set another timeout to fade back in
      timer2 = window.setTimeout(() => {
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
    let processedContent = content;
    processedContent = processedContent.replace(/ICM \(Internet Capital Markets\)/g, "ICM");
    processedContent = processedContent.replace(/Internet Capital Markets \(ICM\)/g, "ICM");
    processedContent = processedContent.replace(/Internet Capital Markets/g, "ICM");
    return processedContent;
  }, []);

  const stripSourcesBlock = useCallback((content: string) => {
    if (!content) return content
    const marker = 'Fetched based on the following sources:'
    const index = content.lastIndexOf(marker)
    if (index === -1) return content
    return content.slice(0, index).trimEnd()
  }, [])

  const handleClipSelect = useCallback(
    (payload: { parent: ParsedMetadataEntryV2; clip: ClipItemV2; playback: ClipPlayback }) => {
      setSelectedClip(payload);
    },
    []
  );

  const handleCloseClipDrawer = useCallback(() => {
    setSelectedClip(null);
  }, []);

  const handleExcludedChannelsChange = useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next.filter(Boolean)));
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
    (history: MetadataMessage[]) => {
      const wireMessages = history.map((message) => ({
        role: message.role,
        content: message.content
      }))
      return {
        id,
        previewToken,
        entryProfileCode: entryProfile.code,
        channel_filter: channelFilterPayload,
        messages: wireMessages,
        chat_history: wireMessages
      }
    },
    [channelFilterPayload, entryProfile.code, id, previewToken]
  )

  const sendChatLegacy = useCallback(
    async (history: MetadataMessage[]) => {
      const payload = buildChatRequestPayload(history)
      console.debug('chat: issuing backend request', payload)
      let response: Response
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } catch (error) {
        throw error instanceof Error ? error : new Error('Failed to reach the chat service.')
      }

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(
          message ?? 'The chat service encountered an error. Please try again.'
        )
      }

      const data = await response.json().catch(() => null)
      if (!data) {
        throw new Error('The chat service returned an unexpected response.')
      }

      console.debug('chat: backend response payload', data)

      const rawAssistantContentValue =
        typeof data.response === 'string'
          ? data.response
          : data.message?.content ?? ''
      const rawAssistantContent = coerceContent(rawAssistantContentValue)

      let metadata: ParsedMetadataEntryV2[] = Array.isArray(
        data.message?.structured_metadata
      )
        ? (data.message.structured_metadata as ParsedMetadataEntryV2[])
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
        setStructuredMetadataEntries(metadata)
      }

      const sanitizedContent = processResponseContent(
        stripSourcesBlock(rawAssistantContent)
      )

      const diagnostics: DiagnosticsPayload | null =
        (data.diagnostics as DiagnosticsPayload | undefined) ?? null

      const assistantMessage: MetadataMessage = {
        id: data.message?.id || nanoid(),
        role: data.message?.role ?? 'assistant',
        content: sanitizedContent,
        structured_metadata: metadata ?? [],
        diagnostics
      }
      setMessages((prev) => [...prev, assistantMessage])
      setLastMessageRole('assistant')

      if (diagnostics) {
        setCurrentDiagnostics(diagnostics)
        if (Array.isArray(diagnostics.progress)) {
          setLiveProgress(diagnostics.progress as Array<Record<string, unknown>>)
        }
      } else {
        setCurrentDiagnostics(null)
        setLiveProgress([])
      }

      return data
    },
    [
      buildChatRequestPayload,
      processResponseContent,
      stripSourcesBlock,
      setMessages,
      setStructuredMetadataEntries,
      setLastMessageRole,
      setCurrentDiagnostics,
      setLiveProgress
    ]
  )

  // Function to parse messages and apply structured metadata
  const parseMessagesAndMetadata = useCallback(
    (messages: MetadataMessage[], metadata: ParsedMetadataEntryV2[]) => {
      console.debug('chat: parseMessagesAndMetadata invoked', { messages, metadata })
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
          if (entry && typeof entry === 'object') {
            const anyEntry = entry as Record<string, unknown>
            const identifier =
              (typeof anyEntry.id === 'string' && anyEntry.id) ||
              (typeof anyEntry.clip_id === 'string' && anyEntry.clip_id) ||
              (typeof anyEntry.url === 'string' && anyEntry.url)
            if (identifier) return identifier
            try {
              return JSON.stringify(anyEntry).slice(0, 64)
            } catch (error) {
              console.warn('chat: failed to serialize structured metadata for signature', error, anyEntry)
              return String(anyEntry)
            }
          }
          return String(entry)
        })
        .join('|')
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
    if (!structured_metadata?.length && structuredMetadataEntries.length === 0) return;
    setAvailableChannels((prev) => {
      const next = new Set(prev);
      const source = structuredMetadataEntries.length ? structuredMetadataEntries : structured_metadata;
      source?.forEach((entry) => {
        if (entry.channel) next.add(entry.channel);
      });
      const sorted = Array.from(next);
      sorted.sort((a, b) => a.localeCompare(b));
      return sorted;
    });
  }, [structuredMetadataEntries, structured_metadata]);

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

    // Fade out EmptyScreen and QuestionsOverlay
    setShowMiddlePanelOverlay(false);

    // Set a timeout to hide the EmptyScreen after the fade-out animation
    setTimeout(() => {
      setShowEmptyScreen(false);
    }, 300); // This should match the duration of the fade-out animation

    // Delay the fade-in of ChatList
    setTimeout(() => {
      setShowChatList(true); // Show ChatList with fade-in
    }, 300); // Delay should match the fade-out duration
  
    setIsProcessingQuery(true);
    setCurrentDiagnostics(null);
    setLiveProgress([]);
  
    const messageId = nanoid();
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
    setLastMessageRole('user');

    let backendPayload: unknown = null
    try {
      backendPayload = await sendChatLegacy(nextMessages)
      console.debug('chat: rendered backend payload', backendPayload)
    } catch (error) {
      console.error('chat: failed to fetch message', error)
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
        submittedMessageId: messageId
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
      <FloatingAuthCta isAuthenticated={Boolean(currentUser)} />
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
