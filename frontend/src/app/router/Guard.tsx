import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { loginPath } from '@/shared/config';
import { Skeleton } from '@/shared/ui/Skeleton';
import { StatePanel } from '@/shared/ui/StatePanel';
export function Guard({ children, permission }: { children: ReactNode; permission?: string }) {
  const { principal, loading, can, error } = useAuth();
  const location = useLocation();
  if (loading) return <Skeleton label="Đang kiểm tra phiên truy cập" />;
  if (error)
    return (
      <StatePanel kind="error" title="Chưa xác nhận được phiên truy cập">
        Không thể kết nối dịch vụ xác thực. Hãy kiểm tra kết nối và tải lại trang.
      </StatePanel>
    );
  if (!principal) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  if (permission && !can(permission))
    return (
      <StatePanel kind="forbidden" title="Bạn chưa được cấp quyền truy cập">
        Liên hệ quản trị viên để kiểm tra quyền cho chức năng này.
      </StatePanel>
    );
  return children;
}
