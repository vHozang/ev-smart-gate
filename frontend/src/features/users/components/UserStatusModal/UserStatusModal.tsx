import { useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { AdminUser, UserStatusChangeInput } from '../../model/schema';
import { userStatusChangeSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';

export interface UserStatusModalProps {
  user: AdminUser;
  formId: string;
  onSubmit: (data: UserStatusChangeInput) => Promise<void>;
}

export function UserStatusModal({ user, formId, onSubmit }: UserStatusModalProps) {
  const feedback = useFeedback();
  const nextStatus = !user.is_active;
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setReasonError(undefined);

    const parsed = userStatusChangeSchema.safeParse({
      expected_version: user.version,
      reason,
      is_active: nextStatus,
    });

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Vui lòng nhập lý do hợp lệ.';
      setErrorMsg(msg);
      setReasonError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cập nhật trạng thái tài khoản',
        fields: ['Lý do thực hiện thay đổi'],
      });
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-sm" noValidate>
      <div className="p-3 rounded-lg border surface">
        <p className="font-medium text-[var(--color-text)]">
          {nextStatus
            ? `Kích hoạt lại tài khoản: ${user.username}`
            : `Vô hiệu hóa tài khoản: ${user.username}`}
        </p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Phiên bản bản ghi hiện tại: <span className="mono font-semibold">v{user.version}</span>.
          Thao tác này sẽ được ghi vào nhật ký kiểm toán (Audit).
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-xs"
        >
          {errorMsg}
        </div>
      )}

      <Field label="Lý do thực hiện thay đổi" required id="status-reason" error={reasonError}>
        <Input
          id="status-reason"
          value={reason}
          invalid={Boolean(reasonError)}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(undefined);
          }}
          placeholder="Nhập lý do nghiệp vụ (tối thiểu 3 ký tự)..."
          autoFocus
        />
      </Field>
    </form>
  );
}
