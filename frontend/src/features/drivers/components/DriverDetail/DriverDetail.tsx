import { UserIcon, CameraIcon } from '@phosphor-icons/react';
import type { Driver } from '../../api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { formatDate } from '@/shared/lib';
import { useFeedback, openEvidenceModal } from '@/shared/feedback';

export interface DriverDetailProps {
  driver: Driver;
}

export function DriverDetail({ driver }: DriverDetailProps) {
  const feedback = useFeedback();

  const handleOpenFaceEvidence = () => {
    openEvidenceModal(feedback, {
      id: `evidence-driver-${driver.id}`,
      title: `Khuôn mặt nhận diện: ${driver.full_name}`,
      description: 'Mẫu nhận diện khuôn mặt được mã hóa vector cho cổng AI.',
      source: null, // Chưa có ảnh raw từ v1 API, EvidenceViewer sẽ render fallback an toàn
      alt: `Ảnh nhận diện của ${driver.full_name}`,
      metadata: {
        'Họ và tên': driver.full_name,
        'Mã nhân viên': driver.employee_code || 'Chưa cập nhật',
        'Mô hình AI': driver.face_model,
        'Phiên bản vector': driver.embedding_version,
        'Ngày đăng ký': formatDate(driver.enrolled_at),
      },
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3 p-3 surface border rounded-lg">
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-primary)]">
          <UserIcon size={28} />
        </div>
        <div>
          <h3 className="text-base font-semibold">{driver.full_name}</h3>
          <p className="text-xs text-[var(--color-muted)]">
            Mã nhân viên:{' '}
            <span className="mono font-semibold">{driver.employee_code || 'Chưa có'}</span>
          </p>
        </div>
        <div className="ml-auto">
          <Badge tone={driver.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {driver.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Số điện thoại liên hệ</span>
          <strong className="font-medium text-[var(--color-text)]">
            {driver.phone || 'Chưa cập nhật'}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Thời điểm đăng ký AI</span>
          <strong className="font-medium text-[var(--color-text)]">
            {formatDate(driver.enrolled_at)}
          </strong>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">Mô hình AI nhận diện</span>
          <span className="mono text-xs font-semibold">{driver.face_model}</span>
        </div>
        <div className="p-3 border rounded-lg surface">
          <span className="text-xs text-[var(--color-muted)] block">
            Phiên bản Vector (Embedding)
          </span>
          <span className="mono text-xs font-semibold">{driver.embedding_version}</span>
        </div>
      </div>

      <div className="p-3 border rounded-lg surface">
        <span className="text-xs text-[var(--color-muted)] block">Mã định danh hệ thống</span>
        <span className="font-mono text-xs text-[var(--color-muted)] break-all">{driver.id}</span>
      </div>

      <div className="pt-2 flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          icon={<CameraIcon size={16} />}
          onClick={handleOpenFaceEvidence}
        >
          Xem chi tiết mẫu nhận diện AI
        </Button>
      </div>
    </div>
  );
}
