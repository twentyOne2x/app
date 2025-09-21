// components/markdown.tsx

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';

// Memoize ReactMarkdown to prevent unnecessary re-renders
export const MemoizedReactMarkdown = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
) as typeof ReactMarkdown;
