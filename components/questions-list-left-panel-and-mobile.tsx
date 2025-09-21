import { useCallback, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button';
import { questions } from '@/lib/constants'; // Ensure the path is correct
import styles from './QuestionsOverlay.module.css'; // Import the CSS module
import { IconRecycle } from '@/components/ui/icons'

interface QuestionListProps {
  onSubmit: (value: string) => void; // Function to submit the chat input
  showOverlay: boolean; // Add this prop to control the visibility
}
  
export const QuestionListLeftPanel: React.FC<QuestionListProps> = ({ onSubmit, showOverlay }) => {
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
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
    // Create an array of indices [0, 1, 2, ..., questions.length - 1]
    const indices = Array.from({ length: questions.length }, (_, i) => i);
  
    // Shuffle the indices array
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  
    // Pick the first four indices
    const selectedIndices = indices.slice(0, 4);
  
    // Get the questions corresponding to the selected indices
    const selectedQuestions = selectedIndices.map(index => questions[index]);
  
    setSelectedQuestions(selectedQuestions);
  }, [questions]);
  
  useEffect(() => {
    pickRandomQuestions();
  }, [pickRandomQuestions]);

  const handleQuestionSelect = (question: string) => {
    onSubmit(question); // Call the onSubmit function with the selected question
  };

  // ♻️ {/* Recycle emoji */}
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
      
      <div className={styles.questionsOverlayLeftPanel}>
        {selectedQuestions.map((question, index) => (
          <div key={index} className={styles.questionBoxLeftPanel} onClick={() => handleQuestionSelect(question)}>
            <div className={cn(styles.question, styles.fullWidthButton)}>
              {question}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
