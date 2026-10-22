import { useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { AdminUser, UserRoleChangeInput } from '../../model/schema';
import { userRoleChangeSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';

export interface UserRoleModalProps {
  user: AdminUser;
  roles: Array<{ id: string; name: string; code: string }>;
  formId: string;
  onSubmit: (data: UserRoleChangeInput) => Promise<void>;
}

export function UserRoleModal({ user, roles, formId, onSubmit }: UserRoleModalProps) {
  const feedback = useFeedback();
  const [roleId, setRoleId] = useState(user.role_id);
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setReasonError(undefined);

    const parsed = userRoleChangeSchema.safeParse({
      expected_version: user.version,
      reason,
      role_id: roleId,
    });

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Vui lòng điền đầy đủ thông tin hợp lệ.';
      setErrorMsg(msg);
      setReasonError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin thay đổi vai trò tài khoản',
        fields: ['Lý do thay đổi vai trò'],
      });
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-sm" noValidate>
      <div className="p-3 rounded-lg border surface">
        <p className="font-medium text-[var(--color-text)]">
          Gán vai trò mới cho: <span className="mono font-semibold">{user.username}</span>
        </p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Vai trò hiện tại: <span className="mono font-semibold">{user.role_code}</span> (v
          {user.version}).
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

      <Field label="Chọn vai trò mới" required id="new-role">
        <select
          id="new-role"
          className="w-full p-2 border rounded-lg surface text-sm"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Lý do thay đổi vai trò" required id="role-reason" error={reasonError}>
        <Input
          id="role-reason"
          value={reason}
          invalid={Boolean(reasonError)}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(undefined);
          }}
          placeholder="Nhập lý do phân quyền (tối thiểu 3 ký tự)..."
          autoFocus
        />
      </Field>
    </form>
  );
}
