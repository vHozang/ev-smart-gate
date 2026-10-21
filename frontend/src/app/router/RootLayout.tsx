import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AppShell } from '@/layouts/AppShell';
import { ChangePasswordModal, changePasswordSession, useAuth } from '@/features/auth';
import type { ChangePasswordInput } from '@/features/auth';
import { useFeedback } from '@/shared/feedback';
import { normalizeError } from '@/shared/api';
import { setSidebarCollapsed, useAppDispatch, useAppSelector } from '@/app/store';
import { routeRegistry } from './registry';

export function RootLayout() {
  const location = useLocation();
  const auth = useAuth();
  const feedback = useFeedback();
  const collapsed = useAppSelector((state) => state.preferences.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const route = routeRegistry.find((item) => item.path === location.pathname);
  const navigation = routeRegistry.filter(
    (item) => !auth.principal || !item.permission || auth.can(item.permission),
  );
  const mustChangePassword = Boolean(auth.principal?.must_change_password);

  async function logout() {
    if (pending) return;
    setPending(true);
    setLogoutError('');
    try {
      await auth.logout();
      feedback.notify({ id: 'logout', title: 'Đã đăng xuất', tone: 'info' });
    } catch (error) {
      setLogoutError(
        `Đã đóng phiên trên trình duyệt. Chưa xác nhận thu hồi phiên tại dịch vụ: ${normalizeError(error).message}`,
      );
    } finally {
      setPending(false);
    }
  }

  async function handleSubmitPassword(input: ChangePasswordInput) {
    if (auth.changePassword) {
      await auth.changePassword(input);
    } else {
      await changePasswordSession(input);
    }
    feedback.notify({
      id: 'change-password-success',
      title: 'Đã cập nhật mật khẩu thành công',
      tone: 'success',
    });
  }

  return (
    <AppShell
      navigation={navigation}
      title={route?.title || 'Không tìm thấy trang'}
      group={route?.group || 'Điều hành'}
      collapsed={collapsed}
      onCollapse={() => dispatch(setSidebarCollapsed(!collapsed))}
      username={auth.principal?.username}
      userRole={auth.principal?.role}
      onChangePassword={auth.principal ? () => setChangePasswordOpen(true) : undefined}
      onLogout={() => void logout()}
      logoutPending={pending}
    >
      {logoutError && (
        <p className="form-error mb-6" role="alert">
          {logoutError}
        </p>
      )}
      <ChangePasswordModal
        open={mustChangePassword || changePasswordOpen}
        forced={mustChangePassword}
        username={auth.principal?.username}
        onClose={() => setChangePasswordOpen(false)}
        onSubmitPassword={handleSubmitPassword}
        onLogout={logout}
      />
      <Outlet />
    </AppShell>
  );
}
