// components/chat-list.tsx
import React, { forwardRef } from 'react';
import { type Message } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { ChatMessage } from '@/components/chat-message';
import styles from './ChatListContainer.module.css';

export interface ChatListProps {
  messages: Message[];
  lastMessageRole: string;
  onViewSources: () => void; // New prop for handling "View Sources" button click
  isMobile: boolean; // New prop to determine if the device is mobile
}

const ChatListComponent = ({ messages, lastMessageRole, onViewSources, isMobile }: ChatListProps, ref: React.Ref<HTMLDivElement>) => {
  if (!messages.length) {
    return null;
  }

  const safeMessages = messages.filter((message) => {
    const valid =
      message &&
      typeof message === 'object' &&
      typeof message.role === 'string' &&
      'content' in message
    if (!valid) {
      console.warn('chat:list skipping invalid message', message)
    }
    return valid
  })

  if (!safeMessages.length) {
    return null
  }

  console.debug('chat-list: rendering safe messages', {
    total: messages.length,
    safe: safeMessages.length,
    lastMessageRole,
    isMobile
  })

  return (
    <div className={`${styles.chatListMaxWidth} ${styles.chatListPadding}`} data-testid="chat-list">
      {safeMessages.map((message, index) => {
        const isLastMessage = index === safeMessages.length - 1;
        const attachRef = isLastMessage && lastMessageRole === 'assistant';
        const isAssistant = message.role === 'assistant';
        return (
          <React.Fragment key={index}>
            <div
              ref={attachRef ? ref : null}
              className={styles.chatMessageContainer}
              data-testid="chat-message"
            >
              <ChatMessage message={message} />
            </div>
            {/* Insert "View Sources" button after assistant messages on mobile */}
            {isAssistant && isMobile && (
              <div className={styles.viewSourcesContainer}>
                <button
                  className={styles.viewSourcesButton}
                  onClick={() => {
                    console.debug('chat-list: view sources requested from mobile prompt', {
                      messageIndex: index
                    })
                    onViewSources()
                  }}
                  aria-label="View Sources"
                >
                  View Sources →
                </button>
              </div>
            )}
            {/* Add separator if not the last message */}
            {!isLastMessage && <Separator className="my-4 md:my-8" />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const ChatList = forwardRef(ChatListComponent);
ChatList.displayName = 'ChatList';
