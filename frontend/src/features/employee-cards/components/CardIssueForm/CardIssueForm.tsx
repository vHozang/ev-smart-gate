import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback, openValidationNoticeModal } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { issueEmployeeCard, employeeCardIssueSchema } from '../../api';

export interface DriverLookupItem {
  id: string;
  label: string;
}

export interface CardIssueFormProps {
  modal: ModalContext;
  drivers: DriverLookupItem[];
}

const CARD_ISSUE_LABELS: Record<string, string> = {
  driver_id: 'Hồ sơ nhân sự / tài xế',
  card_uid: 'Mã UID vật lý của thẻ (RFID)',
  status_reason: 'Ghi chú phát hành',
};

export function CardIssueForm({ modal, drivers }: CardIssueFormProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();

  const [driverId, setDriverId] = useState(drivers[0]?.id || '');
  const [cardUid, setCardUid] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const saving = useRef(false);
  const { setDirty, setPending, close, formId } = modal;

  const isDirty = Boolean(cardUid.trim() || statusReason.trim());

  useEffect(() => {
    setDirty(isDirty);
    return () => {
      setDirty(false);
      // Xóa UID thô khỏi bộ nhớ khi đóng form
      setCardUid('');
    };
  }, [isDirty, setDirty]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving.current || !principal) return;

    setFieldErrors({});
    setValidationError(null);
    setError(null);

    const parsed = employeeCardIssueSchema.safeParse({
      driver_id: driverId,
      card_uid: cardUid,
      status_reason: statusReason || undefined,
    });

    if (!parsed.success) {
      const nextFieldErrors: Record<string, string> = {};
      const invalidLabels: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || '');
        if (key && !nextFieldErrors[key]) {
          nextFieldErrors[key] = issue.message;
        }
        invalidLabels.push(CARD_ISSUE_LABELS[key] || key || 'Thông tin thẻ');
      }
      setFieldErrors(nextFieldErrors);
      setValidationError(parsed.error.issues[0]?.message || 'Thông tin cấp thẻ không hợp lệ.');
      openValidationNoticeModal(feedback, {
        id: 'card-issue-validation-notice',
        title: 'Thiếu hoặc sai thông tin phát hành thẻ',
        fields: invalidLabels,
      });
      return;
    }

    const isCurrent = beginScope();
    saving.current = true;
    setPending(true);
    try {
      const issued = await issueEmployeeCard(parsed.data);
      // Xóa ngay UID thô sau khi gửi thành công, chỉ giữ card_uid_masked
      setCardUid('');
      if (!isCurrent()) return;
      await client.invalidateQueries({
        queryKey: queryKeys.resource(principal.id, 'employee-cards'),
      });
      if (!isCurrent()) return;
      setPending(false);
      close();
      feedback.notify({
        id: `card-issued-${issued.id}`,
        tone: 'success',
        title: 'Đã cấp thẻ nhân viên mới',
        description: `Thẻ ${issued.card_uid_masked} đã kích hoạt.`,
      });
    } catch (cause) {
      if (isCurrent()) setError(normalizeError(cause));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <form id={formId} className="form-stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {validationError && (
        <div role="alert" className="form-error">
          {validationError}
        </div>
      )}

      {error && (
        <div role="alert" className="form-error">
          {error.message}
          {error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Field
          id={`${formId}-driver`}
          label="Hồ sơ nhân sự / tài xế"
          error={fieldErrors.driver_id}
          required
        >
          {drivers.length > 0 ? (
            <Select
              id={`${formId}-driver`}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={modal.pending}
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={`${formId}-driver`}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              placeholder="UUID tài xế"
              disabled={modal.pending}
            />
          )}
        </Field>

        <Field
          id={`${formId}-card-uid`}
          label="Mã UID vật lý của thẻ (RFID)"
          hint="UID thô chỉ dùng một lần khi phát hành; hệ thống chỉ hiển thị dạng đã che (masked) sau khi lưu."
          error={fieldErrors.card_uid}
          required
        >
          <Input
            id={`${formId}-card-uid`}
            value={cardUid}
            onChange={(e) => setCardUid(e.target.value)}
            placeholder="Nhập hoặc quét mã UID thẻ"
            autoComplete="off"
            disabled={modal.pending}
          />
        </Field>

        <Field
          id={`${formId}-reason`}
          label="Ghi chú phát hành (tùy chọn)"
          error={fieldErrors.status_reason}
        >
          <Input
            id={`${formId}-reason`}
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="Ví dụ: Cấp mới nhân sự đợt 1"
            disabled={modal.pending}
          />
        </Field>
      </div>
    </form>
  );
}
