import { useEffect, useState } from 'react';
import { normalizeError } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';
import { fetchGateSnapshotBlob } from '../../api';
import type { GateLog } from '../../api';

export interface GateLogDetailProps {
  log: GateLog;
  canViewEvidence: boolean;
}

function formatRatio(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Chưa có dữ liệu';
  }
  return `${(value * 100).toFixed(1)}%`;
}

const verificationBadgeTone: Record<GateLog['verification_status'], 'success' | 'danger'> = {
  PASSED: 'success',
  FAILED: 'danger',
};

const verificationStatusLabel: Record<GateLog['verification_status'], string> = {
  PASSED: 'ĐẠT (PASSED)',
  FAILED: 'TỪ CHỐI (FAILED)',
};

const barrierBadgeTone: Record<
  GateLog['barrier_status'],
  'success' | 'danger' | 'warning' | 'neutral'
> = {
  OPENED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  NOT_REQUESTED: 'neutral',
};

const barrierStatusLabel: Record<GateLog['barrier_status'], string> = {
  OPENED: 'Đã mở (OPENED)',
  PENDING: 'Đang chờ ACK (PENDING)',
  FAILED: 'Lỗi chấp hành (FAILED)',
  NOT_REQUESTED: 'Không phát lệnh mở (NOT_REQUESTED)',
};

