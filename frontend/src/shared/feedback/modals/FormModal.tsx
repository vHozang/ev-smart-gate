import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/Button';
import type { FeedbackController, ModalContext } from '../types';

export interface FormModalOptions {
  id: string;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  renderForm: (context: ModalContext) => ReactNode;
  submitText?: string;
  cancelText?: string;
  submitVariant?: 'primary' | 'danger';
}

export function openFormModal(feedback: FeedbackController, options: FormModalOptions): boolean {
  const {
    id,
    title,
    description,
    size = 'md',
    renderForm,
    submitText = 'Lưu thay đổi',
    cancelText = 'Hủy',
    submitVariant = 'primary',
  } = options;

  return feedback.openModal({
    id,
    title,
    description,
    size,
    renderContent: (context: ModalContext) => renderForm(context),
    renderFooter: (context: ModalContext) => (
      <>
        <Button disabled={context.pending} onClick={context.requestClose}>
          {cancelText}
        </Button>
        <Button
          type="submit"
          form={context.formId}
          variant={submitVariant}
          pending={context.pending}
          disabled={context.submitBlocked}
        >
          {submitText}
        </Button>
      </>
    ),
  });
}
