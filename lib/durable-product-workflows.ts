export type WorkflowHttpResult = {
  ok: boolean
  status: number
  body: unknown
}

export type WorkflowSleep = (delayMs: number, signal?: AbortSignal) => Promise<void>

const INGESTION_JOB_ID = /^job_[0-9a-f]{40}$/
const INGESTION_REQUEST_ID = /^req_[0-9a-f]{40}$/
const TENANT_EXPORT_ID = /^tex_[0-9a-f]{40}$/

const activeYoutubeRuns = new Map<string, Promise<YoutubeIngestionIntent>>()
const activeExportRuns = new Map<string, Promise<TenantExportIntent>>()

function nowIso() {
  return new Date().toISOString()
}

function isAbortError(error: unknown) {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  )
}

export const sleepWithSignal: WorkflowSleep = (delayMs, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, Math.max(0, delayMs))
    signal?.addEventListener('abort', onAbort, { once: true })
  })

function objectBody(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function errorMessage(body: unknown, fallback: string): string {
  const data = objectBody(body)
  for (const key of ['detail', 'error_detail', 'error', 'message']) {
    const value = data?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500)
  }
  return fallback
}

export type YoutubeIngestionPhase =
  | 'submitting'
  | 'polling'
  | 'resubmitting'
  | 'completed'
  | 'failed'

export type YoutubeIngestionJob = {
  jobId: string
  requestId: string
  status: string
  ready: boolean
}

export type YoutubeIngestionIntent = {
  version: 1
  intentId: string
  targetLabel: string
  payload: Record<string, unknown>
  phase: YoutubeIngestionPhase
  jobs: YoutubeIngestionJob[]
  submitCount: number
  createdAt: string
  updatedAt: string
  errorMessage?: string
  retryable?: boolean
  retryFrom?: Exclude<YoutubeIngestionPhase, 'completed' | 'failed'>
}

