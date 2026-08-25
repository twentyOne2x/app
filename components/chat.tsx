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
import MetadataCatalog from '@/components/metadata-catalog'
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
  normalizeMetadataEntries,
  normalizeAliasesInText,
  parseYouTubeIdFromString,
  parseMetadataEntriesV2FromFinalKept,
  type BackendFinalClip,
  type ParsedMetadataEntryV2,
  type ClipItemV2
} from '@/lib/utils';
import { coerceContent, isRenderableMessage } from '@/lib/coerce-content';
import Modal from '@/components/Modal'; // Import the Modal component
import { useEntryProfile } from '@/components/entry-profile-context';
import type { DiagnosticsPayload, ChannelFilterPayload, ProgressStageStatus } from '@/lib/types';
import { useClipSelection } from '@/lib/hooks/use-clip-selection'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DEFAULT_PIPELINE, formatDuration, normalizeProgress } from '@/lib/progress-display'
import type { DisplayStage } from '@/lib/progress-display'
import { useHeaderExtras } from '@/components/header-extras-context'
import {
  CHAT_ACCESS_HEADER,
  buildDefaultChatAccessState,
  type ChatAccessState
} from '@/lib/chat-access-shared'

type ChannelOption = {
  id?: string | null
  name: string
}

const channelOptionKey = (option: ChannelOption): string =>
  option.id ? `id:${option.id}` : `name:${option.name.trim().toLowerCase()}`

type StageMeta = Record<string, unknown>

function formatNumeric(value: unknown, digits = 2): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(digits)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function formatCount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function stageStatusMarker(status: ProgressStageStatus): string {
  switch (status) {
    case 'completed':
      return '[x]'
    case 'running':
      return '[>]'
    case 'skipped':
      return '[-]'
    case 'error':
      return '[!]'
    default:
      return '[ ]'
  }
}

function extractReason(meta: StageMeta | undefined): string | null {
  if (!meta) return null
  if (typeof meta.reason === 'string' && meta.reason.trim()) return meta.reason.trim()
  if (typeof meta.skip_reason === 'string' && meta.skip_reason.trim()) return meta.skip_reason.trim()
  return null
}

type YoutubeIndexTarget = {
  videoUrls: string[]
  channel: string | null
  label: string
}

function extractYoutubeIndexTarget(text: string | null | undefined): YoutubeIndexTarget | null {
  const raw = typeof text === 'string' ? text : ''
  const trimmed = raw.trim()
  if (!trimmed) return null

  const urls = Array.from(trimmed.matchAll(/https?:\/\/[^\s)\]]+/g)).map((m) => m[0])
  const ytUrls = urls.filter((u) => /youtube\.com|youtu\.be/i.test(u))

  const videoUrls: string[] = []
  let channel: string | null = null

  for (const u of ytUrls) {
    const lower = u.toLowerCase()
    if (lower.includes('youtube.com/watch') || lower.includes('youtu.be/')) {
      const id = parseYouTubeIdFromString(u)
      videoUrls.push(id ? `https://www.youtube.com/watch?v=${id}` : u)
      continue
    }
    if (lower.includes('youtube.com/@') || lower.includes('youtube.com/channel/')) {
      channel = u
    }
  }

  if (!channel) {
    const tokens = trimmed.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    const handle = tokens.find((t) => /^@[A-Za-z0-9_.-]{3,}$/.test(t)) ?? null
    if (handle) channel = handle
  }

  if (!videoUrls.length && !channel) return null

  if (videoUrls.length) {
    const label = videoUrls.length === 1 ? 'Index YouTube video' : `Index ${videoUrls.length} YouTube videos`
    return { videoUrls, channel: null, label }
  }
  return { videoUrls: [], channel, label: 'Index YouTube channel' }
}

function describeStageStatus(stage: DisplayStage): string {
  const duration = formatDuration(stage.durationMs)
  const meta = stage.meta as StageMeta | undefined
  const reason = extractReason(meta)
  switch (stage.status) {
    case 'completed':
      return duration ? `completed in ${duration}` : 'completed'
    case 'running':
      return 'running'
    case 'skipped':
      return reason ? `skipped — ${reason}` : 'skipped'
    case 'error':
      return reason ? `error — ${reason}` : 'error'
    default:
      return 'pending'
  }
}

function formatSourceEntry(entry: unknown, fallbackKey: string): string | null {
  if (!entry || typeof entry !== 'object') return null
  const title = typeof (entry as { title?: unknown }).title === 'string' ? (entry as { title: string }).title : null
  const channel = typeof (entry as { channel?: unknown }).channel === 'string' ? (entry as { channel: string }).channel : null
  const scoreRaw = (entry as { score?: unknown }).score
  const score = formatNumeric(scoreRaw)
  const parts = []
  if (title) parts.push(title)
  if (channel) parts.push(`@${channel}`)
  if (score) parts.push(`score ${score}`)
  if (!parts.length) return fallbackKey
  return parts.join(' · ')
}

function formatSourceList(value: unknown, limit = 3): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const entries = value
    .slice(0, limit)
    .map((item, index) => formatSourceEntry(item, `source-${index + 1}`))
    .filter((item): item is string => Boolean(item && item.trim()))
  if (!entries.length) return null
  return entries.join('; ')
}

function formatRetrieveDetails(meta: StageMeta): string[] {
  const details: string[] = []
  const initialCount = formatCount(meta.initial_candidates)
  const similarityTopK = formatCount(meta.similarity_top_k ?? meta.top_k)
  const scoreMin = formatNumeric(meta.score_min)
  const scoreMax = formatNumeric(meta.score_max)
  if (initialCount) {
    details.push(`initial candidates: ${initialCount}`)
  }
  if (similarityTopK) {
    details.push(`similarity top-k: ${similarityTopK}`)
  }
  if (scoreMin || scoreMax) {
    details.push(`score range: ${scoreMin ?? '—'} to ${scoreMax ?? '—'}`)
  }
  const topSources = formatSourceList(meta.top_sources)
  if (topSources) {
    details.push(`top matches: ${topSources}`)
  }
  const entityGate =
    meta.entity_gate && typeof meta.entity_gate === 'object' ? (meta.entity_gate as StageMeta) : null
  if (entityGate) {
    const required = Array.isArray(entityGate.required_entities) ? entityGate.required_entities : null
    const requiredLabel = required && required.length ? required.join(', ') : null
    const applied = Boolean(entityGate.applied)
    if (requiredLabel) {
      details.push(`entity gate required: ${requiredLabel} (${applied ? 'applied' : 'not applied'})`)
    }
    if (applied) {
      const kept = formatCount(entityGate.kept)
      if (kept === '0') {
        details.push('entity gate filtered out all clips')
      }
    }
  }
  return details
}

function formatRerankDetails(meta: StageMeta): string[] {
  const details: string[] = []
  const kept = formatCount(meta.kept_after_ce ?? meta.kept)
  const pcut = formatNumeric(meta.pcut)
  const model = typeof meta.model === 'string' ? meta.model : null
  const batchSize = formatCount(meta.batch_size)
  if (kept || pcut) {
    details.push(`kept clips: ${kept ?? '?'}` + (pcut ? ` (pcut ${pcut})` : ''))
  }
  if (model || batchSize) {
    details.push(
      `${model ? `model ${model}` : ''}${model && batchSize ? ' · ' : ''}${batchSize ? `batch ${batchSize}` : ''}`.trim()
    )
  }
  const keptSources = formatSourceList(meta.kept_sources)
  if (keptSources) {
    details.push(`kept sources: ${keptSources}`)
  }
  return details
}

