import React from 'react';
import { QuestionList } from '@/components/questions-list';
import { QuestionListLeftPanel } from '@/components/questions-list-left-panel-and-mobile';
import styles from './QuestionsOverlay.module.css'; // Import the CSS module

export interface QuestionsOverlayProps {
  onSubmit: (value: string) => void; // Function to submit the chat input
  showOverlay: boolean; // Add this prop to control the visibility
}

export interface QuestionsOverlayPropsLeftPanel {
  onSubmit: (value: string) => void; // Function to submit the chat input
  showOverlay: boolean; // Add this prop to control the visibility
}


// Inside QuestionsOverlay component
export const QuestionsOverlay: React.FC<QuestionsOverlayProps> = ({ onSubmit, showOverlay }) => {
    return (
      <div className={styles.questionsOverlay}>
        <QuestionList onSubmit={onSubmit} showOverlay={showOverlay} />
      </div>
    );
  };

  // Inside QuestionsOverlay component
export const QuestionsOverlayLeftPanel: React.FC<QuestionsOverlayPropsLeftPanel> = ({ onSubmit, showOverlay }) => {
  return (
    <div className={styles.questionsOverlayLeftPanel}>
      <QuestionListLeftPanel onSubmit={onSubmit} showOverlay={showOverlay} />
    </div>
  );
};

