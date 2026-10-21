import { useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { AdminUser, PasswordResetInput } from '../../model/schema';
import { passwordResetSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';

export interface PasswordResetModalProps {
  user: AdminUser;
  formId: string;
  onSubmit: (data: PasswordResetInput) => Promise<void>;
}

export function PasswordResetModal({ user, formId, onSubmit }: PasswordResetModalProps) {
  const feedback = useFeedback();
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    temporary_password?: string;
    reason?: string;
  }>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    const parsed = passwordResetSchema.safeParse({
      expected_version: user.version,
      reason,
      temporary_password: temporaryPassword,
    });

    if (!parsed.success) {
      const nextErrors: typeof fieldErrors = {};
      const missing: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'temporary_password' && !nextErrors.temporary_password) {
          nextErrors.temporary_password = issue.message;
          missing.push('Mật khẩu tạm thời mới');
        } else if (key === 'reason' && !nextErrors.reason) {
          nextErrors.reason = issue.message;
          missing.push('Lý do đặt lại mật khẩu');
        }
      }
      setFieldErrors(nextErrors);
      setErrorMsg(
        parsed.error.issues[0]?.message || 'Vui lòng nhập mật khẩu tối thiểu 12 ký tự và lý do.',
      );
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cấp lại mật khẩu',
        fields: missing,
      });
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-sm" noValidate>
      <div className="p-3 rounded-lg border surface">
        <p className="font-medium text-[var(--color-text)]">
          Cấp lại mật khẩu tạm thời cho: <span className="mono font-semibold">{user.username}</span>
        </p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Phiên bản bản ghi: <span className="mono font-semibold">v{user.version}</span>. Sau khi
          đặt lại, tài khoản sẽ chuyển sang trạng thái{' '}
          <strong>buộc đổi mật khẩu ở lần đăng nhập đầu tiên</strong>.
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

      <Field
        label="Mật khẩu tạm thời mới"
        required
        id="temp-password"
        error={fieldErrors.temporary_password}
      >
        <Input
          id="temp-password"
          type="password"
          value={temporaryPassword}
          invalid={Boolean(fieldErrors.temporary_password)}
          onChange={(e) => {
            setTemporaryPassword(e.target.value);
            if (fieldErrors.temporary_password) {
              setFieldErrors((prev) => ({ ...prev, temporary_password: undefined }));
            }
          }}
          placeholder="Tối thiểu 12 ký tự..."
          autoFocus
        />
      </Field>

      <Field label="Lý do đặt lại mật khẩu" required id="reset-reason" error={fieldErrors.reason}>
        <Input
          id="reset-reason"
          value={reason}
          invalid={Boolean(fieldErrors.reason)}
          onChange={(e) => {
            setReason(e.target.value);
            if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
          }}
          placeholder="Nhập lý do thực hiện (tối thiểu 3 ký tự)..."
        />
      </Field>
    </form>
  );
}
