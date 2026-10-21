import { useEffect, useState } from 'react';
import { ArrowsClockwiseIcon, ShieldCheckIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import { formatDate, fromDateInputValue, toDateInputValue } from '@/shared/lib';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { fetchPersonSnapshotBlob, isBarrierConfirmedOpen } from './api';
import type {
  EmployeePatchInput,
  EmployeeView,
  FactorView,
  GrantPatchInput,
  GrantView,
  PersonLogView,
  VerificationView,
} from './api';

export interface VerificationResultCardProps {
  verification: VerificationView;
  reconciling?: boolean;
  onReconcile?: (eventId: string) => void;
}

const FACTOR_LABELS: Record<FactorView['factor'], string> = {
  card: 'Thẻ nhân viên (RFID)',
  face: 'Sinh trắc khuôn mặt (Face 1:1)',
  plate: 'Biển số phương tiện (ALPR)',
  authorization: 'Ủy quyền Tài xế – Xe',
  employee: 'Danh bạ nhân viên (Employee Registry)',
  grant: 'Quyền đi bộ (Pedestrian Grant)',
  capture: 'Tính toàn vẹn gói thu nhận (Capture Bundle)',
};

function formatFactorScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) {
    return 'Chưa có điểm';
  }
  const normalized = score <= 1 && score >= 0 ? score * 100 : score;
  return `${normalized.toFixed(1)}%`;
}

