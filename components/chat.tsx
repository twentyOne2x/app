// components/chat.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react';
import { useChat, type Message } from 'ai/react';
import { cn } from '@/lib/utils'
import { ChatList } from '@/components/chat-list'
import { ChatPanel } from '@/components/chat-panel'
import { EmptyScreen } from '@/components/empty-screen'
import ShareButton from '@/components/share-button'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { toast } from 'react-hot-toast'
import MetadataList from '@/components/metadata-list';
import styles from './ChatListContainer.module.css'; // Import the CSS module
import QuestionsOverlayStyles from './QuestionsOverlay.module.css'; // Import the CSS module
import { QuestionsOverlay, QuestionsOverlayLeftPanel } from './question-overlay';
import { ParsedMetadataEntry } from 'lib/types';
import Modal from '@/components/Modal'; // Import the Modal component

// Extend the Message type to include structured_metadata
export interface MetadataMessage extends Message {
  structured_metadata?: ParsedMetadataEntry[]; // Ideally, define a more specific type instead of any[]
}

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview'
export interface ChatProps extends React.ComponentProps<'div'> {
  initialMessages?: MetadataMessage[];
  id?: string;
  showQuestionsOverlay?: boolean; // Prop to toggle QuestionsOverlay visibility
  shared_chat?: boolean; // Prop to toggle shared_chat visibility
  structured_metadata?: ParsedMetadataEntry[]; // Optional structured metadata prop
  noPaddingTop?: boolean; // New optional bottom padding property
}

