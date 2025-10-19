import Link from 'next/link'
import { Suspense } from 'react'

import {
  clearChats,
  getChats,
  removeChat,
  seedSampleChats,
  shareChat
} from '@/app/actions'
import { SidebarActions } from '@/components/sidebar-actions'
import { SidebarFooter } from '@/components/sidebar-footer'
import { SidebarItem } from '@/components/sidebar-item'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { ClearHistory } from '@/components/clear-history'
import { SampleConversationsButton } from '@/components/sample-conversations-button'
import { cn } from '@/lib/utils'
import { IS_E2E_MODE } from '@/auth'

export interface SidebarListProps {
  userId?: string | null
  variant?: 'desktop' | 'mobile'
}

function SidebarEmptyState({
  userId
}: {
  userId?: string | null
}) {
  if (!userId) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        Sign in to see your recent conversations.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center">
      <div className="text-sm font-medium text-muted-foreground">
        No conversations yet.
      </div>
      {IS_E2E_MODE ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            Kickstart your workspace with a curated bundle of sample conversations so you can explore the layout without waiting on the backend.
          </p>
          <SampleConversationsButton action={seedSampleChats} />
        </>
      ) : null}
    </div>
  )
}

function SidebarHeader({
  userId,
  className
}: {
  userId?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          {userId ? 'Workspace' : 'Preview'}
        </p>
        <p className="text-sm font-medium text-foreground">
          Recent conversations
        </p>
      </div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-7 border-dashed text-xs"
      >
        <Link href="/">New chat</Link>
      </Button>
    </div>
  )
}

export async function SidebarList({ userId, variant = 'desktop' }: SidebarListProps) {
  const chats = await getChats(userId)
  const headerPadding = variant === 'mobile' ? 'px-4 pt-6' : 'px-4 pt-4'
  const listPadding = variant === 'mobile' ? 'px-4 pb-6' : 'px-2 pb-4'

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label="Conversation history">
      <SidebarHeader userId={userId ?? undefined} className={headerPadding} />
      <div className={cn('mt-4 flex-1 overflow-y-auto', listPadding, 'min-h-0')}>
        {chats?.length ? (
          <div className="space-y-1.5">
            {chats.map(
              chat =>
                chat && (
                  <SidebarItem key={chat.id} chat={chat}>
                    <SidebarActions
                      chat={chat}
                      removeChat={removeChat}
                      shareChat={shareChat}
                    />
                  </SidebarItem>
                )
            )}
          </div>
        ) : (
          <SidebarEmptyState userId={userId ?? undefined} />
        )}
      </div>
      {variant === 'desktop' ? (
        <Suspense fallback={<div className="px-4 pb-4 text-xs text-muted-foreground">Preparing controls…</div>}>
          {userId ? (
            <SidebarFooter className="border-t border-border/80 bg-background/50 px-4 py-3">
              <ThemeToggle />
              <ClearHistory clearChats={clearChats} />
            </SidebarFooter>
          ) : (
            <div className="border-t border-border/80 px-4 py-3 text-xs text-muted-foreground">
              Explore sample dialogues to preview layout features.
            </div>
          )}
        </Suspense>
      ) : null}
    </nav>
  )
}
