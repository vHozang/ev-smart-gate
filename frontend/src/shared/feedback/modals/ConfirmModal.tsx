import type { ReactNode } from 'react';
import { WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';
import type { FeedbackController, ModalContext } from '../types';

export interface ConfirmModalOptions {
  id: string;
  title: string;
  description?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  danger?: boolean;
  size?: 'sm' | 'md';
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
}

export function openConfirmModal(
  feedback: FeedbackController,
  options: ConfirmModalOptions,
): boolean {
  const {
    id,
    title,
    description,
    message,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    variant = 'danger',
    danger,
    size = 'sm',
    onConfirm,
    onCancel,
  } = options;
  const resolvedVariant = danger ? 'danger' : variant;
  const bodyContent = message ?? description;

  let localError: string | null = null;

  return feedback.openModal({
    id,
    title,
    description,
    size,
    renderContent: () => (
      <div className="confirm-modal" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
          <WarningCircleIcon
            size={26}
            style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '0.125rem' }}
          />
          <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{bodyContent}</div>
        </div>
        {localError && (
          <div className="form-error" role="alert">
            {localError}
          </div>
        )}
      </div>
    ),
    renderFooter: (context: ModalContext) => {
      const handleConfirm = async () => {
        if (context.pending || context.submitBlocked) return;
        try {
          context.setPending(true);
          context.setSubmitBlocked(true);
          localError = null;
          await onConfirm();
          context.setPending(false);
          context.close();
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : 'Thao tác không thành công. Vui lòng thử lại.';
          localError = msg;
          context.setPending(false);
          context.setSubmitBlocked(false);
        }
      };

      return (
        <>
          <Button
            disabled={context.pending}
            onClick={() => {
              onCancel?.();
              context.requestClose();
            }}
          >
            {cancelText}
          </Button>
          <Button
            variant={resolvedVariant}
            pending={context.pending}
            disabled={context.pending || context.submitBlocked}
            onClick={() => void handleConfirm()}
          >
            {confirmText}
          </Button>
        </>
      );
    },
  });
}
