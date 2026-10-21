import {
  ClockCounterClockwiseIcon,
  HashIcon,
  UserCircleIcon,
  CrosshairIcon,
} from '@phosphor-icons/react';
import type { AuditView } from '../../model/schema';
import { Badge } from '@/shared/ui/Badge';
import { formatDate } from '@/shared/lib';

export interface AuditDetailProps {
  audit: AuditView;
}

const outcomeToneMap: Record<AuditView['outcome'], 'success' | 'warning' | 'danger'> = {
  SUCCEEDED: 'success',
  DENIED: 'warning',
  FAILED: 'danger',
};

const outcomeLabelMap: Record<AuditView['outcome'], string> = {
  SUCCEEDED: 'Thành công',
  DENIED: 'Bị từ chối (403)',
  FAILED: 'Thất bại (500)',
};

export function AuditDetail({ audit }: AuditDetailProps) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <ClockCounterClockwiseIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold mono">{audit.action}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Thời điểm:{' '}
            <span className="font-medium text-[var(--color-text)]">
              {formatDate(audit.occurred_at)}
            </span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={outcomeToneMap[audit.outcome]}>{outcomeLabelMap[audit.outcome]}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">
            Loại đối tượng (Target Type)
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <CrosshairIcon size={16} className="text-[var(--color-primary)]" />
            <strong className="font-semibold text-[var(--color-text)]">{audit.target_type}</strong>
          </div>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Mã đối tượng (Target ID)</span>
          <span className="mono text-xs text-[var(--color-muted)] break-all">
            {audit.target_id}
          </span>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">
            Người thực hiện (Actor ID)
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <UserCircleIcon size={16} className="text-[var(--color-primary)]" />
            <span className="mono text-xs text-[var(--color-muted)] break-all">
              {audit.actor_id || 'Hệ thống tự động (SYSTEM)'}
            </span>
          </div>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Mã truy vết Request ID</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <HashIcon size={16} className="text-[var(--color-primary)]" />
            <span className="mono text-xs text-[var(--color-muted)] break-all">
              {audit.request_id}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3 border rounded-lg surface space-y-2">
        <span className="text-xs font-semibold block text-[var(--color-text)]">
          Chi tiết biến động dữ liệu đã khử nhạy cảm (Redacted Changes):
        </span>
        <pre className="p-3 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border)] font-mono text-xs overflow-auto max-h-[260px] text-[var(--color-text)] leading-relaxed">
          {JSON.stringify(audit.redacted_changes, null, 2)}
        </pre>
      </div>

      <div className="p-2.5 rounded bg-[var(--color-surface-hover)] text-xs text-[var(--color-muted)]">
        Nhật ký kiểm toán được lưu trữ bền vững (Append-only). Không một người dùng hay quản trị
        viên nào có thể sửa đổi hoặc xóa các bản ghi này.
      </div>
    </div>
  );
}
