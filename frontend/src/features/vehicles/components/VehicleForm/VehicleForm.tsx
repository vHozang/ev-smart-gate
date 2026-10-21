import { useAsyncScope } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { useAuth } from '@/features/auth';
import { createVehicle, updateVehicle } from '../../api/vehicles';
import { vehicleFormSchema } from '../../model/schema';
import type { Vehicle, VehicleFormValues } from '../../model/schema';
export interface VehicleFormProps {
  modal: ModalContext;
  vehicle?: Vehicle;
}
export function VehicleForm({ modal, vehicle }: VehicleFormProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();
  const saving = useRef(false);
  const uncertain = useRef(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      plate_number: vehicle?.plate_number || '',
      vehicle_type: vehicle?.vehicle_type || '',
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      color: vehicle?.color || '',
    },
  });
  const { setDirty, setPending, close, formId } = modal;
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);
  async function submit(values: VehicleFormValues) {
    if (saving.current || uncertain.current || !principal) return;
    const isCurrent = beginScope();
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const payload = {
        ...values,
        make: values.make.trim() || null,
        model: values.model.trim() || null,
        color: values.color.trim() || null,
      };
      const saved = vehicle
        ? await updateVehicle(vehicle.id, payload)
        : await createVehicle(payload);
      if (!isCurrent()) return;
      await client.invalidateQueries({ queryKey: queryKeys.resource(principal.id, 'vehicles') });
      if (!isCurrent()) return;
      setPending(false);
      close();
      feedback.notify({
        id: `vehicle-saved-${saved.id}`,
        tone: 'success',
        title: vehicle ? 'Đã cập nhật phương tiện' : 'Đã thêm phương tiện',
        description: saved.plate_number,
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
  const fields = [
    {
      name: 'plate_number',
      label: 'Biển số',
      placeholder: 'Nhập biển số phương tiện',
      required: true,
    },
    {
      name: 'vehicle_type',
      label: 'Loại phương tiện',
      placeholder: 'motorcycle, car, truck hoặc mã hiện tại',
      required: true,
    },
    { name: 'make', label: 'Hãng xe', placeholder: 'Không bắt buộc' },
    { name: 'model', label: 'Dòng xe', placeholder: 'Không bắt buộc' },
    { name: 'color', label: 'Màu xe', placeholder: 'Không bắt buộc' },
  ] as const;
  return (
    <form id={formId} className="form-stack" onSubmit={handleSubmit(submit)} noValidate>
      {outcomeUnknown && (
        <div className="inline-note" role="status">
          <div>
            <strong>Chưa xác nhận được kết quả lưu.</strong>
            <p>Dịch vụ có thể đã nhận yêu cầu. Hãy kiểm tra lại danh sách trước khi gửi thêm.</p>
            <Button
              className="mt-3"
              onClick={() => {
                if (principal)
                  void client.invalidateQueries({
                    queryKey: queryKeys.resource(principal.id, 'vehicles'),
                  });
                modal.close();
              }}
            >
              Đóng và kiểm tra danh sách
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="form-error">
          {error.message}
          {error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `${formId}-${field.name}`;
          const message = errors[field.name]?.message;
          return (
            <Field
              key={field.name}
              id={id}
              label={field.label}
              required={'required' in field}
              error={message}
            >
              <Input
                id={id}
                autoComplete="off"
                {...register(field.name)}
                placeholder={field.placeholder}
                aria-invalid={!!message}
                aria-describedby={message ? `${id}-error` : undefined}
                disabled={modal.pending}
              />
            </Field>
          );
        })}
      </div>
      <p className="field__hint">
        Loại phương tiện giữ theo mã backend hiện tại; dữ liệu cũ không tự đổi sang phân loại mới.
      </p>
    </form>
  );
}
