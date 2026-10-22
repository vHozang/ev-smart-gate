import { createContext, useContext } from 'react';
import type { FeedbackController } from './types';
export const FeedbackContext = createContext<FeedbackController | null>(null);

let registeredResetHandler: (() => void) | null = null;

export function registerFeedbackResetHandler(handler: (() => void) | null): void {
  registeredResetHandler = handler;
}

const fallbackFeedbackController: FeedbackController = {
  openModal: () => false,
  openAlertModal: () => false,
  notify: () => {},
  dismiss: () => {},
  reset: () => {
    registeredResetHandler?.();
  },
};

export function useFeedback(): FeedbackController {
  const context = useContext(FeedbackContext);
  return context ?? fallbackFeedbackController;
}
