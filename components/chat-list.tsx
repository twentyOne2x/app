// components/chat-list.tsx
import React, { forwardRef } from 'react';
import { type Message } from 'ai';
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

  return (
    <div className={`${styles.chatListMaxWidth} ${styles.chatListPadding}`}>
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const attachRef = isLastMessage && lastMessageRole === 'assistant';
        const isAssistant = message.role === 'assistant';
        return (
          <React.Fragment key={index}>
            <div ref={attachRef ? ref : null} className={styles.chatMessageContainer}>
              <ChatMessage message={message} />
            </div>
            {/* Insert "View Sources" button after assistant messages on mobile */}
            {isAssistant && isMobile && (
              <div className={styles.viewSourcesContainer}>
                <button
                  className={styles.viewSourcesButton}
                  onClick={onViewSources}
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
