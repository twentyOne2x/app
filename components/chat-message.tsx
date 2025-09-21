// components/chat-message.tsx
'use client';
// Inspired by Chatbot-UI and modified to fit the needs of this project
// @see https://github.com/mckaywrigley/chatbot-ui/blob/main/components/Chat/ChatMessage.tsx

import { useState, useEffect } from 'react';
import { Message } from 'ai';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/codeblock';
import { MemoizedReactMarkdown } from '@/components/markdown';
import { ChatMessageActions } from '@/components/chat-message-actions';
import styles from './ChatListContainer.module.css'; // Import the CSS module

import ReactMarkdown from 'react-markdown';
import Image from 'next/image'; // Import Next.js Image component

// **Define the Props Interface for ChatMessage**
export interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message, ...props }: ChatMessageProps) {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    // Set the initial value
    handleResize();

    // Listen for window resize events
    window.addEventListener('resize', handleResize);

    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // **Define Custom Renderers for ReactMarkdown**
  const components = {
    // Custom paragraph renderer
    p: ({ children, ...props }: ParagraphProps) => (
      <p {...props} className="mb-2 last:mb-0">
        {children}
      </p>
    ),
    
    // Custom code renderer
    code: ({ inline, className, children, ...props }: CodeRendererProps) => {
      // Handle the special '▍' character
      if (children === '▍') {
        return <span className="mt-1 cursor-default animate-pulse">▍</span>;
      }

      // Replace '`▍`' with '▍'
      const modifiedContent = children.replace('`▍`', '▍');

      // If it's inline code, render a <code> element
      if (inline) {
        return (
          <code className={className} {...props}>
            {modifiedContent}
          </code>
        );
      }

      // Extract language from className (e.g., 'language-js')
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      return (
        <CodeBlock
          key={modifiedContent} // Use content as key instead of Math.random() for stability
          language={language}
          value={modifiedContent.trimEnd()} // Remove trailing newline if present
          {...props}
        />
      );
    },
  } as any; // Type assertion to bypass TypeScript checks

  return (
    <div
      className={cn('group relative mb-4 flex items-start md:-ml-12')}
      {...props}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow bg-background',
          styles.chatMessageIcon // Apply the chatMessageIcon class
        )}
      >
        {message.role === 'user' ? (
          <Image
            src="/ui_icons/user_2.svg"
            alt="User Icon"
            width={28} // 70% of 40px (h-8, w-8)
            height={28}
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <Image
            src="/ui_icons/chatbot_1.svg"
            alt="Chatbot Icon"
            width={28}
            height={28}
            style={{ objectFit: 'contain' }}
          />
        )}
      </div>
      <div className={cn("flex-1 px-1 ml-4 space-y-2 overflow-hidden", styles.chatMessageContent)}>
        <MemoizedReactMarkdown
          className={`prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 
          ${isMobile ? styles.customMarkdownFontMobile : styles.customMarkdownFont}`}
          remarkPlugins={[remarkGfm, remarkMath]}
          components={components}
        >
          {message.content}
        </MemoizedReactMarkdown>
        <ChatMessageActions message={message} />
      </div>
    </div>
  );
}

// **Define the Props Interfaces**
interface ParagraphProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

interface CodeRendererProps extends React.HTMLAttributes<HTMLElement> {
  inline: boolean;
  className?: string;
  children: string;
}
