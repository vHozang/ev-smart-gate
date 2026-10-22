import { CarIcon, CameraIcon } from '@phosphor-icons/react';
import type { Vehicle } from '../../model/schema';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { useFeedback, openEvidenceModal } from '@/shared/feedback';

export interface VehicleDetailProps {
  vehicle: Vehicle;
}

export function VehicleDetail({ vehicle }: VehicleDetailProps) {
  const feedback = useFeedback();

  // Trích xuất ảnh bằng chứng hoặc ảnh biển số từ metadata nếu có
  const snapshotUrl =
    typeof vehicle.metadata?.snapshot_url === 'string' ? vehicle.metadata.snapshot_url : null;

  const handleOpenEvidence = () => {
    openEvidenceModal(feedback, {
      id: `evidence-vehicle-${vehicle.id}`,
      title: `Ảnh phương tiện ${vehicle.plate_number}`,
      description: 'Hình ảnh ghi nhận từ camera hoặc hồ sơ đăng ký.',
      source: snapshotUrl || '/placeholder-vehicle.png',
      alt: `Ảnh phương tiện biển số ${vehicle.plate_number}`,
      metadata: {
        'Biển số': vehicle.plate_number,
        'Loại xe': vehicle.vehicle_type,
        'Trạng thái': vehicle.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng hoạt động',
      },
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <CarIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold mono">{vehicle.plate_number}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Chuẩn hóa: <span className="mono">{vehicle.plate_normalized}</span>
          </p>
        </div>
        <div className="ml-auto">
          <Badge tone={vehicle.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {vehicle.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Loại phương tiện</span>
          <strong className="font-medium text-[var(--color-text)]">{vehicle.vehicle_type}</strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Hãng & Dòng xe</span>
          <strong className="font-medium text-[var(--color-text)]">
            {[vehicle.make, vehicle.model].filter(Boolean).join(' · ') || 'Chưa cập nhật'}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Màu sắc</span>
          <strong className="font-medium text-[var(--color-text)]">
            {vehicle.color || 'Chưa cập nhật'}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Mã định danh (ID)</span>
          <span className="font-mono text-xs text-[var(--color-muted)] break-all">
            {vehicle.id}
          </span>
        </div>
      </div>

      {Object.keys(vehicle.metadata || {}).length > 0 && (
        <div className="p-3 border rounded-lg surface space-y-2">
          <span className="text-xs text-[var(--color-muted)] block font-semibold">
            Thông số kỹ thuật & Thẻ
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {Object.entries(vehicle.metadata).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between py-1 border-b last:border-b-0 border-[var(--color-border)]"
              >
                <span className="text-[var(--color-muted)]">{key}:</span>
                <span className="font-mono">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          icon={<CameraIcon size={16} />}
          onClick={handleOpenEvidence}
        >
          Xem hình ảnh / bằng chứng
        </Button>
      </div>
    </div>
  );
}
