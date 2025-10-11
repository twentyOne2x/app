'use client'

import { useCallback, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button';
import styles from './QuestionsOverlay.module.css';
import { IconRecycle } from '@/components/ui/icons'
import { useEntryProfile } from '@/components/entry-profile-context'
import { getDefaultQuestions } from '@/lib/entry-profiles'

interface QuestionListProps {
  onSubmit: (value: string) => void; // Function to submit the chat input
  showOverlay: boolean; // Add this prop to control the visibility
}

const DEFAULT_QUESTION_FALLBACK = getDefaultQuestions()

export const QuestionListLeftPanel: React.FC<QuestionListProps> = ({ onSubmit, showOverlay }) => {
  const [isMobile, setIsMobile] = useState(false);
  const entryProfile = useEntryProfile();
  const questionPool = entryProfile.questions?.length ? entryProfile.questions : DEFAULT_QUESTION_FALLBACK;
  const selectRandomQuestions = useCallback(() => {
    if (!questionPool.length) return []
    if (questionPool.length <= 4) return questionPool
    const indices = Array.from({ length: questionPool.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const selectedIndices = indices.slice(0, 4)
    return selectedIndices.map((index) => questionPool[index])
  }, [questionPool])
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(() => selectRandomQuestions());
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

  const questionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Your existing useEffect with added mobile logic
  useEffect(() => {
    if (questionRefs.current.length === selectedQuestions.length) {
      questionRefs.current.forEach(box => {
        if (box) {
          const questionText = box.innerText;
          let fontSize;
          
          // Adjust font sizes based on isMobile state
          if (isMobile) {
            if (questionText.length <= 50) {
              fontSize = '1.2rem'; // Smaller font size for mobile
            } else if (questionText.length <= 100) {
              fontSize = '1.1rem';
            } else if (questionText.length <= 150) {
              fontSize = '0.95rem';
            } else {
              fontSize = '0.85rem';
            }
          } else {
            // Desktop sizes
            if (questionText.length <= 50) {
              fontSize = '1.1rem';
            } else if (questionText.length <= 100) {
              fontSize = '1rem';
            } else if (questionText.length <= 150) {
              fontSize = '0.90rem';
            } else {
              fontSize = '0.80rem';
            }
          }

          box.style.fontSize = fontSize;
        }
      });
    }
  }, [selectedQuestions, isMobile]); // Include isMobile in dependency array

  const pickRandomQuestions = useCallback(() => {
    setSelectedQuestions(selectRandomQuestions());
  }, [selectRandomQuestions]);
  
  useEffect(() => {
    setSelectedQuestions(selectRandomQuestions());
  }, [selectRandomQuestions]);

  const handleQuestionSelect = (question: string) => {
    onSubmit(question); // Call the onSubmit function with the selected question
  };

  // ♻️ {/* Recycle emoji */}
 // Apply fade effect to the questionsContainer based on showOverlay
  const containerClass = showOverlay ? `${styles.questionsContainer} ${styles.fadeIn}` : `${styles.questionsContainer} ${styles.fadeOut}`;

  return (
    <div className={containerClass}>
      <div className="flex w-full items-center justify-between px-2">
        <Button
          variant="outline"
          className={`${styles.shuffleButton} rounded-full w-10 h-10`}
          onClick={pickRandomQuestions}
        >
          <span className="sr-only">Shuffle Questions</span>
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-10 rounded-full border border-white/15 text-xs text-zinc-200 hover:bg-white/10"
          onClick={() => setSelectedQuestions(selectRandomQuestions())}
        >
          ↻
        </Button>
      </div>

      <div className={styles.questionsOverlayLeftPanel}>
        {selectedQuestions.length === 0 ? (
          <div className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-zinc-200">
            No suggestions available.
          </div>
        ) : (
          selectedQuestions.map((question, index) => (
            <div key={index} className={styles.questionBoxLeftPanel}>
              <button
                type="button"
                className={cn(styles.question, styles.fullWidthButton)}
                onClick={() => handleQuestionSelect(question)}
              >
                {question}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
