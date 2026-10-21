import { ShieldCheckIcon, UsersIcon, LockKeyIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { RoleView } from '../../model/schema';
import { Badge } from '@/shared/ui/Badge';

export interface RoleDetailProps {
  role: RoleView;
}

export function RoleDetail({ role }: RoleDetailProps) {
  // Gom nhóm danh sách permissions để hiển thị rõ ràng
  const groupedPermissions = role.permission_codes.reduce<Record<string, string[]>>((acc, code) => {
    const [group] = code.split(':');
    const groupName = group || 'other';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(code);
    return acc;
  }, {});

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <ShieldCheckIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold mono">{role.name}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Mã định danh: <span className="mono font-semibold">{role.code}</span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={role.is_system ? 'neutral' : 'warning'}>
            {role.is_system ? 'Hệ thống (Bất biến)' : 'Tùy biến'}
          </Badge>
          <Badge tone={role.is_active ? 'success' : 'neutral'}>
            {role.is_active ? 'Đang kích hoạt' : 'Tạm ngừng'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Số tài khoản đang gán</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <UsersIcon size={16} className="text-[var(--color-primary)]" />
            <strong className="font-semibold text-[var(--color-text)]">
              {role.assigned_user_count} người dùng
            </strong>
          </div>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Phiên bản vai trò</span>
          <strong className="font-mono text-xs font-semibold text-[var(--color-text)]">
            v{role.version}
          </strong>
        </div>
      </div>

      {role.description && (
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block font-semibold mb-1">
            Mô tả chức năng
          </span>
          <p className="text-xs text-[var(--color-text)]">{role.description}</p>
        </div>
      )}

      {role.is_system && (
        <div className="flex items-start gap-2 p-2.5 rounded bg-[var(--color-surface-hover)] text-xs text-[var(--color-muted)]">
          <LockKeyIcon size={16} className="shrink-0 mt-0.5" />
          <span>
            Đây là vai trò hệ thống cốt lõi. Không được phép đổi mã vai trò (Code) hoặc vô hiệu hóa
            vai trò khi còn tài khoản vận hành.
          </span>
        </div>
      )}

      <div className="p-3 border rounded-lg surface space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text)]">
            Tập quyền được cấp ({role.permission_codes.length} quyền)
          </span>
        </div>

        {role.permission_codes.length === 0 ? (
          <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-surface-hover)] text-xs text-[var(--color-muted)]">
            <WarningCircleIcon size={16} />
            <span>Chưa có quyền nào được gán cho vai trò này.</span>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-auto pr-1">
            {Object.entries(groupedPermissions).map(([group, codes]) => (
              <div key={group} className="border-b last:border-b-0 pb-2">
                <span className="text-xs font-semibold uppercase text-[var(--color-muted)] block mb-1">
                  Nhóm: {group} ({codes.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {codes.map((code) => (
                    <span
                      key={code}
                      className="px-2 py-0.5 text-xs font-mono rounded bg-[var(--color-surface-hover)] text-[var(--color-text)] border border-[var(--color-border)]"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
