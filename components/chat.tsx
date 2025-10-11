// components/chat.tsx
'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat, type Message } from 'ai/react';
import { cn } from '@/lib/utils'
import { ChatList } from '@/components/chat-list'
import { ChatPanel } from '@/components/chat-panel'
import { EmptyScreen } from '@/components/empty-screen'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { toast } from 'react-hot-toast'
import SourceList from '@/components/source-list';
import ClipDrawer, { type ClipPlayback } from '@/components/clip-drawer';
import ChannelFilterPanel from '@/components/channel-filter';
import { LoginButton } from '@/components/login-button';
import styles from './ChatListContainer.module.css'; // Import the CSS module
import QuestionsOverlayStyles from './QuestionsOverlay.module.css'; // Import the CSS module
import { QuestionsOverlay, QuestionsOverlayLeftPanel } from './question-overlay';
import type { ParsedMetadataEntryV2, ClipItemV2 } from '@/lib/utils';
import Modal from '@/components/Modal'; // Import the Modal component
import { useEntryProfile } from '@/components/entry-profile-context';
import type { DiagnosticsPayload, ChannelFilterPayload } from '@/lib/types';
import { DEFAULT_PIPELINE, normalizeProgress } from '@/lib/progress-display';
import { useClipSelection } from '@/lib/hooks/use-clip-selection'

// Extend the Message type to include structured_metadata
export interface MetadataMessage extends Message {
  structured_metadata?: ParsedMetadataEntryV2[]; // Ideally, define a more specific type instead of any[]
  diagnostics?: DiagnosticsPayload | null;
}

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview'

function RightPanelAuthCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) return null

  return (
    <div className="mb-4 flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/60 p-4 text-center shadow-[0_20px_45px_-25px_rgba(34,197,94,0.45)]">
      <h3 className="text-sm font-semibold text-zinc-100">Sign in for extras</h3>
      <p className="mt-1 text-xs text-zinc-400 max-w-[220px]">
        Connect Twitter or a wallet to save chats, share threads, and unlock future features.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <LoginButton loginType="twitter" text="Twitter" showIcon />
        <LoginButton loginType="privy" text="Privy" showIcon />
      </div>
    </div>
  )
}
export interface ChatProps extends React.ComponentProps<'div'> {
  initialMessages?: MetadataMessage[];
  id?: string;
  showQuestionsOverlay?: boolean; // Prop to toggle QuestionsOverlay visibility
  shared_chat?: boolean; // Prop to toggle shared_chat visibility
  structured_metadata?: ParsedMetadataEntryV2[]; // Optional structured metadata prop
  noPaddingTop?: boolean; // New optional bottom padding property
  currentUser?: {
    id?: string | null
    name?: string | null
    email?: string | null
  } | null
}

