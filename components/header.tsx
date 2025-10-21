import React from 'react'
import Link from 'next/link'
import type { Session } from 'next-auth'

import { clearChats } from '@/app/actions'
import { Sidebar } from '@/components/sidebar'
import { SidebarList } from '@/components/sidebar-list'
import { SidebarFooter } from '@/components/sidebar-footer'
import { ThemeToggle } from '@/components/theme-toggle'
import { ClearHistory } from '@/components/clear-history'
import { HeaderRightControls } from '@/components/header-right-controls'

interface HeaderProps {
  session: Session | null
}

export function Header({ session }: HeaderProps) {
  const userId = session?.user?.id ?? null

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {userId ? (
            <Sidebar>
              <React.Suspense fallback={<div className="flex-1 overflow-auto" />}>
                <SidebarList userId={userId} variant="mobile" />
              </React.Suspense>
              <SidebarFooter className="border-t border-border/80 px-4 py-3">
                <ThemeToggle />
                <ClearHistory clearChats={clearChats} />
              </SidebarFooter>
            </Sidebar>
          ) : null}
          <Link href="/" className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-background/80 p-0 text-foreground transition-colors hover:text-foreground/80" aria-label="Return to home">
            <span className="text-sm font-semibold uppercase tracking-wide">ICM</span>
          </Link>
        </div>
        <HeaderRightControls session={session} />
      </div>
    </header>
  )
}
