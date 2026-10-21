import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/Button';
import type { FeedbackController, ModalContext } from '../types';

export interface DetailModalOptions {
  id: string;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  renderContent: (context: ModalContext) => ReactNode;
  closeText?: string;
  extraActions?: (context: ModalContext) => ReactNode;
}

export function openDetailModal(
  feedback: FeedbackController,
  options: DetailModalOptions,
): boolean {
  const {
    id,
    title,
    description,
    size = 'md',
    renderContent,
    closeText = 'Đóng',
    extraActions,
  } = options;

  return feedback.openModal({
    id,
    title,
    description,
    size,
    renderContent: (context: ModalContext) => renderContent(context),
    renderFooter: (context: ModalContext) => (
      <>
        {extraActions && extraActions(context)}
        <Button onClick={context.close}>{closeText}</Button>
      </>
    ),
  });
}
