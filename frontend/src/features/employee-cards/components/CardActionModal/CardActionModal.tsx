import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback, openValidationNoticeModal } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import {
  blockEmployeeCard,
  reportLostEmployeeCard,
  replaceEmployeeCard,
  issueEmployeeCard,
  updateEmployeeCard,
  deleteEmployeeCard,
  employeeCardStatusSchema,
  employeeCardReplaceSchema,
} from '../../api';
import type { EmployeeCard, CardStatus } from '../../api';

export type CardLifecycleAction = 'block' | 'report-lost' | 'replace' | 'edit' | 'delete';

export interface CardActionModalProps {
  card: EmployeeCard;
  driverLabel: string;
  action: CardLifecycleAction;
  modal: ModalContext;
}

export function CardActionModal({ card, driverLabel, action, modal }: CardActionModalProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();

  const [newCardUid, setNewCardUid] = useState('');
  const [nextStatus, setNextStatus] = useState<CardStatus>(card.status);
  const [statusReason, setStatusReason] = useState(
    action === 'edit' ? (card.status_reason ?? '') : '',
  );
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ card_uid?: string; status_reason?: string }>({});
  const [error, setError] = useState<ApiError | null>(null);

  const locked = useRef(false);

  useEffect(() => {
    return () => {
      setNewCardUid('');
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || !principal) return;

    setValidationError(null);
    setFieldErrors({});
    setError(null);

    if (action === 'delete') {
      if (!confirmed) {
        const msg = 'Vui lòng tích xác nhận thực hiện thao tác xóa thẻ nhân viên.';
        setValidationError(msg);
        openValidationNoticeModal(feedback, {
          title: 'Chưa xác nhận xóa thẻ nhân viên',
          fields: ['Xác nhận xóa vĩnh viễn thẻ nhân viên'],
        });
        return;
      }

      const isCurrent = beginScope();
      locked.current = true;
      modal.setPending(true);
      try {
        await deleteEmployeeCard(card.id);
        if (!isCurrent()) return;
        await client.invalidateQueries({
          queryKey: queryKeys.resource(principal.id, 'employee-cards'),
        });
        if (!isCurrent()) return;
        modal.setPending(false);
        modal.close();
        feedback.notify({
          id: `card-deleted-${card.id}`,
          tone: 'success',
          title: 'Đã xóa thẻ nhân viên',
          description: `Thẻ ${card.card_uid_masked} (${driverLabel}) đã được xóa khỏi hệ thống.`,
        });
      } catch (cause) {
        if (isCurrent()) setError(normalizeError(cause));
      } finally {
        locked.current = false;
        modal.setPending(false);
      }
      return;
    }

    if (action === 'replace') {
      const parsed = employeeCardReplaceSchema.safeParse({
        card_uid: newCardUid,
        status_reason: statusReason,
      });
      const missingLabels: string[] = [];
      const nextErrors: { card_uid?: string; status_reason?: string } = {};

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const pathKey = issue.path[0];
          if (pathKey === 'card_uid' && !nextErrors.card_uid) {
            nextErrors.card_uid = issue.message;
            missingLabels.push('Mã UID vật lý của thẻ thay thế');
          } else if (pathKey === 'status_reason' && !nextErrors.status_reason) {
            nextErrors.status_reason = issue.message;
            missingLabels.push('Lý do thực hiện');
          }
        }
      }
      if (!confirmed) {
        missingLabels.push('Xác nhận thay đổi trạng thái thẻ');
      }

      if (!parsed.success || !confirmed) {
        setFieldErrors(nextErrors);
        setValidationError(
          !confirmed
            ? 'Vui lòng tích xác nhận thực hiện thao tác thay đổi trạng thái thẻ.'
            : parsed.error?.issues[0]?.message || 'Dữ liệu thay thế thẻ không hợp lệ.',
        );
        openValidationNoticeModal(feedback, {
          title: 'Chưa đủ thông tin thay thế thẻ nhân viên',
          fields: missingLabels,
        });
        return;
      }

      const isCurrent = beginScope();
      locked.current = true;
      modal.setPending(true);
      try {
        const updated =
          card.status === 'ACTIVE'
            ? await replaceEmployeeCard(card.id, parsed.data)
            : await issueEmployeeCard({
                driver_id: card.driver_id,
                card_uid: parsed.data.card_uid,
                status_reason: parsed.data.status_reason,
              });
        setNewCardUid('');
        if (!isCurrent()) return;
        await client.invalidateQueries({
          queryKey: queryKeys.resource(principal.id, 'employee-cards'),
        });
        if (!isCurrent()) return;
        modal.setPending(false);
        modal.close();
        feedback.notify({
          id: `card-replaced-${card.id}`,
          tone: 'success',
          title: 'Đã thay thế thẻ nhân viên',
          description: `Thẻ mới ${updated.card_uid_masked} đã kích hoạt cho ${driverLabel}.`,
        });
      } catch (cause) {
        if (isCurrent()) setError(normalizeError(cause));
      } finally {
        locked.current = false;
        modal.setPending(false);
      }
      return;
    }

    const parsed = employeeCardStatusSchema.safeParse({
      status_reason: statusReason,
    });
    const missingLabels: string[] = [];
    const nextErrors: { status_reason?: string } = {};

    if (!parsed.success) {
      nextErrors.status_reason = parsed.error.issues[0]?.message || 'Lý do cập nhật không hợp lệ.';
      missingLabels.push('Lý do thực hiện');
    }
    if (!confirmed) {
      missingLabels.push('Xác nhận thay đổi trạng thái thẻ');
    }

    if (!parsed.success || !confirmed) {
      setFieldErrors(nextErrors);
      setValidationError(
        !confirmed
          ? 'Vui lòng tích xác nhận thực hiện thao tác thay đổi trạng thái thẻ.'
          : parsed.error?.issues[0]?.message || 'Lý do cập nhật không hợp lệ.',
      );
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cập nhật thẻ nhân viên',
        fields: missingLabels,
      });
      return;
    }

    const isCurrent = beginScope();
    locked.current = true;
    modal.setPending(true);
    try {
      const updated =
        action === 'block'
          ? await blockEmployeeCard(card.id, parsed.data)
          : action === 'report-lost'
            ? await reportLostEmployeeCard(card.id, parsed.data)
            : await updateEmployeeCard(card.id, {
                status: nextStatus,
                status_reason: parsed.data.status_reason,
              });
      if (!isCurrent()) return;
      await client.invalidateQueries({
        queryKey: queryKeys.resource(principal.id, 'employee-cards'),
      });
      if (!isCurrent()) return;
      modal.setPending(false);
      modal.close();
      feedback.notify({
        id: `card-action-${action}-${updated.id}`,
        tone: 'success',
        title:
          action === 'block'
            ? 'Đã khóa thẻ nhân viên'
            : action === 'report-lost'
              ? 'Đã ghi nhận báo mất thẻ'
              : 'Đã cập nhật thẻ nhân viên',
        description: `Thẻ ${updated.card_uid_masked} (${driverLabel}) đang ở trạng thái ${updated.status}.`,
      });
    } catch (cause) {
      if (isCurrent()) setError(normalizeError(cause));
    } finally {
      locked.current = false;
      modal.setPending(false);
    }
  }

  const actionSummary =
    action === 'block'
      ? 'Khóa thẻ sẽ thu hồi tức thì quyền quẹt thẻ tại cổng ra/vào.'
      : action === 'report-lost'
        ? 'Báo mất sẽ vô hiệu hóa vĩnh viễn thẻ bị thất lạc để ngăn sử dụng trái phép.'
        : action === 'replace'
          ? 'Thay thế sẽ thu hồi thẻ hiện tại và phát hành thẻ RFID mới cho cùng tài xế.'
          : action === 'edit'
            ? 'Cập nhật trạng thái hoạt động và ghi chú lý do của thẻ nhân viên.'
            : 'Xóa vĩnh viễn bản ghi thẻ RFID khỏi hệ thống.';

  return (
    <form className="form-stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <p style={{ margin: 0 }}>
        Thao tác đối với thẻ <strong className="mono">{card.card_uid_masked}</strong> của{' '}
        <strong>{driverLabel}</strong>. {actionSummary}
      </p>

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

      {action === 'edit' && (
        <Field id="edit-card-status" label="Trạng thái thẻ" required>
          <Select
            id="edit-card-status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as CardStatus)}
            disabled={modal.pending}
          >
            <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
            <option value="BLOCKED">Đã khóa (BLOCKED)</option>
            <option value="LOST">Báo mất (LOST)</option>
            <option value="REPLACED">Đã thay thế (REPLACED)</option>
          </Select>
        </Field>
      )}

      {action === 'replace' && (
        <Field
          id="replace-card-uid"
          label="Mã UID vật lý của thẻ thay thế"
          hint="UID thô sẽ được xóa khỏi giao diện ngay sau khi hoàn tất."
          error={fieldErrors.card_uid}
          required
        >
          <Input
            id="replace-card-uid"
            value={newCardUid}
            onChange={(e) => {
              setNewCardUid(e.target.value);
              if (fieldErrors.card_uid) setFieldErrors((prev) => ({ ...prev, card_uid: undefined }));
            }}
            placeholder="Nhập mã UID thẻ mới"
            autoComplete="off"
            invalid={Boolean(fieldErrors.card_uid)}
            disabled={modal.pending}
          />
        </Field>
      )}

      {action !== 'delete' && (
        <Field
          id="card-status-reason"
          label="Lý do thực hiện"
          error={fieldErrors.status_reason}
          required
        >
          <Input
            id="card-status-reason"
            value={statusReason}
            onChange={(e) => {
              setStatusReason(e.target.value);
              if (fieldErrors.status_reason) {
                setFieldErrors((prev) => ({ ...prev, status_reason: undefined }));
              }
            }}
            placeholder="Nhập lý do chi tiết (tối thiểu 3 ký tự)"
            invalid={Boolean(fieldErrors.status_reason)}
            disabled={modal.pending}
          />
        </Field>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={modal.pending}
        />
        <span>
          {action === 'delete'
            ? `Tôi xác nhận xóa vĩnh viễn thẻ ${card.card_uid_masked}`
            : `Tôi xác nhận thay đổi trạng thái đối với thẻ ${card.card_uid_masked}`}
        </span>
      </label>

      <div className="modal__actions">
        <Button type="button" onClick={modal.requestClose} disabled={modal.pending}>
          Hủy
        </Button>
        <Button
          type="submit"
          variant={action === 'replace' || action === 'edit' ? 'primary' : 'danger'}
          pending={modal.pending}
        >
          {action === 'block'
            ? 'Xác nhận khóa thẻ'
            : action === 'report-lost'
              ? 'Xác nhận báo mất'
              : action === 'replace'
                ? 'Xác nhận thay thế'
                : action === 'edit'
                  ? 'Lưu thay đổi'
                  : 'Xóa vĩnh viễn'}
        </Button>
      </div>
    </form>
  );
}
