import { useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { RoleCreateInput, RolePatchInput, RoleView } from '../../model/schema';
import { roleCreateSchema, rolePatchSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';

export interface RoleFormProps {
  formId: string;
  role?: RoleView;
  onSubmit: (data: RoleCreateInput) => Promise<void>;
  onSubmitPatch?: (data: RolePatchInput) => Promise<void>;
}

export function RoleForm({ formId, role, onSubmit, onSubmitPatch }: RoleFormProps) {
  const feedback = useFeedback();
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [isActive, setIsActive] = useState<boolean>(role?.is_active ?? true);
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    reason?: string;
  }>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    if (role) {
      const parsed = rolePatchSchema.safeParse({
        expected_version: role.version,
        reason,
        name,
        description: description.trim() || null,
        is_active: isActive,
      });
      if (!parsed.success) {
        const nextErrors: typeof fieldErrors = {};
        const missing: string[] = [];
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (key === 'name' && !nextErrors.name) {
            nextErrors.name = issue.message;
            missing.push('Tên vai trò hiển thị');
          } else if (key === 'reason' && !nextErrors.reason) {
            nextErrors.reason = issue.message;
            missing.push('Lý do cập nhật vai trò');
          }
        }
        setFieldErrors(nextErrors);
        setErrorMsg(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
        openValidationNoticeModal(feedback, {
          title: 'Chưa đủ thông tin cập nhật vai trò',
          fields: missing,
        });
        return;
      }
      await onSubmitPatch?.(parsed.data);
      return;
    }

    const parsed = roleCreateSchema.safeParse({
      code: code.trim().toUpperCase(),
      name,
      description: description || undefined,
    });

    if (!parsed.success) {
      const nextErrors: typeof fieldErrors = {};
      const missing: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'code' && !nextErrors.code) {
          nextErrors.code = issue.message;
          missing.push('Mã vai trò (Code)');
        } else if (key === 'name' && !nextErrors.name) {
          nextErrors.name = issue.message;
          missing.push('Tên vai trò hiển thị');
        }
      }
      setFieldErrors(nextErrors);
      setErrorMsg(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin tạo vai trò mới',
        fields: missing,
      });
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4 text-sm" noValidate>
      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-xs"
        >
          {errorMsg}
        </div>
      )}

      <Field label="Mã vai trò (Code)" required id="role-code" error={fieldErrors.code}>
        <Input
          id="role-code"
          value={code}
          disabled={Boolean(role)}
          invalid={Boolean(fieldErrors.code)}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (fieldErrors.code) setFieldErrors((prev) => ({ ...prev, code: undefined }));
          }}
          placeholder="vd: DISPATCHER, SUPERVISOR"
          autoFocus={!role}
        />
        <span className="text-xs text-[var(--color-muted)] block mt-1">
          Chữ hoa, từ 3-64 ký tự, bất biến sau khi khởi tạo.
        </span>
      </Field>

      <Field label="Tên vai trò hiển thị" required id="role-name" error={fieldErrors.name}>
        <Input
          id="role-name"
          value={name}
          invalid={Boolean(fieldErrors.name)}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="vd: Điều phối viên phân luồng"
        />
      </Field>

      <Field label="Mô tả phạm vi vai trò" id="role-desc">
        <textarea
          id="role-desc"
          rows={3}
          className="w-full p-2 border rounded-lg surface text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả quyền hạn hoặc trách nhiệm liên quan..."
        />
      </Field>

      {role && (
        <>
          <Field label="Trạng thái vai trò" required id="role-status">
            <Select
              id="role-status"
              value={isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(e) => setIsActive(e.target.value === 'ACTIVE')}
              disabled={role.is_system}
            >
              <option value="ACTIVE">Đang kích hoạt (Active)</option>
              <option value="INACTIVE">Tạm ngừng (Inactive)</option>
            </Select>
          </Field>

          <Field
            label="Lý do cập nhật vai trò"
            required
            id="role-reason"
            error={fieldErrors.reason}
          >
            <Input
              id="role-reason"
              value={reason}
              invalid={Boolean(fieldErrors.reason)}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="Nhập lý do cập nhật vai trò (tối thiểu 3 ký tự)..."
            />
          </Field>
        </>
      )}
    </form>
  );
}