export function Chat({
  id,
  initialMessages,
  className,
  showQuestionsOverlay = true,
  shared_chat = false,
  structured_metadata = [], // Initialize structured_metadata with an empty array
  noPaddingTop = false, // New boolean prop for bottom padding
}: ChatProps) {
  const [previewToken, setPreviewToken] = useLocalStorage<string | null>(
    'ai-token',
    null
  )

  // State to hold structured metadata entries
  const [structuredMetadataEntries, setStructuredMetadataEntries] = useState<ParsedMetadataEntry[]>(structured_metadata);
  // State to control the visibility of "Top Sources" title
  const [showTopSources, setShowTopSources] = useState(false);
  const [newMessages, setMessages] = useState(initialMessages || []);
  const [lastMessageRole, setLastMessageRole] = useState('assistant');

  // Initialize a state to control the initial render of QuestionsOverlay
  const [initialLoad, setInitialLoad] = useState(true);

  // Additional state to track if the fade-out animation has completed
  const [fadeOutCompleted, setFadeOutCompleted] = useState(true);

  const [metadataContainerVisible, setMetadataContainerVisible] = useState(false);

  // State to control the visibility of QuestionsOverlayLeftPanel
  const [showLeftPanelOverlay, setShowLeftPanelOverlay] = useState(false);  

  // New state for controlling the visibility of QuestionsOverlay
  const [showMiddlePanelOverlay, setShowMiddlePanelOverlay] = useState(true);

  const [showEmptyScreen, setShowEmptyScreen] = useState(true);
  const [showChatList, setShowChatList] = useState(false); // New state for ChatList visibility
  const [isMobile, setIsMobile] = useState(false);

  // State for Modal
  const [isModalOpen, setIsModalOpen] = useState(false);


  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);
  }, []);

  // Effect to toggle visibility of metadataContainer based on structuredMetadataEntries
  useEffect(() => {
    let timer1: number | null = null;
    let timer2: number | null = null;

    if (structuredMetadataEntries.length > 0) {
      setShowTopSources(true); // Show "Top Sources" once there are entries

      // Set a timeout to fade out first
      timer1 = window.setTimeout(() => {
        setMetadataContainerVisible(false);
      }, 500); // Adjust this duration to match your CSS transition

      // Set another timeout to fade back in
      timer2 = window.setTimeout(() => {
        setMetadataContainerVisible(true);
      }, 500); // This starts after the first timer completes
    }

    return () => {
      if (timer1 !== null) clearTimeout(timer1);
      if (timer2 !== null) clearTimeout(timer2);
    };
  }, [structuredMetadataEntries]);

  // Process the response content to replace specified phrases with "MEV"
  const processResponseContent = (content: string): string => {
    let processedContent = content;
    processedContent = processedContent.replace(/MEV \(Maximal Extractable Value\)/g, "MEV");
    processedContent = processedContent.replace(/Maximal Extractable Value \(MEV\)/g, "MEV");
    processedContent = processedContent.replace(/Maximal Extractable Value/g, "MEV");
    return processedContent;
  };

  // Function to parse messages and apply structured metadata
  const parseMessagesAndMetadata = (messages: MetadataMessage[], metadata: ParsedMetadataEntry[]) => {
    const parsedMessages = messages.map((message) => {
      if (message.role === 'assistant') {
        try {
          // Try to parse the content as JSON
          const parsedContent = JSON.parse(message.content);
          
          // Check if parsedContent has a messages array and it's not empty
          if (parsedContent.message) {
            // Replace content with the last message of the messages array
            message.content = processResponseContent(parsedContent.message.content);
          }
        } catch (error) {
          // If parsing fails or doesn't meet criteria, leave content as is
          console.error("Error parsing message content:", error);
        }
      }
      return message;
    });
  
    // Apply structured metadata
    setMessages(parsedMessages);
    setLastMessageRole('assistant');
    setStructuredMetadataEntries(metadata);
  };

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);
    
    // Check if initialMessages and structured_metadata are not empty and apply parsing
    if (initialMessages && initialMessages.length > 0 && structured_metadata && structured_metadata.length > 0) {
      // useEffect in shared chat
      parseMessagesAndMetadata(initialMessages, structured_metadata);
    }

    // Set showChatList to true when shared_chat is true
    if (shared_chat) {
      setShowChatList(true);
    }
  }, [shared_chat]);

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

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);

    // Set showChatList to true when shared_chat is true
    if (shared_chat) {
      setShowChatList(true);
    }
  }, [shared_chat]);

  // Function to handle user input submission
  const handleUserInputSubmit = async (value: string) => {
    // Fade out EmptyScreen and QuestionsOverlay
    setShowMiddlePanelOverlay(false);

    // Set a timeout to hide the EmptyScreen after the fade-out animation
    setTimeout(() => {
      setShowEmptyScreen(false);
    }, 300); // This should match the duration of the fade-out animation

    // Delay the fade-in of ChatList
    setTimeout(() => {
      setShowChatList(true); // Show ChatList with fade-in
    }, 300); // Delay should match the fade-out duration
  
    const newUserMessage: MetadataMessage = {
      id: id || '',  // Provide a fallback value for 'id' to ensure it's not undefined
      content: value,
      role: 'user',  // Assuming 'user' is an acceptable value for 'role'
      structured_metadata: []  // Assuming this matches the type in MetadataMessage
    };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    append(newUserMessage);
    setLastMessageRole('user');
    // Hide the QuestionsOverlayLeftPanel on user input
    setShowLeftPanelOverlay(false);
    
    // Hide the middle panel overlay on user input
    setShowMiddlePanelOverlay(false);
    setFadeOutCompleted(false); // Animation starts, not yet completed
  };
  
  // Add an animation end handler
  const onAnimationEnd = () => {
    if (!showLeftPanelOverlay) {
      setFadeOutCompleted(true); // Animation completed
    }
  };

  // Update visibility of QuestionsOverlayLeftPanel based on message count and lastMessageRole
  useEffect(() => {
    // Show the overlay only if there are messages and the last message is from the assistant
    setShowLeftPanelOverlay(newMessages.length > 0 && lastMessageRole === 'assistant');
  }, [newMessages, lastMessageRole]);
  
  // Create a ref for the end of the chat list
  const chatListEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const attemptScroll = () => {
      if (lastMessageRole === 'assistant' && chatListEndRef.current) {
        const chatListElement = chatListEndRef.current.closest('.scrollableContainer'); // Use closest to find the scrollable container
        if (chatListElement) {
          const messageHeight = chatListEndRef.current.clientHeight;
          const messageTop = chatListEndRef.current.offsetTop;
          const containerHeight = chatListElement.clientHeight;
  
          const scrollPosition = messageTop + messageHeight / 2 - containerHeight / 2;
          chatListElement.scrollTop = scrollPosition;
        }
      }
    };
    // Use setTimeout to allow time for the message to fully render, especially if it contains images
    const timeoutId = setTimeout(attemptScroll, 100);
  
    return () => clearTimeout(timeoutId);
  }, [newMessages, lastMessageRole]);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      initialMessages,
      id,
      body: {
        id,
        previewToken
      },
      onResponse: async (originalResponse) => {
        if (originalResponse.status === 401) {
          toast.error(originalResponse.statusText);
        } else if (originalResponse.ok) {
          const response = originalResponse.clone();
          try {
            const responseData = await response.json();
      
            // Adjust for the simplified payload structure
            const newMessageFromServer = {
              id: responseData.message.id || '', // Generate or use an existing ID
              role: responseData.message.role,
              content: processResponseContent(responseData.message.content),
              structured_metadata: responseData.message.structured_metadata || []
            };
            // Update the chat list with the new message from the server
            setMessages(prevMessages => [...prevMessages, newMessageFromServer]);
            
            // Update structured metadata state if it's part of the response
            if (responseData.structured_metadata) {
              setStructuredMetadataEntries(responseData.structured_metadata);
            }
      
            // Update structured metadata state
            setLastMessageRole('assistant');

            // Show the "View Sources" button when assistant responds

          } catch (error) {
            console.error('Error reading response data:', error);
            toast.error('Error reading response data');
          }
        }
      }
    })

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoad(false);
    }, 50); // Adjust this delay as needed
  
    return () => clearTimeout(timer); // Cleanup the timer
  }, []);

  // Determine the overlay class for QuestionsOverlay
  const overlayClass = isMobile 
    ? `${styles.questionsOverlay} ${styles.mobileHide}` 
    : initialLoad || (newMessages.length === 0 && showMiddlePanelOverlay)
      ? `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeIn}`
      : `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeOut}`;

  // Determine the overlay class for QuestionsOverlayLeftPanel
  const leftPanelOverlayClass = showLeftPanelOverlay 
    ? `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeIn}` 
    : `${styles.questionsOverlay} ${QuestionsOverlayStyles.fadeOut}`;

  const metadataContainerClass = cn(styles.metadataContainer, {
    [styles.metadataContainerVisible]: metadataContainerVisible,
  });

 // Assuming noPaddingTop is a boolean that dictates the presence of padding-top
 const middlePanelClass = cn(styles.middlePanel, {
   [styles.middlePanelNoPaddingTop]: noPaddingTop,
 });

 // Assuming noPaddingTop is a boolean that dictates the presence of padding-top
 const rightPanelClass = cn(styles.rightPanel, {
  [styles.rightPanelNoPaddingTop]: noPaddingTop,
  });

  return (
    <>
      <div className={styles.layoutContainer}>
        <div className={styles.leftPanel}>
          <div className={leftPanelOverlayClass} onAnimationEnd={onAnimationEnd}>
            {/* Render conditionally based on fadeOutCompleted and shared_chat */}
            {!shared_chat && (showLeftPanelOverlay || !fadeOutCompleted) ? (
              <QuestionsOverlayLeftPanel onSubmit={handleUserInputSubmit} showOverlay={showLeftPanelOverlay} />
            ) : null}
          </div>
        </div>

        <div className={middlePanelClass}>
          <div className={styles.scrollableContainer}>
            {/* Conditional rendering for ChatList */}
            {showChatList && (
              <div className={QuestionsOverlayStyles.fadeIn}>
                <ChatList 
                  ref={chatListEndRef} 
                  messages={newMessages} 
                  lastMessageRole={lastMessageRole}
                  onViewSources={() => setIsModalOpen(true)}
                  isMobile={isMobile}
                />
              </div>
            )}

            {/* Conditional rendering for EmptyScreen */}
            {!shared_chat && !showChatList && showEmptyScreen && (
              <div className={QuestionsOverlayStyles.fadeIn}>
                <EmptyScreen onSubmit={handleUserInputSubmit} showOverlay={showMiddlePanelOverlay} isVisible={showEmptyScreen} />
              </div>
            )}

            {newMessages.length === 0 && !isMobile && showQuestionsOverlay && (
              <div className={`${overlayClass} ${showMiddlePanelOverlay ? QuestionsOverlayStyles.fadeIn : QuestionsOverlayStyles.fadeOut}`}>
                <QuestionsOverlay onSubmit={handleUserInputSubmit} showOverlay={showMiddlePanelOverlay} />
              </div>
            )}
          </div>
          

          {!shared_chat && (
            <div className={styles.chatPanel}>
              <ChatPanel
                id={id}
                isLoading={isLoading}
                stop={stop}
                append={append}
                reload={reload}
                messages={newMessages}
                input={input}
                setInput={setInput}
                onSubmit={handleUserInputSubmit}
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
          )}
        </div>

        <div className={rightPanelClass}>
          <div className={metadataContainerClass}>
            {newMessages.length > 0 && (
              <div className={styles.metadataTitle}>Top Sources</div>
            )}
            <MetadataList entries={structuredMetadataEntries} />
          </div>
        </div>
      </div>

      {/* Modal to display MetadataList on mobile */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <h2 className={styles.metadataTitle}>Top Sources</h2>
        <MetadataList entries={structuredMetadataEntries} />
      </Modal>
    </>
  );
}

export default Chat;
