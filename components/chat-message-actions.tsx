'use client'

import { type Message } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { IconCheck, IconCopy } from '@/components/ui/icons'
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'
import { coerceContent } from '@/lib/coerce-content'

interface ChatMessageActionsProps extends React.ComponentProps<'div'> {
  message: Message
}

export function ChatMessageActions({
  message,
  className,
  ...props
}: ChatMessageActionsProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 })
  const content = coerceContent(message.content)

  const onCopy = () => {
    if (isCopied) {
      console.debug('chat-message-actions: copy skipped because content already copied')
      return
    }
    const messageId =
      message && typeof message === 'object' && 'id' in message ? (message as { id?: string }).id ?? null : null
    console.debug('chat-message-actions: copying message content', {
      messageId,
      length: content.length
    })
    copyToClipboard(content)
  }

  return (
    <div
      className={cn(
        'flex items-center justify-end transition-opacity group-hover:opacity-100 md:absolute md:-right-10 md:-top-2 md:opacity-0',
        className
      )}
      {...props}
    >
      <Button variant="ghost" size="icon" onClick={onCopy}>
        {isCopied ? <IconCheck /> : <IconCopy />}
        <span className="sr-only">Copy message</span>
      </Button>
    </div>
  )
}
