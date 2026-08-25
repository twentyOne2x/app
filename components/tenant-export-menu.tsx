'use client'

import * as React from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'react-hot-toast'

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { IconSpinner } from '@/components/ui/icons'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import {
  newTenantExportIntent,
  resumeTenantExportIntent,
  runTenantExportOnce,
  tenantExportArtifactUrl,
  type TenantExportIntent,
  type WorkflowHttpResult
} from '@/lib/durable-product-workflows'

function exportStorageKey(userId: string) {
  return `tenant-export-intent/v1:${userId}`
}

async function responseResult(response: Response): Promise<WorkflowHttpResult> {
  const body = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, body }
}

export function TenantExportMenu({ userId }: { userId: string }) {
  const [intent, setIntent] = useLocalStorage<TenantExportIntent | null>(
    exportStorageKey(userId),
    null
  )
  const intentRef = React.useRef(intent)
  const abortRef = React.useRef<AbortController | null>(null)
  const runningIntentRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    intentRef.current = intent
  }, [intent])

  const run = React.useCallback(
    async (state: TenantExportIntent) => {
      if (runningIntentRef.current === state.intentId) return
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      runningIntentRef.current = state.intentId
      try {
        const result = await runTenantExportOnce(
          state,
          {
            create: async (idempotencyKey, signal) =>
              responseResult(
                await fetch('/api/tenant-exports', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ idempotency_key: idempotencyKey }),
                  signal
                })
              ),
            get: async (exportId, signal) =>
              responseResult(
                await fetch(`/api/tenant-exports/${exportId}`, {
                  method: 'GET',
                  cache: 'no-store',
                  signal
                })
              )
          },
          {
            signal: controller.signal,
            persist: next => {
              intentRef.current = next
              setIntent(next)
            }
          }
        )
        if (result.phase === 'completed') {
          toast.success('Your tenant export is ready.')
        } else if (result.phase === 'failed') {
          toast.error('Your tenant export could not be completed.')
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.error('tenant-export: workflow failed', error)
          toast.error('Your tenant export could not be completed.')
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (runningIntentRef.current === state.intentId) {
          runningIntentRef.current = null
        }
      }
    },
    [setIntent]
  )

  React.useEffect(() => {
    if (!intent || (intent.phase !== 'creating' && intent.phase !== 'polling')) return
    void run(intent)
    return () => {
      abortRef.current?.abort()
    }
    // The durable intent id changes only for a fresh user action. Persisted phase
    // updates must not tear down the active runner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.intentId, run])

  const startOrResume = React.useCallback(() => {
    const current = intentRef.current
    if (current?.phase === 'creating' || current?.phase === 'polling') {
      void run(current)
      return
    }
    if (current?.phase === 'failed' && current.retryable) {
      const resumed = resumeTenantExportIntent(current)
      intentRef.current = resumed
      setIntent(resumed)
      void run(resumed)
      return
    }
    const created = newTenantExportIntent(
      `texi_${nanoid(24)}`,
      `tenant-export-${nanoid(32)}`
    )
    intentRef.current = created
    setIntent(created)
    void run(created)
  }, [run, setIntent])

  const running = intent?.phase === 'creating' || intent?.phase === 'polling'
  const completedId = intent?.phase === 'completed' ? intent.exportId : undefined

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Tenant data
      </DropdownMenuLabel>
      {completedId ? (
        <>
          <DropdownMenuItem asChild className="text-xs">
            <a href={tenantExportArtifactUrl(completedId, 'database')} download>
              Download SQLite database
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="text-xs">
            <a href={tenantExportArtifactUrl(completedId, 'manifest')} download>
              Download export manifest
            </a>
          </DropdownMenuItem>
        </>
      ) : null}
      <DropdownMenuItem
        className="text-xs"
        disabled={running}
        onSelect={event => {
          event.preventDefault()
          startOrResume()
        }}
      >
        {running ? <IconSpinner className="mr-2 size-3 animate-spin" /> : null}
        {running
          ? intent?.phase === 'creating'
            ? 'Preparing export…'
            : 'Building export…'
          : intent?.phase === 'failed'
            ? 'Retry data export'
            : completedId
              ? 'Refresh data export'
              : 'Export my data'}
      </DropdownMenuItem>
      {intent?.phase === 'failed' && intent.errorMessage ? (
        <DropdownMenuLabel className="whitespace-normal text-[11px] font-normal text-red-500">
          {intent.errorMessage}
        </DropdownMenuLabel>
      ) : null}
    </>
  )
}
