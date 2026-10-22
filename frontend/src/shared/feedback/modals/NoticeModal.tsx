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

export function openNoticeModal(
  feedback: FeedbackController,
  options: NoticeModalOptions,
): boolean {
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
      <div
        className={`notice-modal notice-modal--${tone}`}
        style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}
      >
        <Icon
          size={28}
          className={`notice-modal__icon notice-modal__icon--${tone}`}
          style={{ flexShrink: 0, marginTop: '0.125rem' }}
        />
        <div
          className="notice-modal__content"
          style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
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

export interface ValidationNoticeModalOptions {
  id?: string;
  title?: string;
  description?: string;
  fields: string[];
  confirmText?: string;
}

export function openValidationNoticeModal(
  feedback: FeedbackController,
  options: ValidationNoticeModalOptions,
): boolean {
  const {
    id = 'validation-notice-modal',
    title = 'Thiếu hoặc sai thông tin bắt buộc',
    description = 'Vui lòng kiểm tra và hoàn thiện các trường thông tin được đánh dấu trước khi thực hiện:',
    fields,
    confirmText = 'Đã hiểu',
  } = options;

  const uniqueFields = Array.from(new Set(fields.filter((f) => f.trim().length > 0)));
  if (uniqueFields.length === 0) return false;

  const opener = feedback.openAlertModal ?? feedback.openModal;
  return opener({
    id,
    title,
    description,
    size: 'sm',
    renderContent: () => (
      <div
        className="notice-modal notice-modal--warning"
        style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}
      >
        <WarningCircleIcon
          size={28}
          className="notice-modal__icon notice-modal__icon--warning"
          style={{ flexShrink: 0, marginTop: '0.125rem', color: 'var(--status-warning, #d97706)' }}
        />
        <div
          className="notice-modal__content"
          style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
          <ul
            style={{
              margin: '0 0 0.75rem',
              paddingLeft: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            {uniqueFields.map((field) => (
              <li key={field}>
                <strong>{field}</strong>: Cần nhập đầy đủ hoặc đúng định dạng quy định.
              </li>
            ))}
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: '0.825rem' }}>
            Chi tiết yêu cầu của từng trường đã được hiển thị trực tiếp bên dưới ô nhập liệu tương ứng.
          </p>
        </div>
      </div>
    ),
    renderFooter: (context: ModalContext) => (
      <Button variant="primary" onClick={() => context.close()}>
        {confirmText}
      </Button>
    ),
  });
}
