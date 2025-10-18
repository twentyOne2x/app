import React from 'react'
import Link from 'next/link'
import type { Session } from 'next-auth'

import { clearChats } from '@/app/actions'
import { Sidebar } from '@/components/sidebar'
import { SidebarList } from '@/components/sidebar-list'
import { SidebarFooter } from '@/components/sidebar-footer'
import { ThemeToggle } from '@/components/theme-toggle'
import { ClearHistory } from '@/components/clear-history'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { IconNextChat } from '@/components/ui/icons'

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
          <Link
            href="/"
            className="flex items-center font-semibold text-foreground transition-colors hover:text-foreground/80"
            aria-label="Return to home"
          >
            <IconNextChat className="mr-2 size-6" />
            icm.fyi
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {userId ? (
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="md:hidden"
              >
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
      </div>
    </header>
  )
}
