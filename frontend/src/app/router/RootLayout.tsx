import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AppShell } from '@/layouts/AppShell';
import { useAuth } from '@/features/auth';
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
  const route = routeRegistry.find((item) => item.path === location.pathname);
  const navigation = routeRegistry.filter(
    (item) => !auth.principal || !item.permission || auth.can(item.permission),
  );
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
  return (
    <AppShell
      navigation={navigation}
      title={route?.title || 'Không tìm thấy trang'}
      group={route?.group || 'Điều hành'}
      collapsed={collapsed}
      onCollapse={() => dispatch(setSidebarCollapsed(!collapsed))}
      username={auth.principal?.username}
      onLogout={() => void logout()}
      logoutPending={pending}
    >
      {logoutError && (
        <p className="form-error mb-6" role="alert">
          {logoutError}
        </p>
      )}
      <Outlet />
    </AppShell>
  );
}
