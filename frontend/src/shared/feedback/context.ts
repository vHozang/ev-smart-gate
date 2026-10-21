import { createContext, useContext } from 'react';
import type { FeedbackController } from './types';
export const FeedbackContext = createContext<FeedbackController | null>(null);
export function useFeedback(): FeedbackController {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('Thiếu FeedbackProvider');
  return context;
}
