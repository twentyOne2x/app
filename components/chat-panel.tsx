import { type UseChatHelpers } from 'ai/react'
import React, { useState } from 'react';
import { css } from '@emotion/react';
import styled from '@emotion/styled';
import { ClipLoader } from 'react-spinners'; // Import the desired spinner

import { Button } from '@/components/ui/button'
import { PromptForm } from '@/components/prompt-form'
import { ButtonScrollToBottom } from '@/components/button-scroll-to-bottom'
import { IconRefresh, IconStop } from '@/components/ui/icons'
import { FooterText } from '@/components/footer'
import { MetadataMessage } from '@/components/chat'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useRouter } from 'next/navigation'
import styles from './ChatListContainer.module.css'; // Import the CSS module

const StyledClipLoader = styled(ClipLoader)`
  display: block;
  margin: 0 auto;
`;


export interface ChatPanelProps
  extends Pick<
    UseChatHelpers,
    | 'append'
    | 'isLoading'
    | 'reload'
    | 'messages'
    | 'stop'
    | 'input'
    | 'setInput'
  > {
  id?: string;
  onSubmit?: (value: string) => void | Promise<void>; // Add this line
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

export interface ChatPanelProps
  extends Pick<
    UseChatHelpers,
    | 'append'
    | 'isLoading'
    | 'reload'
    | 'messages'
    | 'stop'
    | 'input'
    | 'setInput'
  > {
  id?: string;
  onSubmit?: (value: string) => void | Promise<void>; // Add this line
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

export function ChatPanel({
  id,
  isLoading,
  stop,
  append,
  reload,
  input,
  setInput,
  messages,
  onSubmit,
  setMessages,
  setStructuredMetadataEntries,
  setLastMessageRole,
  setShowTopSources,
  setFadeOutCompleted,
  setMetadataContainerVisible,
  setShowLeftPanelOverlay,
  setShowMiddlePanelOverlay,
  setShowEmptyScreen,
  setShowChatList
}: ChatPanelProps) {
  const router = useRouter();

  // Step 1: Create a state variable to track whether the backend response has been received
  const [responseReceived, setResponseReceived] = useState(false);

  // {/* Stop generating/Regenerate response button */}
  // <div className={styles.stopGeneratingButtonContainer}>
  // {isLoading ? (
  //   <Button variant="outline" onClick={() => stop()} className="bg-background">
  //     <IconStop className="mr-2" />
  //     Stop generating
  //   </Button>
  // ) : (
  //   messages?.length > 0 && (
  //     <Button variant="outline" onClick={() => reload()} className="bg-background">
  //       <IconRefresh className="mr-2" />
  //       Regenerate response
  //     </Button>
  //   )
  // )}
  // </div>

  // <ButtonScrollToBottom />
  return (
    <div className={styles.chatPanel}>
      
      <div className={styles.chatPanelWrapper}>
        {/* Loader positioned at the top of the container */}
        {isLoading && (
          <div className={styles.loadingContainer}>
            <StyledClipLoader size={25} color="#007bff" loading={true} />
          </div>
        )}
  

        {/* Broom button and Prompt Form Container */}
        <div className={styles.chatPanelContent}>
          {/* Broom button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={e => {
                  e.preventDefault();
                  setMessages([]);
                  setStructuredMetadataEntries([]);
                  setLastMessageRole('');
                  setInput('');
                  setShowTopSources(false);
                  setFadeOutCompleted(true);
                  setMetadataContainerVisible(false);
                  setShowLeftPanelOverlay(false);
                  setShowMiddlePanelOverlay(true);
                  setShowEmptyScreen(true);
                  setShowChatList(false);
                  router.refresh();
                  router.push('/');
                }}
                className={styles.broomButton}
              >
                <img src="/ui_icons/clear_the_chat_1.svg" style={{ width: '100%', height: '100%' }} />
                <span className="sr-only">New Chat</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>New Chat</TooltipContent>
          </Tooltip>
  
          {/* Prompt Form */}
          <div className={styles.promptFormContainer}>
            <PromptForm
              onSubmit={async value => {
                setResponseReceived(false);
                if (onSubmit) {
                  await onSubmit(value);
                } else {
                  await append({
                    id,
                    content: value,
                    role: 'user',
                  });
                }
                setResponseReceived(true);
              }}
              input={input}
              setInput={setInput}
              isLoading={isLoading}
              setMessages={setMessages}
              setStructuredMetadataEntries={setStructuredMetadataEntries}
              setLastMessageRole={setLastMessageRole}
              setShowTopSources={setShowTopSources}
              setFadeOutCompleted={setFadeOutCompleted}
              setMetadataContainerVisible={setMetadataContainerVisible}
              setShowLeftPanelOverlay={setShowLeftPanelOverlay}
              setShowMiddlePanelOverlay={setShowMiddlePanelOverlay}
              setShowEmptyScreen={setShowEmptyScreen}
              setShowChatList={setShowChatList}
            />
          </div>
        </div>
  
        <FooterText className="hidden sm:block" />
      </div>
    </div>
  );
}
