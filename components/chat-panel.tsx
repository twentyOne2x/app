import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { ClipLoader } from 'react-spinners'; // Import the desired spinner

import { PromptForm } from '@/components/prompt-form'
import { FooterText } from '@/components/footer'
import { MetadataMessage } from '@/components/chat'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import styles from './ChatListContainer.module.css'; // Import the CSS module
import Image from 'next/image'

const StyledClipLoader = styled(ClipLoader)`
  display: block;
  margin: 0 auto;
`;


export interface ChatPanelProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
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
  onClearChat?: () => void;
}

export function ChatPanel({
  id,
  isLoading,
  input,
  setInput,
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
  setShowChatList,
  onClearChat
}: ChatPanelProps) {
  // Step 1: Create a state variable to track whether the backend response has been received
  const [responseReceived, setResponseReceived] = useState(false);

  useEffect(() => {
    console.debug('chat-panel: loading state changed', { isLoading })
  }, [isLoading])

  useEffect(() => {
    if (!responseReceived) return
    console.debug('chat-panel: response received flag toggled', { responseReceived })
  }, [responseReceived])

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
                  console.info('chat-panel: new chat requested via broom control', { currentInputLength: input.length });
                  onClearChat?.();
                }}
                className={styles.broomButton}
              >
                <Image
                  src="/ui_icons/clear_the_chat_1.svg"
                  alt=""
                  width={32}
                  height={32}
                  className="size-full object-contain"
                  priority
                />
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
