import { useChat, UseChatOptions } from 'ai/react';
import { useState, useEffect } from 'react';
import { ExtendedMessage } from '../types'; // Adjust the import path as needed

export function useExtendedChat(options: UseChatOptions) {
    const chat = useChat(options);
    const [extendedMessages, setExtendedMessages] = useState<ExtendedMessage[]>([]);
  
    useEffect(() => {
      // Map over messages and ensure that each one has the structured_metadata property
      const updatedMessages = chat.messages.map((message) => ({
        ...message,
        // Add structured_metadata if it doesn't exist on the message
        structured_metadata: 'structured_metadata' in message ? (message.structured_metadata as any[]) : [],
      }));
      setExtendedMessages(updatedMessages);
    }, [chat.messages]);
  
    return { ...chat, messages: extendedMessages };
  }