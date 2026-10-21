import { useState } from 'react';
import {
  PackageIcon,
  FileTextIcon,
  PlayIcon,
  QrCodeIcon,
  ArrowsClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
} from '@phosphor-icons/react';
import type { WarehouseOrder } from '../../api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { formatDate } from '@/shared/lib';
import { useFeedback, openEvidenceModal } from '@/shared/feedback';

export interface OrderDetailProps {
  order: WarehouseOrder;
  driverLabel?: string;
  vehicleLabel?: string;
  canStartDock?: boolean;
  canReadDock?: boolean;
  canIssueSlip?: boolean;
  canReissueSlip?: boolean;
  canReadSlip?: boolean;
  onStartDock?: (order: WarehouseOrder) => Promise<void> | void;
  onInspectDock?: (inspectionId: string) => void;
  onIssueSlip?: (order: WarehouseOrder) => Promise<void> | void;
  onReissueSlip?: (order: WarehouseOrder) => Promise<void> | void;
  onDownloadSlip?: (
    order: WarehouseOrder,
    artifactType: 'qr' | 'html' | 'pdf',
  ) => Promise<void> | void;
}

const statusLabels: Record<WarehouseOrder['status'], string> = {
  PENDING: 'Chờ xử lý',
  LOADING: 'Đang xếp hàng',
  READY_FOR_EXIT: 'Sẵn sàng xuất',
  SLIP_ISSUED: 'Đã cấp phiếu',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

export function OrderDetail({
  order,
  driverLabel,
  vehicleLabel,
  canStartDock = false,
  canReadDock = false,
  canIssueSlip = false,
  canReissueSlip = false,
  canReadSlip = false,
  onStartDock,
  onInspectDock,
  onIssueSlip,
  onReissueSlip,
  onDownloadSlip,
}: OrderDetailProps) {
  const feedback = useFeedback();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleOpenSlipEvidence = () => {
    openEvidenceModal(feedback, {
      id: `evidence-order-${order.id}`,
      title: `Phiếu xuất kho: ${order.order_id}`,
      description: `Bằng chứng phiếu xuất kho phiên bản v${order.slip_version}.`,
      source: null,
      alt: `Phiếu xuất kho đơn hàng ${order.order_id}`,
      metadata: {
        'Mã đơn hàng': order.order_id,
        'Phiên bản phiếu': `v${order.slip_version}`,
        'Hiệu lực từ': formatDate(order.valid_from),
        'Hiệu lực đến': formatDate(order.valid_until),
        'Số chứng từ liên kết': Object.keys(order.slip_refs || {}).length,
      },
    });
  };

  const runAction = async (key: string, fn?: () => Promise<void> | void) => {
    if (!fn || busyAction) return;
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <PackageIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold mono">{order.order_id}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Phiếu kho: <span className="mono">v{order.slip_version}</span>
          </p>
        </div>
        <div className="ml-auto">
          <Badge
            tone={
              order.status === 'CANCELLED'
                ? 'danger'
                : order.status === 'COMPLETED'
                  ? 'success'
                  : 'neutral'
            }
          >
            {statusLabels[order.status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Hiệu lực từ ngày</span>
          <strong className="font-medium text-[var(--color-text)]">
            {formatDate(order.valid_from)}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Hiệu lực đến ngày</span>
          <strong className="font-medium text-[var(--color-text)]">
            {formatDate(order.valid_until)}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Phiên tại Dock kho</span>
          <span className="mono text-xs">{order.dock_session_id || 'Chưa vào phiên'}</span>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Phương tiện & Tài xế</span>
          <span className="text-xs text-[var(--color-muted)]">
            {vehicleLabel ? `Xe: ${vehicleLabel}` : `Xe: ${order.assigned_vehicle_id.slice(0, 8)}…`}
            {driverLabel ? ` · TX: ${driverLabel}` : ''}
          </span>
        </div>
      </div>

      {order.cargo_metadata && order.cargo_metadata.length > 0 && (
        <div className="p-3 border rounded-lg surface space-y-2">
          <span className="text-xs text-[var(--color-muted)] block font-semibold">
            Danh mục hàng hóa trong đơn
          </span>
          <div className="space-y-1.5 text-xs">
            {order.cargo_metadata.map((cargo, idx) => (
              <div
                key={idx}
                className="flex justify-between py-1 border-b last:border-b-0 border-[var(--color-border)]"
              >
                <span className="font-medium">{String(cargo.name || `Hàng hóa #${idx + 1}`)}</span>
                <span className="mono">
                  {String(cargo.quantity || '')} {String(cargo.unit || '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(canStartDock || canReadDock || canIssueSlip || canReissueSlip || canReadSlip) && (
        <div className="p-3 border rounded-lg surface space-y-2">
          <span className="text-xs text-[var(--color-muted)] block font-semibold">
            Nghiệp vụ Dock & Phiếu xuất kho
          </span>
          <div className="flex flex-wrap gap-2">
            {canStartDock &&
              !order.dock_session_id &&
              order.status === 'PENDING' &&
              onStartDock && (
                <Button
                  size="sm"
                  variant="primary"
                  pending={busyAction === 'start-dock'}
                  icon={<PlayIcon size={15} />}
                  onClick={() => void runAction('start-dock', () => onStartDock(order))}
                >
                  Bắt đầu phiên Dock
                </Button>
              )}

            {canReadDock && order.dock_session_id && onInspectDock && (
              <Button
                size="sm"
                variant="secondary"
                icon={<EyeIcon size={15} />}
                onClick={() => onInspectDock(order.dock_session_id!)}
              >
                Kiểm tra / Chốt phiên Dock
              </Button>
            )}

            {canIssueSlip &&
              (order.status === 'READY_FOR_EXIT' || order.status === 'LOADING') &&
              onIssueSlip && (
                <Button
                  size="sm"
                  variant="primary"
                  pending={busyAction === 'issue-slip'}
                  icon={<QrCodeIcon size={15} />}
                  onClick={() => void runAction('issue-slip', () => onIssueSlip(order))}
                >
                  Cấp phiếu xuất kho
                </Button>
              )}

            {canReissueSlip &&
              (order.status === 'SLIP_ISSUED' || order.slip_version > 0) &&
              onReissueSlip && (
                <Button
                  size="sm"
                  variant="secondary"
                  pending={busyAction === 'reissue-slip'}
                  icon={<ArrowsClockwiseIcon size={15} />}
                  onClick={() => void runAction('reissue-slip', () => onReissueSlip(order))}
                >
                  Cấp lại phiếu xuất kho
                </Button>
              )}

            {canReadSlip && order.slip_version > 0 && onDownloadSlip && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={busyAction === 'dl-qr'}
                  icon={<DownloadSimpleIcon size={15} />}
                  onClick={() => void runAction('dl-qr', () => onDownloadSlip(order, 'qr'))}
                >
                  Tải mã QR
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={busyAction === 'dl-pdf'}
                  icon={<DownloadSimpleIcon size={15} />}
                  onClick={() => void runAction('dl-pdf', () => onDownloadSlip(order, 'pdf'))}
                >
                  Tải PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={busyAction === 'dl-html'}
                  icon={<DownloadSimpleIcon size={15} />}
                  onClick={() => void runAction('dl-html', () => onDownloadSlip(order, 'html'))}
                >
                  Tải HTML
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          icon={<FileTextIcon size={16} />}
          onClick={handleOpenSlipEvidence}
        >
          Xem chứng từ / phiếu xuất kho
        </Button>
      </div>
    </div>
  );
}
