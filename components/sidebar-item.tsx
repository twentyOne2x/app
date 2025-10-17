'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { type Chat } from '@/lib/types'
import { cn } from '@/lib/utils'
import { IconMessage, IconUsers } from '@/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'

interface SidebarItemProps {
  chat: Chat
  children: React.ReactNode
}

export function SidebarItem({ chat, children }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === chat.path
  const createdAtLabel = React.useMemo(() => {
    if (!chat.createdAt) return ''
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric'
      }).format(new Date(chat.createdAt))
    } catch {
      return ''
    }
  }, [chat.createdAt])

  const preview = React.useMemo(() => {
    if (!chat?.messages?.length) return ''
    const lastAssistant = [...chat.messages]
      .reverse()
      .find(message => message?.role === 'assistant' && typeof message.content === 'string')
    if (!lastAssistant || typeof lastAssistant.content !== 'string') return ''
    return lastAssistant.content.replace(/\s+/g, ' ').trim().slice(0, 96)
  }, [chat.messages])

  if (!chat?.id) return null

  return (
    <div
      className={cn(
        'group relative rounded-md border border-transparent transition-colors',
        isActive
          ? 'border-border bg-muted/40'
          : 'hover:border-border/80 hover:bg-muted/30'
      )}
    >
      <div className="absolute left-3 top-2 flex size-6 items-center justify-center text-muted-foreground">
        {chat.sharePath ? (
          <Tooltip delayDuration={1000}>
            <TooltipTrigger
              tabIndex={-1}
              className="focus:bg-muted focus:ring-1 focus:ring-ring"
            >
              <IconUsers className="mr-2" />
            </TooltipTrigger>
            <TooltipContent>This is a shared chat.</TooltipContent>
          </Tooltip>
        ) : (
          <IconMessage className="mr-2" />
        )}
      </div>
      <Link
        href={chat.path}
        className="flex w-full items-start gap-3 rounded-md px-10 py-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground" title={chat.title}>
              {chat.title || 'Untitled conversation'}
            </span>
            {createdAtLabel ? (
              <time
                className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground"
                dateTime={new Date(chat.createdAt).toISOString()}
              >
                {createdAtLabel}
              </time>
            ) : null}
          </div>
          {preview ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground/90" title={preview}>
              {preview}
              {lastCharacterNeedsEllipsis(preview) ? '…' : ''}
            </p>
          ) : null}
        </div>
      </Link>
      {isActive && <div className="absolute right-2 top-2">{children}</div>}
    </div>
  )
}

function lastCharacterNeedsEllipsis(value: string) {
  if (!value) return false
  return value.length >= 96
}