function formatReviewDetails(stageKey: string, meta: StageMeta): string[] {
  const details: string[] = []
  const inputCount = formatCount(meta.input_count)
  const outputCount = formatCount(meta.output_count ?? meta.final_candidates)
  if (inputCount || outputCount) {
    details.push(`clips ${inputCount ?? '?'} -> ${outputCount ?? '?'}`)
  }
  const sampleField =
    stageKey === 'review_docs' ? meta.sample_sources ?? meta.cleaned_sources : meta.final_candidates
  const sample = formatSourceList(sampleField)
  if (sample) {
    details.push(
      (stageKey === 'review_docs' ? 'cleaned clips: ' : 'final candidates: ') + sample
    )
  }
  return details
}

function formatSynthesizeDetails(meta: StageMeta): string[] {
  const details: string[] = []
  const model = typeof meta.llm_model === 'string' ? meta.llm_model : null
  const tokens = formatCount(meta.tokens_estimate ?? meta.total_tokens)
  if (model || tokens) {
    details.push(
      `${model ? `model ${model}` : ''}${model && tokens ? ' · ' : ''}${tokens ? `~${tokens} tokens` : ''}`.trim()
    )
  }
  const finalSources = formatSourceList(meta.final_sources)
  if (finalSources) {
    details.push(`answer sources: ${finalSources}`)
  }
  return details
}

function formatStageLines(stage: DisplayStage): string[] {
  const lines: string[] = []
  const meta = (stage.meta ?? {}) as StageMeta
  const header = `${stageStatusMarker(stage.status)} ${stage.label} — ${describeStageStatus(stage)}`
  lines.push(header)

  let detailLines: string[] = []
  switch (stage.key) {
    case 'retrieve':
      detailLines = formatRetrieveDetails(meta)
      break
    case 'rerank':
    case 'rerank_cross_encoder':
      detailLines = formatRerankDetails(meta)
      break
    case 'review':
    case 'review_docs':
    case 'stitch':
      detailLines = formatReviewDetails(stage.key, meta)
      break
    case 'synthesize':
    case 'synth':
      detailLines = formatSynthesizeDetails(meta)
      break
    default:
      detailLines = []
      break
  }

  if (stage.status === 'skipped' && detailLines.length === 0) {
    const reason = extractReason(meta)
    if (reason) {
      detailLines.push(reason)
    }
  }

  detailLines.forEach((detail) => {
    lines.push(`    - ${detail}`)
  })

  return lines
}

function formatProgressMetadata(meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return []
  const lines: string[] = []
  Object.entries(meta).forEach(([key, value]) => {
    if (value == null) return
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
      return
    }
    if (Array.isArray(value)) {
      if (!value.length) return
      const printable = value
        .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
        .slice(0, 5)
        .map((item) => item.toString())
      if (!printable.length) return
      const suffix = value.length > printable.length ? ', ...' : ''
      lines.push(`${key}: [${printable.join(', ')}${suffix}]`)
      return
    }
    if (typeof value === 'object') {
      const nestedKeys = Object.keys(value as Record<string, unknown>)
      if (!nestedKeys.length) return
      const preview = nestedKeys.slice(0, 5).join(', ')
      const suffix = nestedKeys.length > 5 ? ', ...' : ''
      lines.push(`${key}: { ${preview}${suffix} }`)
    }
  })
  return lines
}

function coerceProgressStage(stage: Record<string, unknown>): Record<string, unknown> {
  const payload =
    stage.event && typeof stage.event === 'object' && !Array.isArray(stage.event)
      ? (stage.event as Record<string, unknown>)
      : stage

  const next: Record<string, unknown> = { ...payload }

  const metadata = payload.metadata
  const existingMeta =
    payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? (payload.meta as Record<string, unknown>)
      : {}

  const mergedMeta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...existingMeta, ...(metadata as Record<string, unknown>) }
      : existingMeta

  if (stage.type && typeof stage.type === 'string') {
    mergedMeta.event_type = stage.type
  }

  if (stage.timestamp && typeof stage.timestamp === 'string') {
    mergedMeta.event_timestamp = stage.timestamp
  }

  if (Object.keys(mergedMeta).length > 0) {
    next.meta = mergedMeta
  }

  if (typeof payload.name === 'string' && typeof next.stage !== 'string') {
    next.stage = payload.name
  }
  if (typeof payload.stage === 'string' && typeof next.name !== 'string') {
    next.name = payload.stage
  }

  return next
}

function coerceProgressArray(progress: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(progress)) return []
  return progress
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => coerceProgressStage(entry as Record<string, unknown>))
}

// Extend the Message type to include structured_metadata
export interface MetadataMessage extends Message {
  structured_metadata?: ParsedMetadataEntryV2[]; // Ideally, define a more specific type instead of any[]
  diagnostics?: DiagnosticsPayload | null;
}

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview'

type ErrorPayload = {
  code: string | null
  message: string | null
}

class ChatRequestError extends Error {
  status: number
  code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ChatRequestError'
    this.status = status
    this.code = code
  }
}

function parseAccessStateHeader(response: Response): ChatAccessState | null {
  const raw = response.headers.get(CHAT_ACCESS_HEADER)
  if (!raw) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ChatAccessState>
    if (!parsed || typeof parsed !== 'object') return null
    return buildDefaultChatAccessState({
      isAuthenticated: Boolean(parsed.isAuthenticated),
      previewMessagesUsed:
        typeof parsed.previewMessagesUsed === 'number' ? parsed.previewMessagesUsed : 0,
      previewMessagesLimit:
        typeof parsed.previewMessagesLimit === 'number'
          ? parsed.previewMessagesLimit
          : undefined,
      previewMessagesRemaining:
        typeof parsed.previewMessagesRemaining === 'number'
          ? parsed.previewMessagesRemaining
          : undefined,
      requiresAuth: Boolean(parsed.requiresAuth)
    })
  } catch (error) {
    console.warn('chat: failed to parse access-state response header', error)
    return null
  }
}

async function extractErrorPayload(response: Response): Promise<ErrorPayload> {
  try {
    const cloned = response.clone()
    const data = await cloned.json()
    if (typeof data === 'string' && data.trim()) {
      return { code: null, message: data.trim() }
    }
    if (data && typeof data === 'object') {
      const code =
        typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : null
      const maybeMessage =
        (typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message?: string }).message
          : null) ??
        code
      if (maybeMessage && maybeMessage.trim()) {
        return { code, message: maybeMessage.trim() }
      }
    }
  } catch {
    // fall through to text handling
  }

  try {
    const text = await response.text()
    const trimmed = text.trim()
    if (trimmed) return { code: null, message: trimmed }
  } catch {
    // ignore
  }

  if (response.statusText) return { code: null, message: response.statusText }
  if (response.status) return { code: null, message: `Request failed with status ${response.status}` }
  return { code: null, message: null }
}

function AuthButtonsCallout({
  className,
  callbackUrl
}: {
  className?: string
  callbackUrl: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center text-zinc-300', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <LoginButton
          loginType="twitter"
          text="Twitter"
          callbackUrl={callbackUrl}
          showIcon
          size="sm"
          className="min-w-[112px] justify-center px-4"
        />
        <LoginButton
          loginType="google"
          text="Google"
          callbackUrl={callbackUrl}
          showIcon
          size="sm"
          className="min-w-[112px] justify-center px-4"
        />
      </div>
      <p className="max-w-[320px] text-xs text-zinc-400">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
          Connect to continue
        </span>
        Sign in with a configured provider to query, save history, export data, and create clips.
      </p>
    </div>
  )
}

