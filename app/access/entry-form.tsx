'use client'

import React from 'react'
import { authorizeEntryCode } from '@/app/actions'
import Link from 'next/link'

const initialState = { error: null as string | null }

export default function EntryAccessForm({ redirectTo }: { redirectTo: string }) {
  const [state, setState] = React.useState(initialState)
  const [isPending, startTransition] = React.useTransition()

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      setState(initialState)
      startTransition(async () => {
        const nextState = await authorizeEntryCode(initialState, formData)
        if (nextState?.error) {
          setState(nextState)
        }
      })
    },
    []
  )

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border border-white/10 bg-zinc-950/70 p-8 shadow-lg backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold text-white">Enter your access code</h1>
        <p className="mt-2 text-sm text-zinc-400">
          We personalize the chat experience and suggested questions based on the code you received.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="next" value={redirectTo} />
        <label className="block text-sm font-medium text-zinc-200" htmlFor="entryCode">
          Access code
        </label>
        <input
          id="entryCode"
          name="entryCode"
          required
          minLength={2}
          maxLength={64}
          placeholder="Enter access code"
          className="w-full rounded-md border border-white/15 bg-black/60 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          autoFocus
        />
        {state?.error ? (
          <p className="text-sm font-medium text-rose-400" role="alert">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isPending}
        >
          {isPending ? 'Checking…' : 'Unlock'}
        </button>
      </form>

      <p className="text-xs text-zinc-500">
        Need a code?{' '}
        <Link href="mailto:hello@icm.fyi" className="text-zinc-200 underline hover:text-white">
          Contact the ICM team
        </Link>
        .
      </p>
    </div>
  )
}
