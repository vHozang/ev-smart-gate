import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/Button';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';
import type { FeedbackController, ModalContext } from '../types';

export interface EvidenceModalOptions {
  id: string;
  title: string;
  description?: string;
  source: string | Blob | null | undefined;
  alt: string;
  metadata?: Record<string, ReactNode>;
  aspectRatio?: '16/9' | '4/3' | '1/1' | 'auto';
  closeText?: string;
  size?: 'md' | 'lg';
}

export function openEvidenceModal(feedback: FeedbackController, options: EvidenceModalOptions): boolean {
  const {
    id,
    title,
    description,
    source,
    alt,
    metadata,
    aspectRatio = 'auto',
    closeText = 'Đóng',
    size = 'lg',
  } = options;

  return feedback.openModal({
    id,
    title,
    description,
    size,
    renderContent: () => (
      <EvidenceViewer
        source={source}
        alt={alt}
        metadata={metadata}
        aspectRatio={aspectRatio}
      />
    ),
    renderFooter: (context: ModalContext) => (
      <Button onClick={context.close}>{closeText}</Button>
    ),
  });
}
