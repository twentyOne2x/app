import * as React from 'react'
import Textarea from 'react-textarea-autosize'

import { Button, buttonVariants } from '@/components/ui/button'
import { IconArrowElbow, IconPlus, IconNewChat } from '@/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { MetadataMessage } from './chat'
import { IconBroom } from '@/components/ui/icons'
import styles from './ChatListContainer.module.css'; // Import the CSS module
import Image from 'next/image'

export interface PromptProps {
  input: string
  setInput: (value: string) => void
  onSubmit: (value: string, options?: { newChat?: boolean }) => Promise<void>
  isLoading: boolean
  inputDisabled?: boolean
  // Add new properties for the state-setting functions
  setMessages: (messages: MetadataMessage[]) => void;
  setStructuredMetadataEntries: (entries: any[]) => void; // Replace 'any[]' with a more specific type if available
  setLastMessageRole: (role: string) => void;
  setShowTopSources: (value: boolean) => void;
  setFadeOutCompleted: (value: boolean) => void;
  setMetadataContainerVisible: (value: boolean) => void;
  setShowLeftPanelOverlay: (value: boolean) => void;
  setShowMiddlePanelOverlay: (value: boolean) => void;
  setShowEmptyScreen: (value: boolean) => void;
  setShowChatList: (value: boolean) => void;
}

export function PromptForm({
  onSubmit,
  input,
  setInput,
  isLoading,
  inputDisabled = false,
  setMessages,
  setStructuredMetadataEntries,
  setLastMessageRole,
  setShowTopSources,
  setFadeOutCompleted,
  setMetadataContainerVisible,
  setShowLeftPanelOverlay,
  setShowMiddlePanelOverlay,
  setShowEmptyScreen,
  setShowChatList,
}: PromptProps) {
  const { formRef, onKeyDown } = useEnterSubmit()
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        const trimmed = input?.trim() ?? ''
        if (!trimmed) {
          console.debug('prompt-form: submission blocked for empty input')
          return;
        }
        console.debug('prompt-form: submitting prompt', {
          length: trimmed.length,
          preview: trimmed.slice(0, 120)
        })
        setInput('');
        await onSubmit(trimmed);
        console.debug('prompt-form: submission completed', { length: trimmed.length })
      }}
      ref={formRef}
      className={styles.promptForm}
    >
      <div className={styles.promptFormInner}>
        <Textarea
          ref={inputRef}
          onKeyDown={onKeyDown}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={inputDisabled ? 'Sign in to continue chatting.' : 'Send a message.'}
          spellCheck={false}
          className={styles.promptTextarea}
          data-testid="prompt-textarea"
          disabled={inputDisabled}
        />
        <div className={styles.sendButtonContainer}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" size="icon" disabled={isLoading || input === '' || inputDisabled}>
                <Image
                  src="/ui_icons/send_chat_2.svg"
                  alt="Send"
                  width={24}
                  height={24}
                  className="size-6"
                  priority
                />
                <span className="sr-only">Send message</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </form>
  );
}
