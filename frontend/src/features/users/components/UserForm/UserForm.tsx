import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { AdminUser, UserCreateInput, UserProfilePatchInput } from '../../model/schema';
import { userCreateSchema, userProfilePatchSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';

export interface UserFormProps {
  user?: AdminUser;
  roles?: Array<{ id: string; name: string; code: string }>;
  formId: string;
  onSubmit: (data: UserCreateInput | UserProfilePatchInput) => Promise<void>;
}

export function UserForm({ user, roles = [], formId, onSubmit }: UserFormProps) {
  const feedback = useFeedback();
  const isEditing = !!user;

  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(user?.role_id || roles[0]?.id || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
    role_id?: string;
  }>({});

  useEffect(() => {
    if (!isEditing && !roleId && roles[0]?.id) {
      setRoleId(roles[0].id);
    }
  }, [isEditing, roleId, roles]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    if (isEditing) {
      const parsed = userProfilePatchSchema.safeParse({
        expected_version: user.version,
        username: username !== user.username ? username : undefined,
        display_name: displayName || null,
      });

      if (!parsed.success) {
        const nextErrors: typeof fieldErrors = {};
        const missing: string[] = [];
        for (const issue of parsed.error.issues) {
          if (issue.path[0] === 'username' && !nextErrors.username) {
            nextErrors.username = issue.message;
            missing.push('Tên đăng nhập');
          }
        }
        setFieldErrors(nextErrors);
        setErrorMsg(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
        openValidationNoticeModal(feedback, {
          title: 'Chưa đủ thông tin cập nhật tài khoản',
          fields: missing.length ? missing : ['Tên đăng nhập'],
        });
        return;
      }
      await onSubmit(parsed.data);
    } else {
      const parsed = userCreateSchema.safeParse({
        username,
        password,
        role_id: roleId,
        display_name: displayName || undefined,
      });

      if (!parsed.success) {
        const nextErrors: typeof fieldErrors = {};
        const missing: string[] = [];
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (key === 'username' && !nextErrors.username) {
            nextErrors.username = issue.message;
            missing.push('Tên đăng nhập');
          } else if (key === 'password' && !nextErrors.password) {
            nextErrors.password = issue.message;
            missing.push('Mật khẩu khởi tạo');
          } else if (key === 'role_id' && !nextErrors.role_id) {
            nextErrors.role_id = issue.message;
            missing.push('Vai trò gán ban đầu');
          }
        }
        setFieldErrors(nextErrors);
        setErrorMsg(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
        openValidationNoticeModal(feedback, {
          title: 'Chưa đủ thông tin tạo tài khoản người dùng',
          fields: missing,
        });
        return;
      }
      await onSubmit(parsed.data);
    }
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

      <Field label="Tên đăng nhập" required id="user-username" error={fieldErrors.username}>
        <Input
          id="user-username"
          value={username}
          invalid={Boolean(fieldErrors.username)}
          onChange={(e) => {
            setUsername(e.target.value);
            if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: undefined }));
          }}
          placeholder="vd: operator.gate1"
          autoComplete="off"
        />
        <span className="text-xs text-[var(--color-muted)] block mt-1">
          Chỉ gồm chữ cái, số, dấu gạch nối hoặc gạch dưới (3 - 64 ký tự).
        </span>
      </Field>

      <Field label="Tên hiển thị" id="user-display-name">
        <Input
          id="user-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="vd: Nguyễn Văn Quản Trị"
        />
      </Field>

      {!isEditing && (
        <>
          <Field label="Mật khẩu khởi tạo" required id="user-password" error={fieldErrors.password}>
            <Input
              id="user-password"
              type="password"
              value={password}
              invalid={Boolean(fieldErrors.password)}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              placeholder="Tối thiểu 12 ký tự"
            />
          </Field>

          <Field label="Vai trò gán ban đầu" required id="user-role" error={fieldErrors.role_id}>
            <select
              id="user-role"
              className="w-full p-2 border rounded-lg surface text-sm"
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                if (fieldErrors.role_id) setFieldErrors((prev) => ({ ...prev, role_id: undefined }));
              }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
              {roles.length === 0 && (
                <option value="00000000-0000-0000-0000-000000000000">
                  Vai trò mặc định (OPERATOR)
                </option>
              )}
            </select>
          </Field>
        </>
      )}

      {isEditing && (
        <div className="p-2.5 rounded bg-[var(--color-surface-hover)] text-xs text-[var(--color-muted)]">
          Lưu ý: Để thay đổi Vai trò, Trạng thái hoặc Mật khẩu của tài khoản, vui lòng dùng các chức
          năng riêng biệt được kiểm toán theo quy định bảo mật.
        </div>
      )}
    </form>
  );
}
