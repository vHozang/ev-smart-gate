import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback, openValidationNoticeModal } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { fromDateInputValue, toDateInputValue } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import {
  createAuthorization,
  updateAuthorization,
  authorizationCreateSchema,
} from '../../api';
import type { DriverVehicleAuthorization } from '../../api';

export interface AuthorizationLookupItem {
  id: string;
  label: string;
}

export interface AuthorizationFormProps {
  modal: ModalContext;
  drivers: AuthorizationLookupItem[];
  vehicles: AuthorizationLookupItem[];
  authorization?: DriverVehicleAuthorization;
}

export function AuthorizationForm({
  modal,
  drivers,
  vehicles,
  authorization,
}: AuthorizationFormProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();

  const [driverId, setDriverId] = useState(authorization?.driver_id || drivers[0]?.id || '');
  const [vehicleId, setVehicleId] = useState(authorization?.vehicle_id || vehicles[0]?.id || '');
  const [validFrom, setValidFrom] = useState(
    () => authorization?.valid_from || new Date().toISOString(),
  );
  const [validUntil, setValidUntil] = useState(authorization?.valid_until || '');
  const [nextStatus, setNextStatus] = useState<'ACTIVE' | 'INACTIVE'>(
    authorization?.status ?? 'ACTIVE',
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    driver_id?: string;
    vehicle_id?: string;
    valid_from?: string;
    valid_until?: string;
  }>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  const saving = useRef(false);
  const uncertain = useRef(false);

  const isDirty = Boolean(validUntil.trim() || authorization);
  const { setDirty, setPending, close, formId } = modal;

  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving.current || uncertain.current || !principal) return;

    setValidationError(null);
    setFieldErrors({});
    setError(null);

    const parsed = authorizationCreateSchema.safeParse({
      driver_id: driverId,
      vehicle_id: vehicleId,
      valid_from: validFrom,
      valid_until: validUntil,
    });

    if (!parsed.success) {
      const nextErrors: {
        driver_id?: string;
        vehicle_id?: string;
        valid_from?: string;
        valid_until?: string;
      } = {};
      const missing: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'driver_id' && !nextErrors.driver_id) {
          nextErrors.driver_id = issue.message;
          missing.push('Hồ sơ người điều khiển (Driver)');
        } else if (key === 'vehicle_id' && !nextErrors.vehicle_id) {
          nextErrors.vehicle_id = issue.message;
          missing.push('Phương tiện được phép điều khiển');
        } else if (key === 'valid_from' && !nextErrors.valid_from) {
          nextErrors.valid_from = issue.message;
          missing.push('Hiệu lực từ ngày');
        } else if (key === 'valid_until' && !nextErrors.valid_until) {
          nextErrors.valid_until = issue.message;
          missing.push('Hiệu lực đến ngày');
        }
      }
      setFieldErrors(nextErrors);
      setValidationError(parsed.error.issues[0]?.message || 'Dữ liệu ủy quyền không hợp lệ.');
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin ủy quyền Tài xế – Phương tiện',
        fields: missing,
      });
      return;
    }

    const isCurrent = beginScope();
    saving.current = true;
    setPending(true);
    try {
      const saved = authorization
        ? await updateAuthorization(authorization.id, {
            valid_from: new Date(parsed.data.valid_from).toISOString(),
            valid_until:
              parsed.data.valid_until && parsed.data.valid_until.trim()
                ? new Date(parsed.data.valid_until).toISOString()
                : null,
            status: nextStatus,
          })
        : await createAuthorization(parsed.data);
      if (!isCurrent()) return;
      await client.invalidateQueries({
        queryKey: queryKeys.resource(principal.id, 'authorizations'),
      });
      if (!isCurrent()) return;
      setPending(false);
      close();
      feedback.notify({
        id: `authz-saved-${saved.id}`,
        tone: 'success',
        title: authorization
          ? 'Đã cập nhật ủy quyền điều khiển phương tiện'
          : 'Đã cấp ủy quyền điều khiển phương tiện',
        description: `${saved.driver_id.slice(0, 8)}… → ${saved.vehicle_id.slice(0, 8)}…`,
      });
    } catch (cause) {
      if (!isCurrent()) return;
      const safe = normalizeError(cause);
      setError(safe);
      if (
        safe.code === 'NETWORK_ERROR' ||
        safe.code === 'CONTRACT_INVALID' ||
        (safe.status !== undefined && safe.status >= 500)
      ) {
        uncertain.current = true;
        setOutcomeUnknown(true);
        modal.setSubmitBlocked(true);
      }
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <form id={formId} className="form-stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {outcomeUnknown && (
        <div className="inline-note" role="status">
          <div>
            <strong>Chưa xác nhận được kết quả cấp ủy quyền.</strong>
            <p>Dịch vụ có thể đã nhận yêu cầu. Hãy kiểm tra lại danh sách trước khi gửi thêm.</p>
            <Button
              className="mt-3"
              onClick={() => {
                if (principal)
                  void client.invalidateQueries({
                    queryKey: queryKeys.resource(principal.id, 'authorizations'),
                  });
                modal.close();
              }}
            >
              Đóng và kiểm tra danh sách
            </Button>
          </div>
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          id={`${formId}-driver`}
          label="Hồ sơ người điều khiển (Driver)"
          error={fieldErrors.driver_id}
          required
        >
          {drivers.length > 0 ? (
            <Select
              id={`${formId}-driver`}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={modal.pending || Boolean(authorization)}
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
              invalid={Boolean(fieldErrors.driver_id)}
              disabled={modal.pending || Boolean(authorization)}
            />
          )}
        </Field>

        <Field
          id={`${formId}-vehicle`}
          label="Phương tiện được phép điều khiển"
          error={fieldErrors.vehicle_id}
          required
        >
          {vehicles.length > 0 ? (
            <Select
              id={`${formId}-vehicle`}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={modal.pending || Boolean(authorization)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={`${formId}-vehicle`}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              placeholder="UUID phương tiện"
              invalid={Boolean(fieldErrors.vehicle_id)}
              disabled={modal.pending || Boolean(authorization)}
            />
          )}
        </Field>

        <Field
          id={`${formId}-valid_from`}
          label="Hiệu lực từ ngày"
          error={fieldErrors.valid_from}
          required
        >
          <Input
            id={`${formId}-valid_from`}
            type="date"
            value={toDateInputValue(validFrom)}
            onChange={(e) => setValidFrom(fromDateInputValue(e.target.value, false))}
            invalid={Boolean(fieldErrors.valid_from)}
            disabled={modal.pending}
          />
        </Field>

        <Field
          id={`${formId}-valid_until`}
          label="Hiệu lực đến ngày (tùy chọn)"
          error={fieldErrors.valid_until}
        >
          <Input
            id={`${formId}-valid_until`}
            type="date"
            value={toDateInputValue(validUntil)}
            onChange={(e) => setValidUntil(fromDateInputValue(e.target.value, true))}
            invalid={Boolean(fieldErrors.valid_until)}
            disabled={modal.pending}
          />
        </Field>

        {authorization && (
          <Field id={`${formId}-status`} label="Trạng thái ủy quyền" required>
            <Select
              id={`${formId}-status`}
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
              disabled={modal.pending}
            >
              <option value="ACTIVE">Đang hiệu lực (ACTIVE)</option>
              <option value="INACTIVE">Ngừng hiệu lực (INACTIVE)</option>
            </Select>
          </Field>
        )}
      </div>
    </form>
  );
}