function RightPanelAuthCta({
  isAuthenticated,
  callbackUrl
}: {
  isAuthenticated: boolean
  callbackUrl: string
}) {
  if (isAuthenticated) return null

  return (
    <div className="mb-4 flex flex-col items-center rounded-xl border border-white/10 bg-black/40 p-4 text-center shadow-[0_18px_38px_-22px_rgba(34,197,94,0.35)]">
      <AuthButtonsCallout callbackUrl={callbackUrl} />
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
  shareHeader?: React.ReactNode
  accessState?: ChatAccessState
}

export function Chat({
  id,
  initialMessages,
  className,
  showQuestionsOverlay = true,
  shared_chat = false,
  structured_metadata = [], // Initialize structured_metadata with an empty array
  noPaddingTop = false, // New boolean prop for bottom padding
  currentUser = null,
  shareHeader,
  accessState
}: ChatProps) {
  const [previewToken, setPreviewToken] = useLocalStorage<string | null>(
    'ai-token',
    null
  )
  const entryProfile = useEntryProfile();
  const [channelCatalogCache, setChannelCatalogCache] = useLocalStorage<ChannelOption[]>(
    `channel-catalog:${entryProfile.code}`,
    []
  )
  const sanitizedStructuredMetadata = useMemo(
    () => normalizeMetadataEntries(structured_metadata),
    [structured_metadata]
  )
  const router = useRouter();
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setShareControl } = useHeaderExtras()
  const callbackUrl = useMemo(() => {
    const query = searchParams?.toString()
    return `${pathname || '/'}${query ? `?${query}` : ''}`
  }, [pathname, searchParams])

  // State to hold structured metadata entries
  const [structuredMetadataEntries, setStructuredMetadataEntries] = useState<ParsedMetadataEntryV2[]>(sanitizedStructuredMetadata);
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
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [ytIndexStatus, setYtIndexStatus] = useState<
    { state: 'idle' | 'running' | 'done' | 'error'; message?: string }
  >({ state: 'idle' });
  const [selectedClip, setSelectedClip] = useState<{
    parent: ParsedMetadataEntryV2
    clip: ClipItemV2
    playback: ClipPlayback
    intent: 'play' | 'edit'
  } | null>(null);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [currentDiagnostics, setCurrentDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [liveProgress, setLiveProgress] = useState<Array<Record<string, unknown>>>([]);
  const [input, setInput] = useState('');
  const [chatAccessState, setChatAccessState] = useState<ChatAccessState>(() => {
    if (accessState) return accessState
    return buildDefaultChatAccessState({
      isAuthenticated: Boolean(currentUser?.id)
    })
  })
  const [availableChannels, setAvailableChannels] = useState<ChannelOption[]>(channelCatalogCache);
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
  const currentStreamAbortRef = useRef<AbortController | null>(null)
  const currentTraceIdRef = useRef<string | null>(null)
  const requiresAuthToContinue = !chatAccessState.isAuthenticated && chatAccessState.requiresAuth

  const channelFilterStorageKey = useMemo(
    () => `channel-filter:${entryProfile.code}`,
    [entryProfile.code]
  );
  const [excludedChannelKeys, setExcludedChannelKeys] = useLocalStorage<string[]>(
    channelFilterStorageKey,
    []
  );

  useEffect(() => {
    if (!channelCatalogCache.length) return
    setAvailableChannels(channelCatalogCache)
  }, [channelCatalogCache])

  useEffect(() => {
    console.debug('chat: component mounted', {
      entryProfileCode: entryProfile.code,
      shared_chat,
      chatId: id ?? null
    })
    return () => {
      currentStreamAbortRef.current?.abort()
      currentStreamAbortRef.current = null
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
    setChatAccessState(
      accessState ??
        buildDefaultChatAccessState({
          isAuthenticated: Boolean(currentUser?.id)
        })
    )
  }, [accessState, currentUser?.id])

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
      count: excludedChannelKeys.length,
      excluded: excludedChannelKeys
    })
  }, [excludedChannelKeys])

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
    setExcludedChannelKeys((prev) => {
      if (!prev?.length) return prev ?? []
      const availableSet = new Set(availableChannels.map((option) => channelOptionKey(option)))
      const filtered = prev.filter((key) => availableSet.has(key))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [availableChannels, setExcludedChannelKeys])

  useEffect(() => {
    const now = Date.now()
    const state = channelCatalogStateRef.current
    const sameProfile = state.code === entryProfile.code
    const hasStoredSelection = excludedChannelKeys.length > 0
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

        const optionMap = new Map<string, ChannelOption>()
        for (const entry of channelEntries) {
          if (typeof entry === 'string') {
            const name = entry.trim()
            if (!name) continue
            const option: ChannelOption = { name }
            optionMap.set(channelOptionKey(option), option)
          } else if (entry && typeof entry === 'object') {
            const rawName = typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name.trim() : ''
            if (!rawName) continue
            const id = typeof (entry as { id?: unknown }).id === 'string' ? (entry as { id: string }).id : undefined
            const option: ChannelOption = { name: rawName, id }
            optionMap.set(channelOptionKey(option), option)
          }
        }

        const sanitizedOptions = Array.from(optionMap.values()).sort((a, b) => a.name.localeCompare(b.name))
        console.debug('chat: channel catalog sanitized', {
          traceId: currentTraceIdRef.current,
          receivedCount: channelEntries.length,
          sanitizedCount: sanitizedOptions.length
        })
        if (!sanitizedOptions.length) return

        let catalogUpdated = false
        setAvailableChannels((prev) => {
          const sameLength = prev.length === sanitizedOptions.length
          const sameContent =
            sameLength &&
            prev.every((option, idx) => {
              const next = sanitizedOptions[idx]
              return channelOptionKey(option) === channelOptionKey(next) && option.name === next.name
            })
          if (sameContent) {
            console.debug('chat: channel catalog unchanged', {
              traceId: currentTraceIdRef.current,
              count: sanitizedOptions.length
            })
            return prev
          }
          catalogUpdated = true
          console.debug('chat: channel catalog updated', {
            traceId: currentTraceIdRef.current,
            previousCount: prev.length,
            nextCount: sanitizedOptions.length
          })
          return sanitizedOptions
        })
        if (catalogUpdated) {
          setChannelCatalogCache(sanitizedOptions)
        }

        let defaultsApplied = state.defaultsApplied
        const hasStoredSelectionNow = excludedChannelKeys.length > 0
        if (!hasStoredSelectionNow && channelDefaultsAppliedRef.current !== entryProfile.code) {
          const sanitizedNames = sanitizedOptions.map((option) => option.name)
          const defaultsSource =
            (data as { defaultSelected?: unknown }).defaultSelected ??
            (data as { default_selected?: unknown }).default_selected ??
            sanitizedNames
          const defaults = Array.isArray(defaultsSource)
            ? (defaultsSource as unknown[])
                .map((name) => (typeof name === 'string' ? name.trim() : ''))
                .filter((name): name is string => Boolean(name))
            : sanitizedNames
          const defaultSet = new Set<string>(defaults)
          const excludedKeys = sanitizedOptions
            .filter((option) => !defaultSet.has(option.name))
            .map((option) => channelOptionKey(option))
          console.debug('chat: applying default channel selection', {
            traceId: currentTraceIdRef.current,
            defaultCount: defaults.length,
            excludedCount: excludedKeys.length
          })
          setExcludedChannelKeys(excludedKeys)
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
    excludedChannelKeys,
    availableChannels.length,
    setExcludedChannelKeys,
    setChannelCatalogCache
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

  const resetConversationState = useCallback(
    (options?: { keepInput?: boolean; silent?: boolean }) => {
      currentStreamAbortRef.current?.abort()
      currentStreamAbortRef.current = null
      setIsProcessingQuery(false)
      setCurrentDiagnostics(null)
      setLiveProgress([])
      setSelectedClip(null)
      setIsModalOpen(false)
      setSourcesCollapsed(false)
      setStructuredMetadataEntries([])
      setShowTopSources(false)
      setMessages([])
      setLastMessageRole('assistant')
      if (!options?.silent) {
        setShowMiddlePanelOverlay(true)
        setShowEmptyScreen(true)
        setShowChatList(false)
        setFadeOutCompleted(true)
      }
      setMetadataContainerVisible(false)
      setShowLeftPanelOverlay(false)
      setBundleDrawerOpen(false)
      const hasBundleItems = Array.isArray(bundleHandle.state?.items) && bundleHandle.state.items.length > 0
      if (hasBundleItems || clipSelection.selectionCount > 0) {
        bundleHandle.clearBundle()
      }
      if (!options?.keepInput) {
        setInput('')
      }
    },
    [
      bundleHandle,
      clipSelection.selectionCount,
      setSelectedClip,
      setIsModalOpen,
      setStructuredMetadataEntries,
      setShowTopSources,
      setMessages,
      setLastMessageRole,
      setShowMiddlePanelOverlay,
      setShowEmptyScreen,
      setShowChatList,
      setFadeOutCompleted,
      setMetadataContainerVisible,
      setShowLeftPanelOverlay,
      setBundleDrawerOpen,
      setInput
    ]
  )

  const handleClearChat = useCallback(() => {
    resetConversationState()
    router.refresh()
    router.push('/')
  }, [resetConversationState, router])

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

    const quotePattern = /(\s*)"([^"]+)"(\s*\([^)]*\))?/g
    processedContent = processedContent.replace(quotePattern, (_match, leading: string, quotedText: string, trailing: string | undefined) => {
      const displayQuote = quotedText.trim()
      if (!displayQuote) return _match

      const normalizedLeading = leading ? (leading.includes('\n') ? ' ' : leading) : ''
      const suffix = trailing ? ` ${trailing.replace(/\s+/g, ' ').trim()}` : ''

      return `${normalizedLeading}<span class="quote-chip">“${displayQuote}”${suffix}</span>`
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
    (
      payload: { parent: ParsedMetadataEntryV2; clip: ClipItemV2; playback: ClipPlayback },
      intent: 'play' | 'edit'
    ) => {
      console.debug('chat: clip selected', {
        traceId: currentTraceIdRef.current,
        parentTitle: payload.parent?.parentTitle ?? null,
        clipStart: payload.clip?.startHMS ?? null,
        clipUrl: payload.clip?.url ?? null,
        intent
      })
      setSelectedClip({ ...payload, intent })
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
      setExcludedChannelKeys(unique);
    },
    [setExcludedChannelKeys]
  );

  const selectedChannelOptions = useMemo(() => {
    if (!availableChannels.length) return []
    const excludedSet = new Set(excludedChannelKeys.filter(Boolean))
    return availableChannels.filter((option) => !excludedSet.has(channelOptionKey(option)))
  }, [availableChannels, excludedChannelKeys])

  useEffect(() => {
    if (!availableChannels.length) return
    console.debug('chat: channel catalog updated', {
      totalAvailable: availableChannels.length,
      selected: selectedChannelOptions.map((option) => option.name),
      excludedKeys: excludedChannelKeys
    })
  }, [availableChannels, selectedChannelOptions, excludedChannelKeys])

  const channelFilterPayload = useMemo<ChannelFilterPayload | undefined>(() => {
    if (!availableChannels.length) return undefined
    if (selectedChannelOptions.length === 0) {
      return { include_names: [] }
    }
    const includeIds = selectedChannelOptions
      .map((option) => option.id)
      .filter((id): id is string => Boolean(id))
    // Always include names as well as ids so we still match older/partial payloads
    // where `channel_id` was not populated consistently.
    const includeNames = selectedChannelOptions
      .map((option) => option.name)
      .map((name) => name.trim())
      .filter(Boolean)
    const payload: ChannelFilterPayload = {}
    if (includeIds.length) payload.include_ids = includeIds
    if (includeNames.length) payload.include_names = includeNames
    if (!payload.include_ids && !payload.include_names) {
      payload.include_names = []
    }
    return payload
  }, [availableChannels, selectedChannelOptions])

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
      const aliasNormalizedContent = normalizeAliasesInText(rawAssistantContent)

      const diagnosticsRaw: DiagnosticsPayload | null =
        (data.diagnostics as DiagnosticsPayload | undefined) ??
        ((data.message as { diagnostics?: DiagnosticsPayload })?.diagnostics ?? null)

      let metadata: ParsedMetadataEntryV2[] = Array.isArray(
        data.message && typeof data.message === 'object'
          ? (data.message as { structured_metadata?: unknown }).structured_metadata
          : null
      )
        ? ((data.message as { structured_metadata: ParsedMetadataEntryV2[] }).structured_metadata)
        : Array.isArray(data.structured_metadata)
        ? (data.structured_metadata as ParsedMetadataEntryV2[])
        : []

      if ((!metadata || metadata.length === 0) && diagnosticsRaw) {
        const finalKept = (diagnosticsRaw as { final_kept?: unknown }).final_kept
        if (Array.isArray(finalKept) && finalKept.length) {
          const parsed = parseMetadataEntriesV2FromFinalKept(finalKept as BackendFinalClip[])
          if (parsed.length) metadata = parsed
        }
      }

      if ((!metadata || metadata.length === 0) && Array.isArray((data as { final_kept?: unknown }).final_kept)) {
        const parsed = parseMetadataEntriesV2FromFinalKept(
          (data as { final_kept: BackendFinalClip[] }).final_kept
        )
        if (parsed.length) metadata = parsed
      }

      if ((!metadata || metadata.length === 0) && aliasNormalizedContent) {
        const sourcesBlock = extractSourcesBlock(aliasNormalizedContent) ?? ''
        if (sourcesBlock) {
          metadata = parseMetadata(sourcesBlock, aliasNormalizedContent)
        }
      }

      if (metadata.length && diagnosticsRaw) {
        const finalKept = (diagnosticsRaw as { final_kept?: unknown }).final_kept
        if (Array.isArray(finalKept) && finalKept.length) {
          const parsed = parseMetadataEntriesV2FromFinalKept(finalKept as BackendFinalClip[])
          if (parsed.length) {
            const byParent = new Map<string, ParsedMetadataEntryV2>()
            parsed.forEach(entry => {
              const key = entry.parentId ?? entry.videoId ?? `${entry.parentTitle}|||${entry.channel}`
              if (key) byParent.set(key, entry)
            })

            metadata = metadata.map(entry => {
              const key = entry.parentId ?? entry.videoId ?? `${entry.parentTitle}|||${entry.channel}`
              const enrich = key ? byParent.get(key) : undefined
              if (!enrich) return entry
              return {
                ...entry,
                videoId: entry.videoId ?? enrich.videoId,
                parentId: entry.parentId ?? enrich.parentId,
                channelName: entry.channelName ?? enrich.channelName,
                channelId: entry.channelId ?? enrich.channelId,
                publishedAt: entry.publishedAt ?? enrich.publishedAt,
                publishedDate: entry.publishedDate ?? enrich.publishedDate,
                thumbnailUrl: entry.thumbnailUrl ?? enrich.thumbnailUrl,
                durationS: entry.durationS ?? enrich.durationS,
                clips: entry.clips.map(clip => {
                  const clipKey = clip.segmentId ?? clip.id ?? clip.parentId ?? clip.videoId
                  const enrichClip = enrich.clips.find(c => (c.segmentId ?? c.id ?? c.parentId ?? c.videoId) === clipKey)
                  if (!enrichClip) return clip
                  return {
                    ...clip,
                    videoId: clip.videoId ?? enrichClip.videoId,
                    parentId: clip.parentId ?? enrichClip.parentId,
                    channelName: clip.channelName ?? enrichClip.channelName,
                    channelId: clip.channelId ?? enrichClip.channelId,
                    publishedAt: clip.publishedAt ?? enrichClip.publishedAt,
                    publishedDate: clip.publishedDate ?? enrichClip.publishedDate,
                    thumbnailUrl: clip.thumbnailUrl ?? enrichClip.thumbnailUrl,
                    durationS: clip.durationS ?? enrichClip.durationS
                  }
                })
              }
            })
          }
        }
      }

      const normalizedMetadata = metadata?.length ? normalizeMetadataEntries(metadata) : []

      // Always update the right rail state so we never render stale sources from the
      // previous request (ex: metadata-only queries that return catalog results).
      setStructuredMetadataEntries(normalizedMetadata)
      if (normalizedMetadata.length) {
        console.debug('chat: structured metadata received', {
          traceId,
          count: normalizedMetadata.length
        })
      } else {
        console.debug('chat: no structured metadata present', {
          traceId
        })
      }

      const sanitizedContent = processResponseContent(
        stripSourcesBlock(aliasNormalizedContent)
      )

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

      const normalizedProgressEntries = coerceProgressArray(diagnosticsRaw?.progress)
      const normalizedDiagnostics = diagnosticsRaw
        ? { ...diagnosticsRaw, progress: normalizedProgressEntries as DiagnosticsPayload['progress'] }
        : null

      const assistantMessage: MetadataMessage = {
        id:
          (data.message as { id?: string })?.id ??
          (typeof data.id === 'string' ? data.id : undefined) ??
          nanoid(),
        role: safeRole,
        content: sanitizedContent,
        structured_metadata: normalizedMetadata,
        diagnostics: normalizedDiagnostics
      }

      // If the model is explicitly declining due to lack of context, default to hiding sources.
      // Users can still expand sources manually.
      const noContextPattern =
        /(context provided does not contain any information|not possible to provide|cannot provide.*citations|i don['’]t have enough high-quality clips)/i
      const retrieveStage = normalizedDiagnostics?.progress?.find((entry) => {
        const candidate = entry as Record<string, unknown>
        const name = candidate?.name ?? candidate?.stage
        return name === 'retrieve'
      }) as Record<string, unknown> | undefined
      const retrieveMeta = ((retrieveStage as any)?.meta ?? (retrieveStage as any)?.metadata ?? {}) as Record<string, unknown>
      const initialCandidates =
        typeof retrieveMeta.initial_candidates === 'number'
          ? retrieveMeta.initial_candidates
          : typeof retrieveMeta.initialCandidates === 'number'
            ? retrieveMeta.initialCandidates
            : null
      const shouldCollapseSources =
        normalizedMetadata.length > 0 &&
        (Boolean((normalizedDiagnostics as any)?.early_abort) ||
          initialCandidates === 0 ||
          noContextPattern.test(String(sanitizedContent)))
      setSourcesCollapsed(shouldCollapseSources)

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

     if (normalizedDiagnostics) {
        console.debug('chat: diagnostics payload applied', {
          traceId,
          progressCount: Array.isArray(normalizedDiagnostics.progress)
            ? normalizedDiagnostics.progress.length
            : 0
        })
        setCurrentDiagnostics(normalizedDiagnostics)
        setLiveProgress(normalizedProgressEntries)
        assistantMessage.diagnostics = normalizedDiagnostics
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

  const sendChatStream = useCallback(
    async (history: MetadataMessage[], clientTraceId: string) => {
      const traceId = clientTraceId ?? 'stream'
      const payload = buildChatRequestPayload(history, { clientTraceId: traceId })
      console.debug('chat: initiating streaming request', {
        traceId,
        messageCount: history.length,
        channelFilter: payload.channel_filter
      })

      const controller = new AbortController()
      currentStreamAbortRef.current?.abort()
      currentStreamAbortRef.current = controller

      let response: Response
      try {
        response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') {
          console.debug('chat: streaming request aborted', { traceId })
        } else {
          console.error('chat: streaming request failed to reach backend', { traceId }, error)
        }
        currentStreamAbortRef.current = null
        throw error instanceof Error ? error : new Error('Streaming request failed.')
      }

      const nextAccessState = parseAccessStateHeader(response)
      if (nextAccessState) {
        setChatAccessState(nextAccessState)
      }

      if (!response.ok || !response.body) {
        const errorPayload = await extractErrorPayload(response)
        currentStreamAbortRef.current = null
        throw new ChatRequestError(
          errorPayload.message ?? 'Streaming request failed.',
          response.status,
          errorPayload.code
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalPayload: Record<string, unknown> | null = null

      const commitProgress = (stage: Record<string, unknown>) => {
        const normalizedStage = coerceProgressStage(stage)
        const stageKey =
          typeof normalizedStage.name === 'string'
            ? normalizedStage.name
            : typeof normalizedStage.stage === 'string'
              ? normalizedStage.stage
              : undefined

        setLiveProgress((prev) => {
          const updated = [...prev]
          if (stageKey) {
            const index = updated.findIndex((entry) => {
              if (!entry || typeof entry !== 'object') return false
              const candidate = entry as { name?: unknown; stage?: unknown }
              return candidate.name === stageKey || candidate.stage === stageKey
            })
            if (index >= 0) {
              const existingEntry = updated[index] as Record<string, unknown>
              const existingMeta =
                existingEntry &&
                typeof (existingEntry as { meta?: unknown }).meta === 'object' &&
                !Array.isArray((existingEntry as { meta?: unknown }).meta)
                  ? ((existingEntry as { meta: Record<string, unknown> }).meta)
                  : undefined
              const incomingMeta =
                typeof (normalizedStage as { meta?: unknown }).meta === 'object' &&
                !Array.isArray((normalizedStage as { meta?: unknown }).meta)
                  ? ((normalizedStage as { meta: Record<string, unknown> }).meta)
                  : undefined
              const mergedMeta =
                existingMeta || incomingMeta
                  ? { ...(existingMeta ?? {}), ...(incomingMeta ?? {}) }
                  : undefined
              updated[index] = {
                ...existingEntry,
                ...normalizedStage,
                ...(mergedMeta ? { meta: mergedMeta } : {})
              }
            } else {
              updated.push(normalizedStage)
            }
          } else {
            updated.push(normalizedStage)
          }

          const normalizedProgress = updated.map((entry) =>
            coerceProgressStage(entry as Record<string, unknown>)
          )
          setCurrentDiagnostics((prevDiagnostics) => ({
            ...(prevDiagnostics ?? {}),
            progress: normalizedProgress as DiagnosticsPayload['progress']
          }))
          return normalizedProgress
        })
      }

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          while (true) {
            const separatorIndex = buffer.indexOf('\n\n')
            if (separatorIndex === -1) break

            const rawEvent = buffer.slice(0, separatorIndex)
            buffer = buffer.slice(separatorIndex + 2)

            const dataPayload = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('')

            if (!dataPayload) continue

            let eventData: Record<string, unknown>
            try {
              eventData = JSON.parse(dataPayload)
            } catch (error) {
              console.error('chat: failed to parse streaming payload', { traceId, rawEvent: dataPayload }, error)
              continue
            }

            const eventType = eventData.type
            if (eventType === 'progress') {
              const stage =
                eventData.event && typeof eventData.event === 'object'
                  ? (eventData.event as Record<string, unknown>)
                  : null
              if (stage) {
                commitProgress(stage)
              }
            } else if (eventType === 'result') {
              await reader.cancel().catch(() => undefined)
              const resultDiagnostics =
                eventData.diagnostics && typeof eventData.diagnostics === 'object'
                  ? (eventData.diagnostics as DiagnosticsPayload)
                  : null
              const normalizedProgressEntries = coerceProgressArray(resultDiagnostics?.progress)
              setLiveProgress(normalizedProgressEntries)
              const normalizedDiagnostics = resultDiagnostics
                ? {
                    ...resultDiagnostics,
                    progress: normalizedProgressEntries as DiagnosticsPayload['progress']
                  }
                : null
              setCurrentDiagnostics(normalizedDiagnostics)

              let structuredMetadata: ParsedMetadataEntryV2[] = Array.isArray(
                (eventData as { structured_metadata?: unknown }).structured_metadata
              )
                ? ((eventData as { structured_metadata: ParsedMetadataEntryV2[] }).structured_metadata)
                : []

              if (!structuredMetadata.length && typeof eventData.formatted_metadata === 'string') {
                structuredMetadata = parseMetadata(eventData.formatted_metadata, String(eventData.response ?? ''))
              }

              const normalizedStructuredMetadata = structuredMetadata.length
                ? normalizeMetadataEntries(structuredMetadata)
                : []

              const finalData: Record<string, unknown> = {
                response: eventData.response,
                message: {
                  id: (eventData as { message_id?: string }).message_id ?? undefined,
                  role: 'assistant',
                  content: eventData.response,
                  structured_metadata: normalizedStructuredMetadata
                },
                structured_metadata: normalizedStructuredMetadata,
                diagnostics: normalizedDiagnostics
              }

              renderAssistantPayload(finalData, traceId)
              console.debug('chat: streaming result received', {
                traceId,
                hasDiagnostics: Boolean(resultDiagnostics),
                metadataCount: normalizedStructuredMetadata.length
              })

              finalPayload = finalData
              return finalData
            } else if (eventType === 'error') {
              await reader.cancel().catch(() => undefined)
              const errorMessage = String((eventData as { error?: unknown }).error ?? 'Streaming error')
              throw new Error(errorMessage)
            }
          }
        }
      } finally {
        currentStreamAbortRef.current = null
      }

      throw new Error('Streaming ended without a result event.')
    },
    [
      buildChatRequestPayload,
      setLiveProgress,
      setCurrentDiagnostics,
      renderAssistantPayload
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

      const nextAccessState = parseAccessStateHeader(response)
      if (nextAccessState) {
        setChatAccessState(nextAccessState)
      }

      const durationMs = Date.now() - requestStartedAt
      console.debug('chat: backend responded', {
        traceId,
        status: response.status,
        durationMs
      })

      if (!response.ok) {
        const errorPayload = await extractErrorPayload(response)
        console.error('chat: backend returned error status', {
          traceId,
          status: response.status,
          message: errorPayload.message
        })
        throw new ChatRequestError(
          errorPayload.message ?? 'The chat service encountered an error. Please try again.',
          response.status,
          errorPayload.code
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
    setStructuredMetadataEntries(normalizeMetadataEntries(metadata));
  }, [
    processResponseContent,
    stripSourcesBlock,
    setMessages,
    setLastMessageRole,
    setStructuredMetadataEntries
  ]);

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);

    const hasInitialMessages = Array.isArray(initialMessages) && initialMessages.length > 0
    const hasStructuredMetadata = sanitizedStructuredMetadata.length > 0

    if (hasInitialMessages && hasStructuredMetadata) {
      const messageSignature = initialMessages
        .map((message) => {
          const identifier =
            (message as { id?: string }).id ??
            `${message.role ?? 'unknown'}:${coerceContent(message.content).slice(0, 32)}`
          return identifier
        })
        .join('|')
      const metadataSignature = sanitizedStructuredMetadata
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
          metadataCount: sanitizedStructuredMetadata.length,
          signature
        })
        parseMessagesAndMetadata(initialMessages, sanitizedStructuredMetadata)
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
  }, [shared_chat, initialMessages, sanitizedStructuredMetadata, parseMessagesAndMetadata, id]);

  useEffect(() => {
    const source =
      structuredMetadataEntries.length > 0 ? structuredMetadataEntries : sanitizedStructuredMetadata
    if (!Array.isArray(source) || !source.length) return

    const optionMap = new Map<string, ChannelOption>()
    source.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return
      const nameCandidate = entry.channelName ?? entry.channel
      const finalName = typeof nameCandidate === 'string' ? nameCandidate.trim() : ''
      if (!finalName) return
      const candidateId = entry.channelId ?? entry.clips?.find((clip) => clip.channelId)?.channelId ?? null
      const option: ChannelOption = { name: finalName, id: candidateId ?? undefined }
      optionMap.set(channelOptionKey(option), option)
    })

    if (!optionMap.size) return

    const signature = Array.from(optionMap.keys()).sort().join('|')
    if (metadataChannelSignatureRef.current === signature) {
      console.debug('chat: metadata channel signature unchanged, skipping merge', {
        traceId: currentTraceIdRef.current
      })
      return
    }
    metadataChannelSignatureRef.current = signature

    let mergedOptions: ChannelOption[] | null = null
    setAvailableChannels((prev) => {
      const nextMap = new Map<string, ChannelOption>()
      prev.forEach((option) => nextMap.set(channelOptionKey(option), option))
      optionMap.forEach((option, key) => {
        if (!nextMap.has(key)) {
          nextMap.set(key, option)
        }
      })
      const nextOptions = Array.from(nextMap.values()).sort((a, b) => a.name.localeCompare(b.name))
      const sameLength = nextOptions.length === prev.length
      const sameContent =
        sameLength &&
        prev.every((option, idx) => {
          const next = nextOptions[idx]
          return channelOptionKey(option) === channelOptionKey(next) && option.name === next.name
        })
      if (sameContent) {
        console.debug('chat: metadata channels already present', {
          traceId: currentTraceIdRef.current
        })
        return prev
      }

      mergedOptions = nextOptions
      console.debug('chat: metadata channels merged from clip metadata', {
        traceId: currentTraceIdRef.current,
        added: nextOptions.filter(
          (option) => !prev.some((existing) => channelOptionKey(existing) === channelOptionKey(option))
        ),
        total: nextOptions.length
      })

      return nextOptions
    })
    if (mergedOptions) {
      setChannelCatalogCache(mergedOptions)
    }
  }, [structuredMetadataEntries, sanitizedStructuredMetadata, setChannelCatalogCache])

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
    async (value: string, options?: { newChat?: boolean }) => {
    const rawInput = typeof value === 'string' ? value : coerceContent(value)
    const trimmedInput = rawInput.trim()
    if (!trimmedInput) {
      console.debug('chat: ignoring empty user submission')
      return
    }

    if (requiresAuthToContinue) {
      toast.error('Sign in to continue.')
      return
    }

    if (options?.newChat) {
      resetConversationState({ keepInput: true, silent: true })
    }

    const history = options?.newChat ? [] : newMessages

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
	    setStructuredMetadataEntries([]);
	    setSourcesCollapsed(false);
  
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
    const nextMessages = [...history, newUserMessage];
    setMessages(nextMessages);
    console.debug('chat: user message appended', {
      traceId: messageId,
      totalMessages: nextMessages.length
    })
    setLastMessageRole('user');

    let backendPayload: unknown = null
    let backendMode: 'stream' | 'legacy' | 'error' = 'error'
    try {
      backendPayload = await sendChatStream(nextMessages, messageId)
      backendMode = 'stream'
    } catch (streamError) {
      const isAbortError =
        streamError instanceof DOMException && streamError.name === 'AbortError'
      if (isAbortError) {
        backendPayload = { error: 'stream_aborted' }
        backendMode = 'error'
      } else {
        console.error('chat: streaming failed, falling back to legacy request', { traceId: messageId }, streamError)
        try {
          backendPayload = await sendChatLegacy(nextMessages, messageId)
          backendMode = 'legacy'
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
          backendMode = 'error'
        }
      }
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
        transport: backendMode,
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
    requiresAuthToContinue,
    resetConversationState,
    setShowMiddlePanelOverlay,
    setShowEmptyScreen,
    setShowChatList,
    setIsProcessingQuery,
    setCurrentDiagnostics,
    setMessages,
    sendChatStream,
    sendChatLegacy,
    setLastMessageRole,
    setShowLeftPanelOverlay,
    setFadeOutCompleted,
    setLiveProgress
  ]);

  const handleSuggestionSubmit = useCallback(
    (prompt: string) => handleUserInputSubmit(prompt),
    [handleUserInputSubmit]
  )
  
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

  useEffect(() => {
    if (newMessages.length > 0) {
      setShowChatList(true);
    }
  }, [newMessages.length, setShowChatList]);
  
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

  const progressDiagnostics = useMemo<DiagnosticsPayload | null>(() => {
    if (liveProgress.length) {
      return {
        ...(currentDiagnostics ?? {}),
        progress: liveProgress as DiagnosticsPayload['progress']
      }
    }
    return currentDiagnostics ?? null
  }, [liveProgress, currentDiagnostics])

  const catalogResults = useMemo(() => {
    const rows = progressDiagnostics?.catalog_results
    return Array.isArray(rows) ? rows : []
  }, [progressDiagnostics])

  useEffect(() => {
    // `metadataContainerVisible` is toggled by transcript-backed Top Sources. For metadata-only
    // queries (catalog results), ensure the rail is visible even when `structured_metadata` is empty.
    if (structuredMetadataEntries.length > 0) return
    if (catalogResults.length > 0) {
      setMetadataContainerVisible(true)
    }
  }, [catalogResults.length, structuredMetadataEntries.length, setMetadataContainerVisible])

  const progressSummary = useMemo(() => {
    if (shared_chat) return null
    if (!isProcessingQuery) return null
    const diagnostics = progressDiagnostics
    const progressSource =
      liveProgress.length > 0
        ? liveProgress
        : (diagnostics?.progress as Array<Record<string, unknown>> | undefined)
    const normalized = normalizeProgress(progressSource)
    if (!normalized.length) {
      const hintedStage =
        DEFAULT_PIPELINE[
          ((progressSource && Array.isArray(progressSource) ? progressSource.length : 0) %
            DEFAULT_PIPELINE.length) || 0
        ]?.label ?? 'Processing'
      return `[progress] Working... ${hintedStage}\n\nWaiting for backend progress telemetry...`
    }
    const totalStages = normalized.length
    const completedStages = normalized.filter((stage) => stage.status === 'completed').length
    const activeStage =
      normalized.find((stage) => stage.status === 'running') ??
      normalized.find((stage) => stage.status === 'pending') ??
      normalized[normalized.length - 1]
    const header = `[progress] Working... ${activeStage?.label ?? 'Processing'}`
    const summaryLine = `Progress ${Math.min(completedStages, totalStages)}/${totalStages}`
    const stageLines = activeStage ? formatStageLines(activeStage) : []
    const metadataLines = formatProgressMetadata(diagnostics?.progress_metadata)
    const tailLines: string[] = []
    if (metadataLines.length) {
      tailLines.push('Metadata detail:')
      metadataLines.forEach((line) => tailLines.push(`- ${line}`))
    }
    if (diagnostics?.request_id) {
      tailLines.push(`Request ID: ${diagnostics.request_id}`)
    }
    const sections = [header, '', summaryLine]
    if (stageLines.length) {
      sections.push('', ...stageLines)
    }
    if (tailLines.length) {
      sections.push('', ...tailLines)
    }
    return sections.join('\n')
  }, [shared_chat, isProcessingQuery, liveProgress, progressDiagnostics])

  const displayMessages = useMemo(() => {
    if (!progressSummary) return newMessages
    const progressMessage: MetadataMessage = {
      id: `progress-status-${newMessages.length}`,
      role: 'assistant',
      content: progressSummary,
      structured_metadata: [],
      diagnostics: progressDiagnostics
    }
    return [...newMessages, progressMessage]
  }, [newMessages, progressSummary, progressDiagnostics])

  const lastUserMessageText = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const msg = displayMessages[i]
      if (msg?.role === 'user') return coerceContent((msg as any).content)
    }
    return ''
  }, [displayMessages])

  const youtubeIndexTarget = useMemo(
    () => extractYoutubeIndexTarget(lastUserMessageText),
    [lastUserMessageText]
  )

  const handleIndexYouTubeTarget = useCallback(async () => {
    if (!youtubeIndexTarget) return
    if (ytIndexStatus.state === 'running') return

    setYtIndexStatus({ state: 'running', message: 'Indexing...' })
    try {
      const payload: Record<string, unknown> = {
        namespace: 'videos',
        language: 'en',
        prefer_auto: true,
        // Keep this reasonably cheap by default; tune later if you want higher recall.
        segment_min_s: 120,
        segment_max_s: 240,
        segment_stride_s: 120,
        min_text_chars: 120
      }
      if (youtubeIndexTarget.videoUrls.length) {
        payload.video_urls = youtubeIndexTarget.videoUrls
      } else if (youtubeIndexTarget.channel) {
        payload.channel = youtubeIndexTarget.channel
        payload.max_videos = 10
      }

      const res = await fetch('/api/index/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || data.ok === false) {
        const detail = data?.detail ?? data?.error ?? 'indexing failed'
        setYtIndexStatus({ state: 'error', message: String(detail).slice(0, 300) })
        toast.error('YouTube indexing failed')
        return
      }

      const failedCount = Array.isArray(data.failed) ? data.failed.length : 0
      setYtIndexStatus({
        state: 'done',
        message: failedCount
          ? `Indexed with ${failedCount} failure(s). Ask again to use it.`
          : 'Indexed. Ask again to use it.'
      })
      toast.success('Indexed YouTube target. Re-ask your question to use it.')
    } catch (error) {
      console.error('chat: failed to index youtube target', error)
      setYtIndexStatus({ state: 'error', message: 'indexing request failed' })
      toast.error('YouTube indexing request failed')
    }
  }, [youtubeIndexTarget, ytIndexStatus.state])

  React.useEffect(() => {
    if (shared_chat || !shareHeader) {
      setShareControl(null)
      return
    }
    setShareControl(shareHeader)
    return () => {
      setShareControl(null)
    }
  }, [setShareControl, shareHeader, shared_chat])

  return (
    <>
      <div className={styles.layoutContainer}>
        <div className={styles.leftPanel} data-testid="chat-left-rail">
          <div className={styles.leftPanelContent}>
            <div className={leftPanelOverlayClass} onAnimationEnd={onAnimationEnd}>
              {/* Render conditionally based on fadeOutCompleted and shared_chat */}
              {!shared_chat && (showLeftPanelOverlay || !fadeOutCompleted) ? (
                <QuestionsOverlayLeftPanel onSubmit={handleSuggestionSubmit} showOverlay={showLeftPanelOverlay} />
              ) : null}
            </div>
            {null}
          </div>
        </div>

        <div className={middlePanelClass} data-testid="chat-middle-rail">
          <div className={styles.middlePanelContent}>
            <div className={styles.scrollableContainer} data-testid="chat-scroll-region">
              {showChatList && (
                <div className={QuestionsOverlayStyles.fadeIn}>
                    <ChatList
                    ref={chatListEndRef}
                    messages={displayMessages}
                    lastMessageRole={lastMessageRole}
                    onViewSources={() => {
                      setSourcesCollapsed(false)
                      setIsModalOpen(true)
                    }}
                    isMobile={isMobile}
                  />
                </div>
              )}

              {/* Conditional rendering for EmptyScreen */}
              {!shared_chat && !showChatList && showEmptyScreen && (
                <div className={QuestionsOverlayStyles.fadeIn}>
                  <EmptyScreen
                    onSubmit={handleSuggestionSubmit}
                    showOverlay={showMiddlePanelOverlay}
                    isVisible={showEmptyScreen}
                  />
                </div>
              )}

              {newMessages.length === 0 && !isMobile && showQuestionsOverlay && (
                <div
                  className={`${overlayClass} ${
                    showMiddlePanelOverlay ? QuestionsOverlayStyles.fadeIn : QuestionsOverlayStyles.fadeOut
                  }`}
                >
                  <QuestionsOverlay onSubmit={handleSuggestionSubmit} showOverlay={showMiddlePanelOverlay} />
                </div>
              )}
            </div>

            {null}
          </div>
        </div>

        <div className={rightPanelClass} data-testid="chat-right-rail">
          <div className={metadataContainerClass}>
            <RightPanelAuthCta
              isAuthenticated={Boolean(currentUser)}
              callbackUrl={callbackUrl}
            />
	            {structuredMetadataEntries.length > 0 ? (
	              <>
	                <div className={styles.metadataTitle}>Top Sources</div>
	                {sourcesCollapsed ? (
	                  <div className="mt-2 space-y-2">
	                    <button
	                      type="button"
	                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left text-xs text-zinc-200 hover:border-white/20"
	                      onClick={() => setSourcesCollapsed(false)}
	                      data-testid="sources-collapsed-toggle"
	                    >
	                      {(() => {
	                        const totalClips = structuredMetadataEntries.reduce(
	                          (acc, entry) => acc + (Array.isArray(entry.clips) ? entry.clips.length : 0),
	                          0
	                        )
	                        return `${totalClips || structuredMetadataEntries.length} source result(s) found, but the answer looks weak. Click to expand.`
	                      })()}
	                    </button>

	                    {youtubeIndexTarget ? (
	                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
	                        <button
	                          type="button"
	                          className="w-full rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100 hover:border-emerald-400/50 disabled:opacity-60"
	                          onClick={handleIndexYouTubeTarget}
	                          disabled={ytIndexStatus.state === 'running'}
	                          data-testid="index-youtube-target"
	                        >
	                          {ytIndexStatus.state === 'running' ? 'Indexing YouTube target...' : youtubeIndexTarget.label}
	                        </button>
	                        {ytIndexStatus.message ? (
	                          <div className="mt-2 text-xs text-zinc-300">{ytIndexStatus.message}</div>
	                        ) : (
	                          <div className="mt-2 text-[11px] text-zinc-400">
	                            Adds transcripts to your local index (requires OpenAI embeddings).
	                          </div>
	                        )}
	                      </div>
	                    ) : null}
	                  </div>
	                ) : (
	                  <SourceList
	                    entries={structuredMetadataEntries}
	                    onSelectClip={handleClipSelect}
	                    selectionScope={selectionScope}
	                    selection={clipSelection}
	                  />
	                )}
	              </>
	            ) : catalogResults.length > 0 ? (
	              <>
	                <div className={styles.metadataTitle}>Video Catalog</div>
	                <MetadataCatalog results={catalogResults.slice(0, 10)} />
	              </>
	            ) : null}
          </div>
        </div>
      </div>

      {!shared_chat && (
        <div className={styles.bottomBar} data-testid="chat-bottom-bar">
          <div className={styles.bottomBarInner}>
            <div className={styles.bottomBarLeft} data-testid="chat-bottom-left">
              {!isMobile ? (
                <div className={styles.bottomBarFilter} data-testid="channel-filter-bottom">
                  <ChannelFilterPanel
                    channels={availableChannels}
                    excluded={excludedChannelKeys}
                    onExcludedChange={handleExcludedChannelsChange}
                  />
                </div>
              ) : null}
            </div>
            <div className={styles.bottomBarMiddle} data-testid="chat-bottom-middle">
              <div className={styles.bottomBarPrompt}>
                <div className={styles.bottomBarPromptInner}>
                  {requiresAuthToContinue ? (
                    <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-left shadow-[0_18px_38px_-22px_rgba(34,197,94,0.35)]">
                      <p className="text-sm font-semibold text-emerald-100">
                        Sign in to use ICMFYI.
                      </p>
                      <p className="mt-1 text-xs text-zinc-300">
                        Authentication protects tenant-scoped queries, exports, and clip jobs.
                      </p>
                      <div className="mt-3">
                        <AuthButtonsCallout
                          callbackUrl={callbackUrl}
                          className="items-start text-left"
                        />
                      </div>
                    </div>
                  ) : null}
                  <ChatPanel
                    id={id}
                    isLoading={isProcessingQuery}
                    input={input}
                    setInput={setInput}
                    inputDisabled={requiresAuthToContinue}
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
                    onClearChat={handleClearChat}
                    showFooter={false}
                  />
                </div>
              </div>
            </div>
            <div className={styles.bottomBarRight} data-testid="chat-bottom-right" />
          </div>
        </div>
      )}

      {/* Modal to display MetadataList on mobile */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <h2 className={styles.metadataTitle}>
          {structuredMetadataEntries.length > 0
            ? 'Top Sources'
            : catalogResults.length > 0
              ? 'Video Catalog'
              : 'Top Sources'}
        </h2>
        <RightPanelAuthCta
          isAuthenticated={Boolean(currentUser)}
          callbackUrl={callbackUrl}
        />
        {structuredMetadataEntries.length > 0 ? (
          sourcesCollapsed ? (
            <div className="mt-2 space-y-2">
              <button
                type="button"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left text-xs text-zinc-200 hover:border-white/20"
                onClick={() => setSourcesCollapsed(false)}
              >
                {(() => {
                  const totalClips = structuredMetadataEntries.reduce(
                    (acc, entry) => acc + (Array.isArray(entry.clips) ? entry.clips.length : 0),
                    0
                  )
                  return `${totalClips || structuredMetadataEntries.length} source result(s) found, but the answer looks weak. Tap to expand.`
                })()}
              </button>

              {youtubeIndexTarget ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100 hover:border-emerald-400/50 disabled:opacity-60"
                    onClick={handleIndexYouTubeTarget}
                    disabled={ytIndexStatus.state === 'running'}
                  >
                    {ytIndexStatus.state === 'running' ? 'Indexing YouTube target...' : youtubeIndexTarget.label}
                  </button>
                  {ytIndexStatus.message ? (
                    <div className="mt-2 text-xs text-zinc-300">{ytIndexStatus.message}</div>
                  ) : (
                    <div className="mt-2 text-[11px] text-zinc-400">Adds transcripts to your local index.</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <SourceList
              entries={structuredMetadataEntries}
              onSelectClip={handleClipSelect}
              selectionScope={selectionScope}
              selection={clipSelection}
            />
          )
        ) : catalogResults.length > 0 ? (
          <MetadataCatalog results={catalogResults.slice(0, 10)} />
        ) : null}
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
        intent={selectedClip?.intent ?? 'play'}
        onClose={handleCloseClipDrawer}
      />
    </>
  );
}

export default Chat;
