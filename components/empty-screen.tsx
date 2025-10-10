'use client'

import { QuestionsOverlayLeftPanel, QuestionsOverlayPropsLeftPanel } from './question-overlay';
import { useState, useEffect } from 'react';
import styles from './QuestionsOverlay.module.css';
import { useEntryProfile } from '@/components/entry-profile-context';

export function EmptyScreen({ onSubmit, isVisible }: QuestionsOverlayPropsLeftPanel & { isVisible: boolean }) {
  const [isMobile, setIsMobile] = useState(false);
  const entryProfile = useEntryProfile();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (!isVisible) {
      // Start a timer that matches the fade-out animation duration
      timer = setTimeout(() => {
        // Actions to take after the fade-out animation ends, if any
        // For example, you could set a state here to hide the component or inform a parent component
      }, 300); // The duration should match your CSS animation-duration for fadeOut
    }
    
    // Clear the timer when the component unmounts or if isVisible changes again before the timeout completes
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isVisible]); // Only re-run if isVisible changes

  const overlayClass = isMobile ? `${styles.questionsOverlay} ${styles.mobileHide}` : styles.questionsOverlay;
  const fadeInOutClass = isVisible ? styles.fadeIn : styles.fadeOut;
  
  return (
    <div className={`flex flex-col w-full pb-12 ${fadeInOutClass}`}>
      <div className="w-full rounded-lg border bg-background p-8 text-left">
        <h1 className="mb-2 text-lg font-semibold text-white">
          {entryProfile.headline}
        </h1>
        <p className="mb-4 leading-normal text-muted-foreground">
          {entryProfile.description}
        </p>
      </div>
      
      {/* Only show QuestionsOverlayLeftPanel if on mobile */}
      {isMobile && (
        <div className={`w-full ${overlayClass}`}>
          <QuestionsOverlayLeftPanel onSubmit={onSubmit} showOverlay={true} />
        </div>
      )}
    </div>
  );
}
