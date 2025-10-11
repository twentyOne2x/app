'use client'

import { useCallback, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button';
import styles from './QuestionsOverlay.module.css';
import { IconRecycle } from '@/components/ui/icons'
import { useEntryProfile } from '@/components/entry-profile-context'
import { getDefaultQuestions } from '@/lib/entry-profiles'

interface QuestionListProps {
    onSubmit: (value: string, options?: { newChat?: boolean }) => void; // Function to submit the chat input
    showOverlay: boolean; // Add this prop to control the visibility
}
  
const DEFAULT_QUESTION_FALLBACK = getDefaultQuestions()

export const QuestionList: React.FC<QuestionListProps> = ({ onSubmit, showOverlay }) => {
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

  const questionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (questionRefs.current.length === selectedQuestions.length) {
      questionRefs.current.forEach(box => {
        if (box) {
          const questionText = box.innerText;
          let fontSize;
  
          if (questionText.length <= 50) {
            fontSize = '1.3rem';
          } else if (questionText.length <= 100) {
            fontSize = '1.2rem';
          } else if (questionText.length <= 150) {
            fontSize = '1.05rem';
          } else {
            fontSize = '1.0rem';
          }
  
          box.style.fontSize = fontSize;
        }
      });
    }
  }, [selectedQuestions]);

  const pickRandomQuestions = useCallback(() => {
    setSelectedQuestions(selectRandomQuestions());
  }, [selectRandomQuestions]);
  
  useEffect(() => {
    setSelectedQuestions(selectRandomQuestions());
  }, [selectRandomQuestions]);

  const handleQuestionSelect = (question: string) => {
    onSubmit(question, { newChat: true });
  };

  // Apply fade effect to the questionsContainer based on showOverlay
  const containerClass = showOverlay ? `${styles.questionsContainer} ${styles.fadeIn}` : `${styles.questionsContainer} ${styles.fadeOut}`;

  return (
    <div className={containerClass}>
      <Button
        variant="outline"
        className={`${styles.shuffleButton} rounded-full w-10 h-10`}
        onClick={pickRandomQuestions}
      >
        <span className="sr-only">Shuffle Questions</span>
      </Button>

      <div className={styles.questionsOverlay}>
        {selectedQuestions.map((question, index) => (
          <div key={index} className={styles.questionBox} onClick={() => handleQuestionSelect(question)}>
            <div className={cn(styles.question, styles.fullWidthButton)}>
              {question}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
