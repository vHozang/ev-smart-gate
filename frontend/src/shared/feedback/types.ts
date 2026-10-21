import type { ReactNode } from 'react';
export interface ModalContext {
  formId: string;
  pending: boolean;
  submitBlocked: boolean;
  setSubmitBlocked: (blocked: boolean) => void;
  close: () => void;
  requestClose: () => void;
  setPending: (pending: boolean) => void;
  setDirty: (dirty: boolean) => void;
}
export interface ModalDescriptor {
  id: string;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  renderContent: (context: ModalContext) => ReactNode;
  renderFooter?: (context: ModalContext) => ReactNode;
}
export interface ToastInput {
  id: string;
  title: string;
  description?: string;
  tone?: 'success' | 'info' | 'warning' | 'error';
  duration?: number | null;
}
export interface FeedbackController {
  openModal: (descriptor: ModalDescriptor) => boolean;
  notify: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
  reset: () => void;
}