export function GateLogDetail({ log, canViewEvidence }: GateLogDetailProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState(0);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!canViewEvidence || log.snapshot_count <= 0) {
      setSnapshotBlob(null);
      setSnapshotError(null);
      return;
    }

    const controller = new AbortController();
    setLoadingSnapshot(true);
    setSnapshotError(null);
    setSnapshotBlob(null);

    fetchGateSnapshotBlob(log.id, selectedSnapshot, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          setSnapshotBlob(blob);
          setLoadingSnapshot(false);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setSnapshotError(normalizeError(cause));
          setLoadingSnapshot(false);
        }
      });

    return () => {
      controller.abort();
      setSnapshotBlob(null);
    };
  }, [canViewEvidence, log.id, log.snapshot_count, selectedSnapshot]);

  const modelSummary = Object.entries(log.model_versions || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {/* 1. Quan sát nhận diện AI (AI Observation) */}
      <section
        data-testid="gate-log-observation"
        aria-label="Quan sát nhận diện AI"
        style={{
          padding: 'var(--space-3)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            1. Quan sát nhận diện AI (AI Observation)
          </h4>
          <span
            className="mono"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
          >
            Ngưỡng: {log.threshold_version || '—'}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Dữ liệu trích xuất từ mô hình thị giác máy tính; chỉ mang tính quan sát, không trực tiếp
          mở barrier.
        </p>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 'var(--space-2)',
            margin: 0,
          }}
        >
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Biển số quan sát
            </dt>
            <dd className="mono" style={{ margin: '2px 0 0', fontWeight: 600 }}>
              {log.observed_plate || 'Chưa nhận diện'}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Độ khớp biển số ({log.plate_match_type})
            </dt>
            <dd className="mono" style={{ margin: '2px 0 0' }}>
              {formatRatio(log.plate_score)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Độ tương đồng khuôn mặt 1:1
            </dt>
            <dd className="mono" style={{ margin: '2px 0 0' }}>
              {formatRatio(log.face_similarity)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Điểm tổng hợp xác minh
            </dt>
            <dd className="mono" style={{ margin: '2px 0 0' }}>
              {formatRatio(log.verification_score)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Phiên bản mô hình
            </dt>
            <dd className="mono" style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)' }}>
              {modelSummary || 'Chưa ghi nhận'}
            </dd>
          </div>
        </dl>
      </section>

      {/* 2. Quyết định xác minh truy cập (Verification Decision) */}
      <section
        data-testid="gate-log-decision"
        aria-label="Quyết định xác minh truy cập"
        style={{
          padding: 'var(--space-3)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            2. Quyết định xác minh nghiệp vụ (Verification Decision)
          </h4>
          <Badge tone={verificationBadgeTone[log.verification_status]}>
            {verificationStatusLabel[log.verification_status]}
          </Badge>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <Badge tone={log.card_verified ? 'success' : 'danger'}>
            Thẻ RFID: {log.card_verified ? 'Hợp lệ' : 'Không đạt'}
          </Badge>
          <Badge tone={log.face_verified ? 'success' : 'danger'}>
            Khuôn mặt 1:1: {log.face_verified ? 'Khớp chủ thẻ' : 'Không khớp'}
          </Badge>
          <Badge tone={log.plate_verified ? 'success' : 'danger'}>
            Biển số: {log.plate_verified ? 'Khớp hồ sơ' : 'Không khớp'}
          </Badge>
          <Badge tone={log.authorization_verified ? 'success' : 'danger'}>
            Ủy quyền Tài xế – Xe: {log.authorization_verified ? 'Có hiệu lực' : 'Chưa ủy quyền'}
          </Badge>
        </div>
        {log.reason_codes.length > 0 && (
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Mã lý do quyết định:{' '}
            </span>
            <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
              {log.reason_codes.join(', ')}
            </span>
          </div>
        )}
      </section>

      {/* 3. Kết quả chấp hành thiết bị (Barrier Actuator Result) */}
      <section
        data-testid="gate-log-barrier"
        aria-label="Kết quả chấp hành thiết bị Barrier"
        style={{
          padding: 'var(--space-3)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            3. Kết quả chấp hành thiết bị (Barrier Result)
          </h4>
          <Badge tone={barrierBadgeTone[log.barrier_status]}>
            {barrierStatusLabel[log.barrier_status]}
          </Badge>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Trạng thái phản hồi từ bộ điều khiển barrier vật lý; chỉ báo lệnh/ACK thiết bị, không đồng
          nghĩa phương tiện thực tế đã đi qua cổng nếu chưa có cảm biến vòng từ xác nhận.
        </p>
      </section>

      {/* 4. Bằng chứng hình ảnh (Snapshot Evidence Blob) */}
      <section
        data-testid="gate-log-evidence"
        aria-label="Bằng chứng ảnh chụp tại cổng"
        style={{ display: 'grid', gap: 'var(--space-2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            4. Bằng chứng ảnh chụp ({log.snapshot_count} tệp)
          </h4>
          {canViewEvidence && log.snapshot_count > 1 && (
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {Array.from({ length: log.snapshot_count }, (_, idx) => (
                <Button
                  key={idx}
                  size="sm"
                  variant={selectedSnapshot === idx ? 'primary' : 'secondary'}
                  onClick={() => setSelectedSnapshot(idx)}
                >
                  Ảnh #{idx + 1}
                </Button>
              ))}
            </div>
          )}
        </div>

        {!canViewEvidence ? (
          <div className="inline-note">
            Tài khoản hiện tại không có quyền <code>gate-evidence:read</code> để tải ảnh bằng chứng.
          </div>
        ) : log.snapshot_count <= 0 ? (
          <div className="inline-note">Lượt kiểm tra này không đính kèm tệp ảnh chụp.</div>
        ) : snapshotError ? (
          <div role="alert" className="form-error">
            Không tải được ảnh chụp #{selectedSnapshot + 1}: {snapshotError.message}
          </div>
        ) : loadingSnapshot ? (
          <div className="inline-note">Đang tải ảnh bằng chứng #{selectedSnapshot + 1}…</div>
        ) : (
          <EvidenceViewer
            source={snapshotBlob}
            alt={`Ảnh chụp cổng ${log.event_id} #${selectedSnapshot + 1}`}
            title={`Ảnh bằng chứng #${selectedSnapshot + 1} (${log.direction})`}
            metadata={{
              'Mã sự kiện': log.event_id,
              'Hướng cổng': log.direction === 'ENTRY' ? 'Cổng vào (ENTRY)' : 'Cổng ra (EXIT)',
              'Thời gian': log.occurred_at
                ? new Date(log.occurred_at).toLocaleString('vi-VN')
                : 'Chưa ghi nhận',
            }}
          />
        )}
      </section>
    </div>
  );
}
