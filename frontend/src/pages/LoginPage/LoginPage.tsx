import { paths } from '@/shared/config';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { useAuth } from '@/features/auth';
import { normalizeError } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { safeInternalPath } from '@/shared/lib';
const schema = z.object({
  username: z.string().min(3, 'Tên đăng nhập cần ít nhất 3 ký tự.').max(128),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').max(256),
});
type Values = z.infer<typeof schema>;
export function LoginPage() {
  const { login, principal } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<ApiError | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });
  async function submit(values: Values) {
    setError(null);
    try {
      await login(values);
      await navigate(safeInternalPath(params.get('next')), { replace: true });
    } catch (cause) {
      setError(normalizeError(cause));
    }
  }
  return (
    <AuthLayout>
      <div className="auth-form">
        <Link to={paths.overview} className="button button--ghost button--sm mb-8">
          <ArrowLeftIcon size={15} />
          Về không gian điều hành
        </Link>
        <p className="eyebrow">TRUY CẬP TÀI KHOẢN</p>
        <h2>Đăng nhập hệ thống</h2>
        <p>Sử dụng tài khoản vận hành được quản trị viên cấp.</p>
        {principal ? (
          <div className="form-stack">
            <p>
              Bạn đang đăng nhập với tài khoản <strong>{principal.username}</strong>.
            </p>
            <Link to={paths.overview} className="button button--primary">
              Tiếp tục làm việc
              <ArrowRightIcon size={17} />
            </Link>
          </div>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit(submit)} noValidate>
            {error && (
              <div role="alert" className="form-error">
                {error.message}
                {error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
              </div>
            )}
            <Field id="username" label="Tên đăng nhập" required error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="username"
                placeholder="Nhập tên đăng nhập"
                {...register('username')}
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? 'username-error' : undefined}
                disabled={isSubmitting}
              />
            </Field>
            <Field id="password" label="Mật khẩu" required error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                {...register('password')}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                disabled={isSubmitting}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              pending={isSubmitting}
              icon={<ArrowRightIcon size={18} />}
            >
              Đăng nhập
            </Button>
          </form>
        )}
        <div className="auth-form__footer">
          Không truy cập được tài khoản? Liên hệ quản trị viên để được hỗ trợ.
        </div>
      </div>
    </AuthLayout>
  );
}
