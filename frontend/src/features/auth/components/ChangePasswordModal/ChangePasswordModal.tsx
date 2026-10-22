import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyIcon, SignOutIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { changePasswordRequestSchema } from '../../api/session';
import type { ChangePasswordInput } from '../../model/types';

export interface ChangePasswordModalProps {
  open: boolean;
  forced?: boolean;
  username?: string;
  onClose?: () => void;
  onSubmitPassword: (input: ChangePasswordInput) => Promise<void>;
  onLogout?: () => Promise<void> | void;
}

export function ChangePasswordModal({
  open,
  forced = false,
  username,
  onClose,
  onSubmitPassword,
  onLogout,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    const parsed = changePasswordRequestSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
    });

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message || 'Thông tin đổi mật khẩu chưa hợp lệ.');
      return;
    }

    setPending(true);
    try {
      await onSubmitPassword(parsed.data);
      resetForm();
      onClose?.();
    } catch (error) {
      setErrorMessage(normalizeError(error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !forced && !pending) {
          resetForm();
          onClose?.();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal modal--sm"
          data-testid="change-password-modal"
          onEscapeKeyDown={(e) => {
            if (forced || pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (forced || pending) e.preventDefault();
          }}
        >
          <header className="modal__header">
            <div>
              <Dialog.Title className="flex items-center gap-2">
                {forced ? (
                  <ShieldWarningIcon size={20} className="text-[var(--color-warning)]" />
                ) : (
                  <KeyIcon size={20} />
                )}
                {forced ? 'Yêu cầu đổi mật khẩu bắt buộc' : 'Đổi mật khẩu tài khoản'}
              </Dialog.Title>
              <Dialog.Description>
                {forced
                  ? `Tài khoản ${username || 'vận hành'} đang sử dụng mật khẩu tạm thời (must_change_password). Vui lòng thiết lập mật khẩu mới tối thiểu 12 ký tự trước khi thao tác nghiệp vụ.`
                  : 'Cập nhật mật khẩu định kỳ để bảo vệ phiên vận hành cổng kiểm soát.'}
              </Dialog.Description>
            </div>
          </header>

          <div className="modal__body">
            <form
              id="change-password-form"
              onSubmit={(e) => void handleSubmit(e)}
              className="form-stack"
              noValidate
            >
              {errorMessage && (
                <div role="alert" className="form-error" data-testid="change-password-error">
                  {errorMessage}
                </div>
              )}

              <Field id="current-password" label="Mật khẩu hiện tại" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại hoặc mật khẩu tạm thời..."
                  disabled={pending}
                />
              </Field>

              <Field
                id="new-password"
                label="Mật khẩu mới (tối thiểu 12 ký tự)"
                required
                hint="Mật khẩu mới không được trùng với mật khẩu hiện tại."
              >
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới tối thiểu 12 ký tự..."
                  disabled={pending}
                />
              </Field>

              <Field id="confirm-password" label="Xác nhận mật khẩu mới" required>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  disabled={pending}
                />
              </Field>
            </form>
          </div>

          <footer className="modal__footer">
            {forced && onLogout ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                icon={<SignOutIcon size={16} />}
                onClick={() => void onLogout()}
              >
                Đăng xuất phiên hiện tại
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  resetForm();
                  onClose?.();
                }}
              >
                Hủy
              </Button>
            )}

            <Button
              type="submit"
              form="change-password-form"
              variant="primary"
              size="sm"
              pending={pending}
              icon={<KeyIcon size={16} />}
            >
              Cập nhật mật khẩu
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
