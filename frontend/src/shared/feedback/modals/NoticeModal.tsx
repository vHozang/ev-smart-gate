import type { ReactNode } from 'react';
import { InfoIcon, CheckCircleIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';
import type { FeedbackController, ModalContext } from '../types';

export interface NoticeModalOptions {
  id: string;
  title: string;
  description?: string;
  message: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error';
  confirmText?: string;
  onConfirm?: () => void;
  size?: 'sm' | 'md';
}

export function openNoticeModal(feedback: FeedbackController, options: NoticeModalOptions): boolean {
  const {
    id,
    title,
    description,
    message,
    tone = 'info',
    confirmText = 'Đã hiểu',
    onConfirm,
    size = 'sm',
  } = options;

  const Icon =
    tone === 'success'
      ? CheckCircleIcon
      : tone === 'warning'
        ? WarningCircleIcon
        : tone === 'error'
          ? XCircleIcon
          : InfoIcon;

  return feedback.openModal({
    id,
    title,
    description,
    size,
    renderContent: () => (
      <div className={`notice-modal notice-modal--${tone}`} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <Icon size={28} className={`notice-modal__icon notice-modal__icon--${tone}`} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
        <div className="notice-modal__content" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {message}
        </div>
      </div>
    ),
    renderFooter: (context: ModalContext) => (
      <Button
        variant={tone === 'error' ? 'danger' : 'primary'}
        onClick={() => {
          onConfirm?.();
          context.close();
        }}
      >
        {confirmText}
      </Button>
    ),
  });
}