export type YoutubeIngestionTransport = {
  submit: (
    payload: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<WorkflowHttpResult>
  getJob: (jobId: string, signal?: AbortSignal) => Promise<WorkflowHttpResult>
}

export type YoutubeIngestionRunOptions = {
  persist?: (state: YoutubeIngestionIntent) => void
  sleep?: WorkflowSleep
  signal?: AbortSignal
  initialDelayMs?: number
  maxDelayMs?: number
  maxTransportRetries?: number
}

export function newYoutubeIngestionIntent(
  intentId: string,
  targetLabel: string,
  payload: Record<string, unknown>
): YoutubeIngestionIntent {
  const timestamp = nowIso()
  return {
    version: 1,
    intentId,
    targetLabel,
    payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
    phase: 'submitting',
    jobs: [],
    submitCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function saveYoutube(
  state: YoutubeIngestionIntent,
  persist?: (state: YoutubeIngestionIntent) => void
) {
  const next = { ...state, updatedAt: nowIso() }
  persist?.(next)
  return next
}

function failYoutube(
  state: YoutubeIngestionIntent,
  message: string,
  retryable: boolean,
  retryFrom: Exclude<YoutubeIngestionPhase, 'completed' | 'failed'>,
  persist?: (state: YoutubeIngestionIntent) => void
) {
  return saveYoutube(
    {
      ...state,
      phase: 'failed',
      errorMessage: message.slice(0, 500),
      retryable,
      retryFrom
    },
    persist
  )
}

function pendingJobs(body: unknown): YoutubeIngestionJob[] {
  const data = objectBody(body)
  if (!Array.isArray(data?.pending)) return []
  const jobs: YoutubeIngestionJob[] = []
  const seen = new Set<string>()
  for (const raw of data.pending) {
    const pending = objectBody(raw)
    const jobId = typeof pending?.job_id === 'string' ? pending.job_id : ''
    const requestId = typeof pending?.request_id === 'string' ? pending.request_id : ''
    if (!INGESTION_JOB_ID.test(jobId) || !INGESTION_REQUEST_ID.test(requestId)) {
      throw new Error('ingestion backend returned a non-canonical pending job identity')
    }
    if (seen.has(jobId)) continue
    seen.add(jobId)
    jobs.push({
      jobId,
      requestId,
      status: typeof pending?.status === 'string' ? pending.status : 'queued',
      ready: false
    })
  }
  return jobs
}

function hasTerminalSubmissionFailure(result: WorkflowHttpResult) {
  const data = objectBody(result.body)
  return (
    !result.ok ||
    data?.ok === false ||
    (Array.isArray(data?.failed) && data.failed.length > 0)
  )
}

function normalizeJobStatus(
  result: WorkflowHttpResult,
  expected: YoutubeIngestionJob
): YoutubeIngestionJob {
  if (!result.ok) {
    throw new Error(errorMessage(result.body, `job status failed (${result.status})`))
  }
  const data = objectBody(result.body)
  const jobId = typeof data?.job_id === 'string' ? data.job_id : ''
  const requestId = typeof data?.request_id === 'string' ? data.request_id : ''
  if (jobId !== expected.jobId || requestId !== expected.requestId) {
    throw new Error('ingestion status response changed the durable job identity')
  }
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : ''
  const ready = data?.ready === true || status === 'succeeded'
  if (ready) return { ...expected, status: 'succeeded', ready: true }
  if (status === 'failed' || status === 'error' || status === 'cancelled') {
    const code = typeof data?.error_code === 'string' ? data.error_code : status
    throw new YoutubeTerminalJobError(`ingestion job ${jobId} failed (${code})`)
  }
  if (!['queued', 'running', 'accepted', 'retrying'].includes(status)) {
    throw new Error('ingestion status response contained an unsupported state')
  }
  return { ...expected, status, ready: false }
}

class YoutubeTerminalJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YoutubeTerminalJobError'
    Object.setPrototypeOf(this, YoutubeTerminalJobError.prototype)
  }
}

export function resumeYoutubeIngestionIntent(
  state: YoutubeIngestionIntent
): YoutubeIngestionIntent {
  if (state.phase !== 'failed' || !state.retryable || !state.retryFrom) return state
  return {
    ...state,
    phase: state.retryFrom,
    errorMessage: undefined,
    retryable: undefined,
    retryFrom: undefined,
    updatedAt: nowIso()
  }
}

export async function runYoutubeIngestionWorkflow(
  initial: YoutubeIngestionIntent,
  transport: YoutubeIngestionTransport,
  options: YoutubeIngestionRunOptions = {}
): Promise<YoutubeIngestionIntent> {
  const persist = options.persist
  const sleep = options.sleep ?? sleepWithSignal
  const initialDelayMs = options.initialDelayMs ?? 1500
  const maxDelayMs = options.maxDelayMs ?? 10_000
  const maxTransportRetries = options.maxTransportRetries ?? 5
  let state = initial
  let pollRound = 0
  let transportFailures = 0

  if (state.phase === 'completed' || state.phase === 'failed') return state

  while (!options.signal?.aborted) {
    if (state.phase === 'submitting' || state.phase === 'resubmitting') {
      const retryFrom = state.phase
      let result: WorkflowHttpResult
      try {
        result = await transport.submit(state.payload, options.signal)
      } catch (error) {
        if (isAbortError(error)) throw error
        return failYoutube(
          state,
          error instanceof Error ? error.message : 'indexing request failed',
          true,
          retryFrom,
          persist
        )
      }
      state = saveYoutube({ ...state, submitCount: state.submitCount + 1 }, persist)
      if (hasTerminalSubmissionFailure(result)) {
        return failYoutube(
          state,
          errorMessage(result.body, `indexing failed (${result.status})`),
          result.status === 408 || result.status === 429 || result.status >= 500,
          retryFrom,
          persist
        )
      }

      let jobs: YoutubeIngestionJob[]
      try {
        jobs = pendingJobs(result.body)
      } catch (error) {
        return failYoutube(
          state,
          error instanceof Error ? error.message : 'invalid pending ingestion jobs',
          false,
          retryFrom,
          persist
        )
      }
      if (result.status === 202 || jobs.length > 0) {
        if (!jobs.length) {
          return failYoutube(
            state,
            'ingestion backend accepted work without durable job identities',
            false,
            retryFrom,
            persist
          )
        }
        state = saveYoutube(
          {
            ...state,
            phase: 'polling',
            jobs,
            errorMessage: undefined,
            retryable: undefined,
            retryFrom: undefined
          },
          persist
        )
        pollRound = 0
        continue
      }

      state = saveYoutube(
        {
          ...state,
          phase: 'completed',
          jobs: [],
          errorMessage: undefined,
          retryable: undefined,
          retryFrom: undefined
        },
        persist
      )
      return state
    }

    if (state.phase !== 'polling') return state
    if (!state.jobs.length) {
      return failYoutube(
        state,
        'persisted ingestion state has no durable jobs to poll',
        false,
        'polling',
        persist
      )
    }

    try {
      const updated: YoutubeIngestionJob[] = []
      for (const job of state.jobs) {
        if (job.ready) {
          updated.push(job)
          continue
        }
        const result = await transport.getJob(job.jobId, options.signal)
        updated.push(normalizeJobStatus(result, job))
      }
      transportFailures = 0
      state = saveYoutube({ ...state, jobs: updated }, persist)
    } catch (error) {
      if (isAbortError(error)) throw error
      if (
        error instanceof YoutubeTerminalJobError ||
        (error instanceof Error && error.name === 'YoutubeTerminalJobError')
      ) {
        return failYoutube(state, error.message, false, 'polling', persist)
      }
      transportFailures += 1
      if (transportFailures > maxTransportRetries) {
        return failYoutube(
          state,
          error instanceof Error ? error.message : 'ingestion polling failed',
          true,
          'polling',
          persist
        )
      }
    }

    if (state.jobs.every(job => job.ready)) {
      state = saveYoutube({ ...state, phase: 'resubmitting' }, persist)
      continue
    }

    const delay = Math.min(initialDelayMs * 2 ** Math.min(pollRound, 8), maxDelayMs)
    pollRound += 1
    await sleep(delay, options.signal)
  }

  throw new DOMException('Aborted', 'AbortError')
}

export function runYoutubeIngestionOnce(
  state: YoutubeIngestionIntent,
  transport: YoutubeIngestionTransport,
  options: YoutubeIngestionRunOptions = {}
) {
  const active = activeYoutubeRuns.get(state.intentId)
  if (active) return active
  const run = runYoutubeIngestionWorkflow(state, transport, options).finally(() => {
    activeYoutubeRuns.delete(state.intentId)
  })
  activeYoutubeRuns.set(state.intentId, run)
  return run
}

export type TenantExportPhase = 'creating' | 'polling' | 'completed' | 'failed'

export type TenantExportIntent = {
  version: 1
  intentId: string
  idempotencyKey: string
  exportId?: string
  phase: TenantExportPhase
  createdAt: string
  updatedAt: string
  databaseSha256?: string
  manifestSha256?: string
  errorMessage?: string
  retryable?: boolean
  retryFrom?: 'creating' | 'polling'
}

export type TenantExportTransport = {
  create: (idempotencyKey: string, signal?: AbortSignal) => Promise<WorkflowHttpResult>
  get: (exportId: string, signal?: AbortSignal) => Promise<WorkflowHttpResult>
}

export type TenantExportRunOptions = {
  persist?: (state: TenantExportIntent) => void
  sleep?: WorkflowSleep
  signal?: AbortSignal
  initialDelayMs?: number
  maxDelayMs?: number
  maxTransportRetries?: number
}

export function newTenantExportIntent(
  intentId: string,
  idempotencyKey: string
): TenantExportIntent {
  const timestamp = nowIso()
  return {
    version: 1,
    intentId,
    idempotencyKey,
    phase: 'creating',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function saveExport(
  state: TenantExportIntent,
  persist?: (state: TenantExportIntent) => void
) {
  const next = { ...state, updatedAt: nowIso() }
  persist?.(next)
  return next
}

function failExport(
  state: TenantExportIntent,
  message: string,
  retryFrom: 'creating' | 'polling',
  persist?: (state: TenantExportIntent) => void
) {
  return saveExport(
    {
      ...state,
      phase: 'failed',
      errorMessage: message.slice(0, 500),
      retryable: true,
      retryFrom
    },
    persist
  )
}

function exportStateFromResponse(
  current: TenantExportIntent,
  result: WorkflowHttpResult
): TenantExportIntent {
  if (!result.ok) {
    throw new Error(errorMessage(result.body, `tenant export failed (${result.status})`))
  }
  const data = objectBody(result.body)
  const exportId = typeof data?.id === 'string' ? data.id : current.exportId ?? ''
  if (!TENANT_EXPORT_ID.test(exportId)) {
    throw new Error('tenant export backend returned a non-canonical export identity')
  }
  if (current.exportId && current.exportId !== exportId) {
    throw new Error('tenant export backend changed the durable export identity')
  }
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : ''
  if (status === 'completed') {
    return {
      ...current,
      exportId,
      phase: 'completed',
      databaseSha256:
        typeof data?.database_sha256 === 'string' ? data.database_sha256 : undefined,
      manifestSha256:
        typeof data?.manifest_sha256 === 'string' ? data.manifest_sha256 : undefined,
      errorMessage: undefined,
      retryable: undefined,
      retryFrom: undefined
    }
  }
  if (status === 'failed' || status === 'error') {
    throw new TenantExportTerminalError(errorMessage(result.body, 'tenant export failed'))
  }
  if (!['pending', 'queued', 'running', 'processing', 'building', 'accepted'].includes(status)) {
    throw new Error('tenant export backend returned an unsupported state')
  }
  return { ...current, exportId, phase: 'polling' }
}

class TenantExportTerminalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantExportTerminalError'
    Object.setPrototypeOf(this, TenantExportTerminalError.prototype)
  }
}

export function resumeTenantExportIntent(state: TenantExportIntent): TenantExportIntent {
  if (state.phase !== 'failed' || !state.retryable || !state.retryFrom) return state
  return {
    ...state,
    phase: state.retryFrom,
    errorMessage: undefined,
    retryable: undefined,
    retryFrom: undefined,
    updatedAt: nowIso()
  }
}

export async function runTenantExportWorkflow(
  initial: TenantExportIntent,
  transport: TenantExportTransport,
  options: TenantExportRunOptions = {}
): Promise<TenantExportIntent> {
  const persist = options.persist
  const sleep = options.sleep ?? sleepWithSignal
  const initialDelayMs = options.initialDelayMs ?? 1000
  const maxDelayMs = options.maxDelayMs ?? 10_000
  const maxTransportRetries = options.maxTransportRetries ?? 5
  let state = initial
  let pollRound = 0
  let transportFailures = 0

  if (state.phase === 'completed' || state.phase === 'failed') return state

  if (state.phase === 'creating') {
    let result: WorkflowHttpResult
    try {
      result = await transport.create(state.idempotencyKey, options.signal)
      state = exportStateFromResponse(state, result)
      state = saveExport(state, persist)
    } catch (error) {
      if (isAbortError(error)) throw error
      return failExport(
        state,
        error instanceof Error ? error.message : 'tenant export request failed',
        'creating',
        persist
      )
    }
    if (state.phase === 'completed') return state
  }

  while (!options.signal?.aborted && state.phase === 'polling' && state.exportId) {
    try {
      const result = await transport.get(state.exportId, options.signal)
      state = exportStateFromResponse(state, result)
      state = saveExport(state, persist)
      transportFailures = 0
      if (state.phase === 'completed') return state
    } catch (error) {
      if (isAbortError(error)) throw error
      if (
        error instanceof TenantExportTerminalError ||
        (error instanceof Error && error.name === 'TenantExportTerminalError')
      ) {
        return failExport(state, error.message, 'creating', persist)
      }
      transportFailures += 1
      if (transportFailures > maxTransportRetries) {
        return failExport(
          state,
          error instanceof Error ? error.message : 'tenant export polling failed',
          'polling',
          persist
        )
      }
    }
    const delay = Math.min(initialDelayMs * 2 ** Math.min(pollRound, 8), maxDelayMs)
    pollRound += 1
    await sleep(delay, options.signal)
  }

  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return state
}

export function runTenantExportOnce(
  state: TenantExportIntent,
  transport: TenantExportTransport,
  options: TenantExportRunOptions = {}
) {
  const active = activeExportRuns.get(state.intentId)
  if (active) return active
  const run = runTenantExportWorkflow(state, transport, options).finally(() => {
    activeExportRuns.delete(state.intentId)
  })
  activeExportRuns.set(state.intentId, run)
  return run
}

export function tenantExportArtifactUrl(
  exportId: string,
  name: 'database' | 'manifest'
) {
  if (!TENANT_EXPORT_ID.test(exportId)) throw new Error('invalid tenant export id')
  return `/api/tenant-exports/${exportId}/artifacts/${name}`
}