export function Chat({
  id,
  initialMessages,
  className,
  showQuestionsOverlay = true,
  shared_chat = false,
  structured_metadata = [], // Initialize structured_metadata with an empty array
  noPaddingTop = false, // New boolean prop for bottom padding
  currentUser = null
}: ChatProps) {
  const [previewToken, setPreviewToken] = useLocalStorage<string | null>(
    'ai-token',
    null
  )
  const entryProfile = useEntryProfile();

  // State to hold structured metadata entries
  const [structuredMetadataEntries, setStructuredMetadataEntries] = useState<ParsedMetadataEntryV2[]>(structured_metadata);
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
  const [selectedClip, setSelectedClip] = useState<{
    parent: ParsedMetadataEntryV2
    clip: ClipItemV2
    playback: ClipPlayback
  } | null>(null);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [currentDiagnostics, setCurrentDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [stageHintTick, setStageHintTick] = useState(0);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);

  const channelFilterStorageKey = useMemo(
    () => `channel-filter:${entryProfile.code}`,
    [entryProfile.code]
  );
  const [excludedChannelNames, setExcludedChannelNames] = useLocalStorage<string[]>(
    channelFilterStorageKey,
    []
  );

  useEffect(() => {
    // Set initialLoad to false after the component has mounted
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    setAvailableChannels([]);
  }, [entryProfile.code]);

  const selectionScope = useMemo(() => {
    if (shared_chat && id) return `shared-chat:${id}`
    return `chat:${entryProfile.code}:${id ?? 'local'}`
  }, [shared_chat, id, entryProfile.code])
  const clipSelection = useClipSelection(selectionScope)

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

  // Process the response content to replace specified phrases with "ICM"
  const processResponseContent = (content: string): string => {
    let processedContent = content;
    processedContent = processedContent.replace(/ICM \(Internet Capital Markets\)/g, "ICM");
    processedContent = processedContent.replace(/Internet Capital Markets \(ICM\)/g, "ICM");
    processedContent = processedContent.replace(/Internet Capital Markets/g, "ICM");
    return processedContent;
  };

  const handleClipSelect = useCallback(
    (payload: { parent: ParsedMetadataEntryV2; clip: ClipItemV2; playback: ClipPlayback }) => {
      setSelectedClip(payload);
    },
    []
  );

  const handleCloseClipDrawer = useCallback(() => {
    setSelectedClip(null);
  }, []);

  const handleExcludedChannelsChange = useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next.filter(Boolean)));
      setExcludedChannelNames(unique);
    },
    [setExcludedChannelNames]
  );

  const channelFilterPayload = useMemo<ChannelFilterPayload | undefined>(() => {
    const unique = Array.from(new Set(excludedChannelNames.filter(Boolean)));
    return unique.length ? { exclude_names: unique } : undefined;
  }, [excludedChannelNames]);

  // Function to parse messages and apply structured metadata
  const parseMessagesAndMetadata = (messages: MetadataMessage[], metadata: ParsedMetadataEntryV2[]) => {
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
    if (!structured_metadata?.length && structuredMetadataEntries.length === 0) return;
    setAvailableChannels((prev) => {
      const next = new Set(prev);
      const source = structuredMetadataEntries.length ? structuredMetadataEntries : structured_metadata;
      source?.forEach((entry) => {
        if (entry.channel) next.add(entry.channel);
      });
      const sorted = Array.from(next);
      sorted.sort((a, b) => a.localeCompare(b));
      return sorted;
    });
  }, [structuredMetadataEntries, structured_metadata]);

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
  
    setIsProcessingQuery(true);
    setCurrentDiagnostics(null);
    setStageHintTick(0);
  
    const newUserMessage: MetadataMessage = {
      id: id || '',  // Provide a fallback value for 'id' to ensure it's not undefined
      content: value,
      role: 'user',  // Assuming 'user' is an acceptable value for 'role'
      structured_metadata: [],  // Assuming this matches the type in MetadataMessage
      diagnostics: null
    };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    try {
      await append(newUserMessage);
    } catch (error) {
      console.error('chat: failed to append message', error)
      toast.error('Unable to reach the chat service. Please try again.')
      setMessages((prev) => (prev.length ? prev.slice(0, -1) : prev))
      setIsProcessingQuery(false)
      setCurrentDiagnostics(null)
      return
    }
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

  const chatRequestBody = useMemo(
    () => ({
      id,
      previewToken,
      entryProfileCode: entryProfile.code,
      channel_filter: channelFilterPayload
    }),
    [id, previewToken, entryProfile.code, channelFilterPayload]
  );

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      initialMessages,
      id,
      body: chatRequestBody,
      onResponse: async (originalResponse) => {
        if (originalResponse.status === 401) {
          setIsProcessingQuery(false);
          setCurrentDiagnostics(null);
          toast.error(originalResponse.statusText);
          return;
        }

        if (!originalResponse.ok) {
          setIsProcessingQuery(false);
          setCurrentDiagnostics(null);
          toast.error(originalResponse.statusText);
          return;
        }

        const response = originalResponse.clone();
        try {
          const responseData = await response.json();

          const diagnostics: DiagnosticsPayload | null = responseData.diagnostics ?? null;
          const responseRequestId: string | null =
            responseData.request_id ??
            diagnostics?.request_id ??
            null;

          const newMessageFromServer: MetadataMessage = {
            id: responseData.message?.id || '',
            role: responseData.message?.role ?? 'assistant',
            content: processResponseContent(responseData.message?.content ?? ''),
            structured_metadata: responseData.message?.structured_metadata || [],
            diagnostics
          };

          setMessages(prevMessages => [...prevMessages, newMessageFromServer]);

          if (responseData.structured_metadata) {
            setStructuredMetadataEntries(responseData.structured_metadata);
          }

          setLastMessageRole('assistant');
          setCurrentDiagnostics(
            diagnostics ??
            (responseRequestId ? ({ request_id: responseRequestId } as DiagnosticsPayload) : null)
          );
          setIsProcessingQuery(false);
        } catch (error) {
          console.error('Error reading response data:', error);
          toast.error('Error reading response data');
          setIsProcessingQuery(false);
          setCurrentDiagnostics(null);
        }
      },
      onError: (error) => {
        console.error('Chat error:', error);
        toast.error('The chat service encountered an error. Please try again.');
        setIsProcessingQuery(false);
        setCurrentDiagnostics(null);
      },
      onFinish: () => {
        setIsProcessingQuery(false);
      }
    })

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoad(false);
    }, 50); // Adjust this delay as needed
  
    return () => clearTimeout(timer); // Cleanup the timer
  }, []);

  useEffect(() => {
    if (!isProcessingQuery) {
      setStageHintTick(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStageHintTick((tick) => tick + 1);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [isProcessingQuery]);

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

  const progressSummary = useMemo(() => {
    if (!isProcessingQuery) return null
    const normalized = normalizeProgress(currentDiagnostics?.progress ?? undefined)
    let activeLabel = 'Processing'
    let completed = 0
    let total = DEFAULT_PIPELINE.length

    if (normalized.length) {
      total = normalized.length
      completed = normalized.filter((stage) => stage.status === 'completed').length
      const currentStage = [...normalized].reverse().find((stage) => stage.status === 'running')
        ?? normalized.find((stage) => stage.status === 'pending')
        ?? normalized[normalized.length - 1]
      if (currentStage?.label) activeLabel = currentStage.label
    } else {
      const labels = DEFAULT_PIPELINE.map((stage) => stage.label)
      const index = stageHintTick % labels.length
      activeLabel = labels[index]
      completed = Math.max(0, Math.min(index, labels.length - 1))
      total = labels.length
    }

    const statusLine = `Progress ${Math.min(completed, total)}/${total}`
    return `▍ Working… ${activeLabel}\n\n${statusLine}`
  }, [isProcessingQuery, currentDiagnostics, stageHintTick])

  const displayMessages = useMemo(() => {
    if (!progressSummary) return newMessages
    const progressMessage: MetadataMessage = {
      id: `progress-status-${newMessages.length}`,
      role: 'assistant',
      content: progressSummary,
      structured_metadata: [],
      diagnostics: null
    }
    return [...newMessages, progressMessage]
  }, [newMessages, progressSummary])

  return (
    <>
      <div className={styles.layoutContainer}>
        <div className={styles.leftPanel}>
          <div className={styles.leftPanelContent}>
            <div className={leftPanelOverlayClass} onAnimationEnd={onAnimationEnd}>
              {/* Render conditionally based on fadeOutCompleted and shared_chat */}
              {!shared_chat && (showLeftPanelOverlay || !fadeOutCompleted) ? (
                <QuestionsOverlayLeftPanel onSubmit={handleUserInputSubmit} showOverlay={showLeftPanelOverlay} />
              ) : null}
            </div>
            {!shared_chat && !isMobile ? (
              <div className={styles.leftPanelFilter}>
                <ChannelFilterPanel
                  channels={availableChannels}
                  excluded={excludedChannelNames}
                  onExcludedChange={handleExcludedChannelsChange}
                />
              </div>
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
                  messages={displayMessages} 
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
              {isMobile && (
                <div className="mb-4">
                  <ChannelFilterPanel
                    channels={availableChannels}
                    excluded={excludedChannelNames}
                    onExcludedChange={handleExcludedChannelsChange}
                  />
                </div>
              )}
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
            <RightPanelAuthCta isAuthenticated={Boolean(currentUser)} />
            {newMessages.length > 0 && (
              <div className={styles.metadataTitle}>Top Sources</div>
            )}
            <SourceList
              entries={structuredMetadataEntries}
              onSelectClip={handleClipSelect}
              selectionScope={selectionScope}
              selection={clipSelection}
            />
          </div>
        </div>
      </div>

      {/* Modal to display MetadataList on mobile */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <h2 className={styles.metadataTitle}>Top Sources</h2>
        <RightPanelAuthCta isAuthenticated={Boolean(currentUser)} />
        <SourceList
          entries={structuredMetadataEntries}
          onSelectClip={handleClipSelect}
          selectionScope={selectionScope}
          selection={clipSelection}
        />
      </Modal>
      <ClipDrawer
        isOpen={Boolean(selectedClip)}
        parent={selectedClip?.parent}
        clip={selectedClip?.clip}
        playback={selectedClip?.playback}
        onClose={handleCloseClipDrawer}
      />
    </>
  );
}

export default Chat;