export function VerificationResultCard({
  verification,
  reconciling = false,
  onReconcile,
}: VerificationResultCardProps) {
  const confirmedOpen = isBarrierConfirmedOpen(verification);
  const needsReconcile =
    verification.status === 'OUTCOME_UNKNOWN' || verification.barrier_status === 'UNKNOWN';

  return (
    <div className="space-y-4 text-sm" data-testid="verification-result-card" aria-live="polite">
      {/* Header tóm tắt sự kiện */}
      <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--color-muted)]">Mã sự kiện đối soát (event_id)</p>
          <p className="mono font-semibold text-sm">
            <DecryptedText text={verification.event_id} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{verification.access_mode.toUpperCase()}</Badge>
          <Badge tone={verification.direction === 'ENTRY' ? 'neutral' : 'warning'}>
            {verification.direction === 'ENTRY' ? 'VÀO (ENTRY)' : 'RA (EXIT)'}
          </Badge>
          <Badge
            tone={
              verification.status === 'COMPLETED'
                ? 'success'
                : verification.status === 'OUTCOME_UNKNOWN'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {verification.status}
          </Badge>
        </div>
      </div>

      {/* Cảnh báo OUTCOME_UNKNOWN và đối soát cùng event_id */}
      {needsReconcile && (
        <div
          role="alert"
          data-testid="verification-outcome-unknown"
          className="p-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] space-y-2"
        >
          <div className="flex items-start gap-2">
            <WarningCircleIcon size={18} className="shrink-0 mt-0.5 text-[var(--color-warning)]" />
            <div>
              <p className="font-semibold text-[var(--color-text)]">
                Trạng thái xử lý chưa xác định (OUTCOME_UNKNOWN)
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Hệ thống chưa nhận đủ xác nhận cuối cùng từ dịch vụ hoặc thiết bị chấp hành. Không
                tự gửi lại sự kiện mới (retry mù) và không giả định lệnh mở cổng đã bị hủy.
              </p>
            </div>
          </div>
          {onReconcile && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                pending={reconciling}
                icon={<ArrowsClockwiseIcon size={15} />}
                onClick={() => onReconcile(verification.event_id)}
              >
                Tra cứu đối soát cùng mã sự kiện
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 1. Quan sát & yếu tố nhận diện (Factors / Observations) */}
      <section
        className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2.5"
        data-testid="verification-factors"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            1. Quan sát & yếu tố nhận diện (Factors / Observations)
          </h4>
          <Badge tone="neutral">Chỉ tạo quan sát — Không mở cổng trực tiếp</Badge>
        </div>

        {verification.factors.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Chưa có danh sách yếu tố đánh giá chi tiết từ máy chủ.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {verification.factors.map((item, idx) => (
              <div
                key={`${item.factor}-${idx}`}
                className="p-2.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2"
                data-testid={`factor-item-${item.factor}`}
              >
                <div>
                  <p className="font-medium text-xs">{FACTOR_LABELS[item.factor] || item.factor}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mono">
                    Điểm tin cậy: {formatFactorScore(item.score)}
                    {item.reason_code ? ` · Mã: ${item.reason_code}` : ''}
                  </p>
                </div>
                <Badge
                  tone={
                    item.status === 'PASSED'
                      ? 'success'
                      : item.status === 'FAILED' || item.status === 'ERROR'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Quyết định cấp phép nghiệp vụ (Permit Decision) */}
      <section
        className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2"
        data-testid="verification-permit"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            2. Quyết định xác minh & cấp phép nghiệp vụ (Permit Decision)
          </h4>
          <Badge tone={verification.permit_granted ? 'success' : 'danger'}>
            {verification.permit_granted
              ? 'ĐƯỢC CẤP PHÉP (PERMIT GRANTED)'
              : 'TỪ CHỐI CẤP PHÉP (PERMIT DENIED)'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[var(--color-muted)]">Kết quả xác minh: </span>
            <strong className="mono">{verification.verification_status ?? 'CHƯA XÁC ĐỊNH'}</strong>
          </div>
          <div>
            <span className="text-[var(--color-muted)]">Hoàn tất xác minh: </span>
            <span className="mono">{formatDate(verification.verification_completed_at)}</span>
          </div>
        </div>

        {verification.reason_codes.length > 0 && (
          <div className="pt-1">
            <span className="text-xs text-[var(--color-muted)]">Mã lý do nghiệp vụ: </span>
            <span className="mono text-xs font-semibold">
              {verification.reason_codes.join(', ')}
            </span>
          </div>
        )}
      </section>

      {/* 3. Lệnh thiết bị & Xác nhận Barrier (Command & ACK) */}
      <section
        className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2"
        data-testid="verification-barrier"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            3. Kết quả chấp hành thiết bị Barrier (Command & ACK)
          </h4>
          {confirmedOpen ? (
            <Badge tone="success" pulse>
              <ShieldCheckIcon size={14} className="inline mr-1" />
              Đã mở barrier (OPENED)
            </Badge>
          ) : verification.barrier_status === 'PENDING' ? (
            <Badge tone="warning">Đang chờ ACK thiết bị (PENDING)</Badge>
          ) : verification.barrier_status === 'FAILED' ? (
            <Badge tone="danger">Lỗi chấp hành thiết bị (FAILED)</Badge>
          ) : verification.barrier_status === 'UNKNOWN' ? (
            <Badge tone="warning">Chưa rõ trạng thái thiết bị (UNKNOWN)</Badge>
          ) : (
            <Badge tone="neutral">Không gửi lệnh mở cổng (NOT_REQUESTED)</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-[var(--color-muted)]">Mã lệnh (command_id): </span>
            <span className="mono">{verification.command_id || 'Chưa phát hành'}</span>
          </div>
          <div>
            <span className="text-[var(--color-muted)]">Thời điểm gửi lệnh: </span>
            <span className="mono">{formatDate(verification.command_sent_at)}</span>
          </div>
          <div>
            <span className="text-[var(--color-muted)]">Thời điểm ACK: </span>
            <span className="mono">{formatDate(verification.acknowledged_at)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PersonLogEvidenceModalBody({ log }: { log: PersonLogView }) {
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (log.snapshot_count <= 0) {
      setSnapshotBlob(null);
      return;
    }
    const controller = new AbortController();
    setError(null);

    fetchPersonSnapshotBlob(log.id, 0, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          setSnapshotBlob(blob);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(normalizeError(err).message);
        }
      });

    return () => {
      controller.abort();
    };
  }, [log.id, log.snapshot_count]);

  return (
    <div className="space-y-4 text-sm" data-testid="person-log-detail-modal">
      <VerificationResultCard verification={log} />
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Ảnh bằng chứng điểm kiểm soát đi bộ ({log.snapshot_count} ảnh)
        </h4>
        {error && (
          <div role="alert" className="form-error text-xs">
            {error}
          </div>
        )}
        <EvidenceViewer
          source={snapshotBlob}
          alt={`Ảnh bằng chứng lượt đi bộ ${log.event_id}`}
          title={`Sự kiện: ${log.event_id} · Cổng: ${log.gate_id}`}
        />
      </div>
    </div>
  );
}

export function EmployeeEditModalForm({
  formId,
  employee,
  onSubmit,
}: {
  formId: string;
  employee: EmployeeView;
  onSubmit: (payload: EmployeePatchInput) => Promise<void>;
}) {
  const feedback = useFeedback();
  const [employeeCode, setEmployeeCode] = useState(employee.employee_code);
  const [isActive, setIsActive] = useState(employee.is_active);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ employee_code?: string; reason?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const missing: string[] = [];
    const nextErrors: { employee_code?: string; reason?: string } = {};

    if (!employeeCode.trim()) {
      nextErrors.employee_code = 'Mã nhân viên không được để trống.';
      missing.push('Mã nhân viên (employee_code)');
    }
    if (reason.trim().length < 3) {
      nextErrors.reason = 'Lý do cập nhật phải từ 3 ký tự trở lên.';
      missing.push('Lý do cập nhật (bắt buộc kiểm toán)');
    }

    if (missing.length > 0) {
      setFieldErrors(nextErrors);
      setError(nextErrors.reason || nextErrors.employee_code || 'Dữ liệu không hợp lệ.');
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cập nhật nhân viên',
        fields: missing,
      });
      return;
    }

    await onSubmit({
      expected_version: employee.version,
      reason: reason.trim(),
      employee_code: employeeCode.trim(),
      is_active: isActive,
    });
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-3" noValidate>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <Field
        id="edit-emp-code"
        label="Mã nhân viên (employee_code)"
        error={fieldErrors.employee_code}
        required
      >
        <Input
          id="edit-emp-code"
          value={employeeCode}
          invalid={Boolean(fieldErrors.employee_code)}
          onChange={(e) => {
            setEmployeeCode(e.target.value);
            if (fieldErrors.employee_code) {
              setFieldErrors((prev) => ({ ...prev, employee_code: undefined }));
            }
          }}
        />
      </Field>
      <Field id="edit-emp-status" label="Trạng thái kích hoạt" required>
        <Select
          id="edit-emp-status"
          value={isActive ? 'active' : 'inactive'}
          onChange={(e) => setIsActive(e.target.value === 'active')}
        >
          <option value="active">Đang hoạt động (Active)</option>
          <option value="inactive">Ngưng kích hoạt (Inactive)</option>
        </Select>
      </Field>
      <Field
        id="edit-emp-reason"
        label="Lý do cập nhật (bắt buộc kiểm toán)"
        error={fieldErrors.reason}
        required
      >
        <Input
          id="edit-emp-reason"
          value={reason}
          invalid={Boolean(fieldErrors.reason)}
          onChange={(e) => {
            setReason(e.target.value);
            if (fieldErrors.reason) {
              setFieldErrors((prev) => ({ ...prev, reason: undefined }));
            }
          }}
          placeholder="Nhập lý do thay đổi mã hoặc trạng thái nhân viên..."
        />
      </Field>
    </form>
  );
}

export function GrantEditModalForm({
  formId,
  grant,
  onSubmit,
}: {
  formId: string;
  grant: GrantView;
  onSubmit: (payload: GrantPatchInput) => Promise<void>;
}) {
  const feedback = useFeedback();
  const [accessPointId, setAccessPointId] = useState(grant.access_point_ids.join(', '));
  const [status, setStatus] = useState<'ACTIVE' | 'REVOKED'>(grant.status);
  const [validFrom, setValidFrom] = useState(grant.valid_from);
  const [validUntil, setValidUntil] = useState(grant.valid_until);
  const [reason, setReason] = useState(grant.reason);
  const [fieldErrors, setFieldErrors] = useState<{
    accessPointId?: string;
    validUntil?: string;
    reason?: string;
  }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: string[] = [];
    const nextErrors: typeof fieldErrors = {};
    const apList = accessPointId
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (apList.length === 0) {
      nextErrors.accessPointId = 'Vui lòng nhập ít nhất 1 điểm kiểm soát.';
      missing.push('Điểm kiểm soát (access_point_id)');
    }
    if (!validFrom || !validUntil || Date.parse(validUntil) <= Date.parse(validFrom)) {
      nextErrors.validUntil = 'Thời điểm kết thúc hiệu lực phải sau thời điểm bắt đầu.';
      missing.push('Khoảng thời gian hiệu lực (Từ ngày / Đến ngày)');
    }
    if (reason.trim().length < 3) {
      nextErrors.reason = 'Lý do cập nhật phải từ 3 ký tự trở lên.';
      missing.push('Lý do cập nhật');
    }

    if (missing.length > 0) {
      setFieldErrors(nextErrors);
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cập nhật quyền đi bộ',
        fields: missing,
      });
      return;
    }

    await onSubmit({
      expected_version: grant.version,
      reason: reason.trim(),
      access_point_ids: apList,
      valid_from: validFrom,
      valid_until: validUntil,
      status,
    });
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-3" noValidate>
      <Field
        id="edit-grant-ap"
        label="Điểm kiểm soát (access_point_id)"
        error={fieldErrors.accessPointId}
        required
      >
        <Input
          id="edit-grant-ap"
          value={accessPointId}
          invalid={Boolean(fieldErrors.accessPointId)}
          onChange={(e) => {
            setAccessPointId(e.target.value);
            if (fieldErrors.accessPointId) {
              setFieldErrors((prev) => ({ ...prev, accessPointId: undefined }));
            }
          }}
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="edit-grant-from" label="Hiệu lực từ ngày" required>
          <Input
            id="edit-grant-from"
            type="date"
            value={toDateInputValue(validFrom)}
            onChange={(e) => setValidFrom(fromDateInputValue(e.target.value, false))}
          />
        </Field>
        <Field
          id="edit-grant-until"
          label="Hiệu lực đến ngày"
          error={fieldErrors.validUntil}
          required
        >
          <Input
            id="edit-grant-until"
            type="date"
            value={toDateInputValue(validUntil)}
            invalid={Boolean(fieldErrors.validUntil)}
            onChange={(e) => {
              setValidUntil(fromDateInputValue(e.target.value, true));
              if (fieldErrors.validUntil) {
                setFieldErrors((prev) => ({ ...prev, validUntil: undefined }));
              }
            }}
          />
        </Field>
      </div>
      <Field id="edit-grant-status" label="Trạng thái quyền đi bộ" required>
        <Select
          id="edit-grant-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'REVOKED')}
        >
          <option value="ACTIVE">Đang hiệu lực (ACTIVE)</option>
          <option value="REVOKED">Đã thu hồi (REVOKED)</option>
        </Select>
      </Field>
      <Field id="edit-grant-reason" label="Lý do cập nhật" error={fieldErrors.reason} required>
        <Input
          id="edit-grant-reason"
          value={reason}
          invalid={Boolean(fieldErrors.reason)}
          onChange={(e) => {
            setReason(e.target.value);
            if (fieldErrors.reason) {
              setFieldErrors((prev) => ({ ...prev, reason: undefined }));
            }
          }}
          placeholder="Nhập lý do cập nhật..."
        />
      </Field>
    </form>
  );
}
