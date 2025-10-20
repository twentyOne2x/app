'use client'

import React from 'react'
import Link from 'next/link'
import type { Session } from 'next-auth'

import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { useHeaderExtras } from '@/components/header-extras-context'

interface HeaderRightControlsProps {
  session: Session | null
}

export function HeaderRightControls({ session }: HeaderRightControlsProps) {
  const { shareControl } = useHeaderExtras()
  const userId = session?.user?.id ?? null

  return (
    <div className="flex items-center gap-8">
      {shareControl ? <div className="inline-flex items-center">{shareControl}</div> : null}
      <a
        href="https://x.com/icmdotfyi"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center transition-transform hover:scale-105"
        aria-label="icm.fyi on X"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-muted-foreground transition-colors hover:text-foreground">
          <path
            fill="currentColor"
            d="M19.633 3H16.83l-4.01 5.68L9.38 3H3l6.59 9.37L3.34 21h2.8l4.4-6.22L15.66 21H22l-6.8-9.44L19.633 3Z"
          />
        </svg>
      </a>
      {userId ? (
        <>
          <Button asChild variant="outline" size="sm" className="md:hidden">
            <Link href="/">New chat</Link>
          </Button>
          <UserMenu user={session!.user} />
        </>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      )}
    </div>
  )
}
