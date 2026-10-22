import { useState } from 'react';
import { UserIcon, ShieldIcon, DeviceTabletIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { AdminUser, SessionView } from '../../model/schema';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { formatDate } from '@/shared/lib';
import { listUserSessions, revokeAllUserSessions } from '../../api/users';
import { useFeedback } from '@/shared/feedback';

export interface UserDetailProps {
  user: AdminUser;
  onRefresh?: () => void;
}

export function UserDetail({ user, onRefresh }: UserDetailProps) {
  const feedback = useFeedback();
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleFetchSessions = async () => {
    setLoadingSessions(true);
    setSessionError(null);
    try {
      const data = await listUserSessions(user.id);
      setSessions(data);
    } catch (err) {
      setSessionError(normalizeError(err).message);
      setSessions(null);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSessions = async () => {
    setRevoking(true);
    try {
      await revokeAllUserSessions(user.id, {
        expected_version: user.version,
        reason: 'Quản trị viên thu hồi phiên thủ công',
      });
      feedback.notify({
        id: `revoke-success-${user.id}`,
        title: 'Thu hồi thành công',
        description: `Đã thu hồi toàn bộ phiên đăng nhập của người dùng ${user.username}.`,
        tone: 'success',
      });
      setSessions([]);
      onRefresh?.();
    } catch (err) {
      feedback.notify({
        id: `revoke-error-${user.id}`,
        title: 'Lỗi thu hồi',
        description: normalizeError(err).message || 'Không thể thu hồi phiên lúc này.',
        tone: 'error',
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <UserIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold mono">{user.username}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Họ tên:{' '}
            <span className="font-medium text-[var(--color-text)]">
              {user.display_name || 'Chưa cập nhật'}
            </span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={user.is_active ? 'success' : 'neutral'}>
            {user.is_active ? 'Hoạt động' : 'Đã vô hiệu'}
          </Badge>
          {user.must_change_password && <Badge tone="warning">Đổi MK lần đầu</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Vai trò hệ thống</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ShieldIcon size={16} className="text-[var(--color-primary)]" />
            <strong className="font-semibold text-[var(--color-text)] mono">
              {user.role_code}
            </strong>
          </div>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Phiên bản bản ghi</span>
          <strong className="font-mono text-xs font-semibold text-[var(--color-text)]">
            v{user.version}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Ngày khởi tạo</span>
          <strong className="font-medium text-xs text-[var(--color-text)]">
            {formatDate(user.created_at)}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Mã định danh User ID</span>
          <span className="mono text-xs text-[var(--color-muted)] break-all">{user.id}</span>
        </div>
      </div>

      <div className="p-3 border rounded-lg surface space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DeviceTabletIcon size={18} className="text-[var(--color-primary)]" />
            <span className="text-xs font-semibold text-[var(--color-text)]">
              Phiên truy cập đang mở
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              pending={loadingSessions}
              onClick={handleFetchSessions}
            >
              {sessions === null ? 'Tải danh sách phiên' : 'Làm mới phiên'}
            </Button>
            {sessions && sessions.length > 0 && (
              <Button size="sm" variant="danger" pending={revoking} onClick={handleRevokeSessions}>
                Thu hồi tất cả
              </Button>
            )}
          </div>
        </div>

        {sessionError ? (
          <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-danger-subtle)] text-xs text-[var(--color-danger)]">
            <WarningCircleIcon size={16} />
            <span>{sessionError}</span>
          </div>
        ) : sessions === null ? (
          <p className="text-xs text-[var(--color-muted)]">
            Bấm nút trên để kiểm tra các phiên đăng nhập đang hoạt động.
          </p>
        ) : sessions.length === 0 ? (
          <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-hover)] text-xs text-[var(--color-muted)]">
            <WarningCircleIcon size={16} />
            <span>Không có phiên đăng nhập nào đang hoạt động.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-2 border rounded text-xs flex justify-between items-center"
              >
                <div>
                  <span className="mono font-semibold block">{s.id.slice(0, 8)}…</span>
                  <span className="text-[var(--color-muted)]">
                    Thấy lần cuối: {formatDate(s.last_seen_at)}
                  </span>
                </div>
                <Badge tone={s.revoked_at ? 'neutral' : 'success'}>
                  {s.revoked_at ? 'Đã thu hồi' : 'Đang mở'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
