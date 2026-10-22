import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import type { Driver } from '@/features/drivers';
import type { Vehicle } from '@/features/vehicles';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Button } from '@/shared/ui/Button';
import { fromDateInputValue, toDateInputValue } from '@/shared/lib';
import {
  orderCreateSchema,
  orderUpdateSchema,
  type CreateOrderInput,
  type UpdateOrderInput,
  type WarehouseOrder,
} from '../../api';

export interface CargoRowInput {
  name: string;
  quantity: string;
  unit: string;
}

export interface OrderFormProps {
  formId: string;
  order?: WarehouseOrder;
  drivers: readonly Driver[];
  vehicles: readonly Vehicle[];
  onSubmitCreate?: (payload: CreateOrderInput) => Promise<void>;
  onSubmitUpdate?: (payload: UpdateOrderInput) => Promise<void>;
}

export function OrderForm({
  formId,
  order,
  drivers,
  vehicles,
  onSubmitCreate,
  onSubmitUpdate,
}: OrderFormProps) {
  const [orderId, setOrderId] = useState(order?.order_id ?? '');
  const [assignedDriverId, setAssignedDriverId] = useState(
    order?.assigned_driver_id ?? drivers[0]?.id ?? '',
  );
  const [assignedVehicleId, setAssignedVehicleId] = useState(
    order?.assigned_vehicle_id ?? vehicles[0]?.id ?? '',
  );
  const [validFrom, setValidFrom] = useState(
    () =>
      order?.valid_from ??
      fromDateInputValue(new Date().toISOString().slice(0, 10), false),
  );
  const [validUntil, setValidUntil] = useState(
    () =>
      order?.valid_until ??
      fromDateInputValue(
        new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        true,
      ),
  );
  const [cargoItems, setCargoItems] = useState<CargoRowInput[]>(() => {
    if (order?.cargo_metadata && order.cargo_metadata.length > 0) {
      return order.cargo_metadata.map((item) => ({
        name: String(item.name ?? ''),
        quantity: String(item.quantity ?? '1'),
        unit: String(item.unit ?? 'kiện'),
      }));
    }
    return [{ name: '', quantity: '1', unit: 'kiện' }];
  });
  const feedback = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    order_id?: string;
    assigned_driver_id?: string;
    assigned_vehicle_id?: string;
    valid_from?: string;
    valid_until?: string;
  }>({});

  const addCargoRow = () => {
    setCargoItems((prev) => [...prev, { name: '', quantity: '1', unit: 'kiện' }]);
  };

  const removeCargoRow = (idx: number) => {
    setCargoItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCargoRow = (idx: number, field: keyof CargoRowInput, value: string) => {
    setCargoItems((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const normalizedCargo = cargoItems
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        name: c.name.trim(),
        quantity: Number.isFinite(Number(c.quantity)) ? Number(c.quantity) : c.quantity.trim(),
        unit: c.unit.trim() || 'kiện',
      }));

    if (order) {
      const candidate: UpdateOrderInput = {
        assigned_driver_id: assignedDriverId.trim(),
        assigned_vehicle_id: assignedVehicleId.trim(),
        valid_from: validFrom.trim(),
        valid_until: validUntil.trim(),
        cargo_metadata: normalizedCargo,
      };
      const parsed = orderUpdateSchema.safeParse(candidate);
      if (!parsed.success) {
        const nextErrors: typeof fieldErrors = {};
        const missing: string[] = [];
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (key === 'assigned_driver_id' && !nextErrors.assigned_driver_id) {
            nextErrors.assigned_driver_id = issue.message;
            missing.push('Tài xế phụ trách (assigned_driver_id)');
          } else if (key === 'assigned_vehicle_id' && !nextErrors.assigned_vehicle_id) {
            nextErrors.assigned_vehicle_id = issue.message;
            missing.push('Phương tiện vận chuyển (assigned_vehicle_id)');
          } else if (key === 'valid_from' && !nextErrors.valid_from) {
            nextErrors.valid_from = issue.message;
            missing.push('Hiệu lực từ ngày');
          } else if (key === 'valid_until' && !nextErrors.valid_until) {
            nextErrors.valid_until = issue.message;
            missing.push('Hiệu lực đến ngày');
          }
        }
        setFieldErrors(nextErrors);
        setError(parsed.error.issues[0]?.message ?? 'Thông tin cập nhật đơn hàng không hợp lệ.');
        openValidationNoticeModal(feedback, {
          title: 'Chưa đủ thông tin cập nhật đơn hàng xuất kho',
          fields: missing,
        });
        return;
      }
      await onSubmitUpdate?.(parsed.data);
      return;
    }

    const candidate: CreateOrderInput = {
      order_id: orderId.trim(),
      assigned_driver_id: assignedDriverId.trim(),
      assigned_vehicle_id: assignedVehicleId.trim(),
      valid_from: validFrom.trim(),
      valid_until: validUntil.trim(),
      cargo_metadata: normalizedCargo,
    };
    const parsed = orderCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrors: typeof fieldErrors = {};
      const missing: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'order_id' && !nextErrors.order_id) {
          nextErrors.order_id = issue.message;
          missing.push('Mã đơn hàng xuất kho (order_id)');
        } else if (key === 'assigned_driver_id' && !nextErrors.assigned_driver_id) {
          nextErrors.assigned_driver_id = issue.message;
          missing.push('Tài xế phụ trách (assigned_driver_id)');
        } else if (key === 'assigned_vehicle_id' && !nextErrors.assigned_vehicle_id) {
          nextErrors.assigned_vehicle_id = issue.message;
          missing.push('Phương tiện vận chuyển (assigned_vehicle_id)');
        } else if (key === 'valid_from' && !nextErrors.valid_from) {
          nextErrors.valid_from = issue.message;
          missing.push('Hiệu lực từ ngày');
        } else if (key === 'valid_until' && !nextErrors.valid_until) {
          nextErrors.valid_until = issue.message;
          missing.push('Hiệu lực đến ngày');
        }
      }
      setFieldErrors(nextErrors);
      setError(parsed.error.issues[0]?.message ?? 'Thông tin tạo đơn hàng không hợp lệ.');
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin tạo đơn hàng xuất kho',
        fields: missing,
      });
      return;
    }
    await onSubmitCreate?.(parsed.data);
  };

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="form-error" data-testid="order-form-error">
          {error}
        </div>
      )}

      <Field
        id="order-code-input"
        label="Mã đơn hàng xuất kho (order_id)"
        required={!order}
        error={fieldErrors.order_id}
        hint={order ? 'Mã đơn hàng là định danh bất biến sau khi tạo.' : undefined}
      >
        <Input
          id="order-code-input"
          value={orderId}
          disabled={Boolean(order)}
          invalid={Boolean(fieldErrors.order_id)}
          onChange={(e) => {
            setOrderId(e.target.value);
            if (fieldErrors.order_id) setFieldErrors((prev) => ({ ...prev, order_id: undefined }));
          }}
          placeholder="Ví dụ: XK-2026-0089"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          id="order-driver-input"
          label="Tài xế phụ trách (assigned_driver_id)"
          error={fieldErrors.assigned_driver_id}
          required
        >
          {drivers.length > 0 ? (
            <Select
              id="order-driver-input"
              value={assignedDriverId}
              invalid={Boolean(fieldErrors.assigned_driver_id)}
              onChange={(e) => {
                setAssignedDriverId(e.target.value);
                if (fieldErrors.assigned_driver_id) {
                  setFieldErrors((prev) => ({ ...prev, assigned_driver_id: undefined }));
                }
              }}
            >
              <option value="">-- Chọn tài xế --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} {d.employee_code ? `(${d.employee_code})` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="order-driver-input"
              value={assignedDriverId}
              invalid={Boolean(fieldErrors.assigned_driver_id)}
              onChange={(e) => {
                setAssignedDriverId(e.target.value);
                if (fieldErrors.assigned_driver_id) {
                  setFieldErrors((prev) => ({ ...prev, assigned_driver_id: undefined }));
                }
              }}
              placeholder="UUID tài xế..."
            />
          )}
        </Field>

        <Field
          id="order-vehicle-input"
          label="Phương tiện vận chuyển (assigned_vehicle_id)"
          error={fieldErrors.assigned_vehicle_id}
          required
        >
          {vehicles.length > 0 ? (
            <Select
              id="order-vehicle-input"
              value={assignedVehicleId}
              invalid={Boolean(fieldErrors.assigned_vehicle_id)}
              onChange={(e) => {
                setAssignedVehicleId(e.target.value);
                if (fieldErrors.assigned_vehicle_id) {
                  setFieldErrors((prev) => ({ ...prev, assigned_vehicle_id: undefined }));
                }
              }}
            >
              <option value="">-- Chọn phương tiện --</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.vehicle_type})
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="order-vehicle-input"
              value={assignedVehicleId}
              invalid={Boolean(fieldErrors.assigned_vehicle_id)}
              onChange={(e) => {
                setAssignedVehicleId(e.target.value);
                if (fieldErrors.assigned_vehicle_id) {
                  setFieldErrors((prev) => ({ ...prev, assigned_vehicle_id: undefined }));
                }
              }}
              placeholder="UUID phương tiện..."
            />
          )}
        </Field>

        <Field
          id="order-valid-from"
          label="Hiệu lực từ ngày"
          error={fieldErrors.valid_from}
          required
        >
          <Input
            id="order-valid-from"
            type="date"
            value={toDateInputValue(validFrom)}
            invalid={Boolean(fieldErrors.valid_from)}
            onChange={(e) => {
              setValidFrom(fromDateInputValue(e.target.value, false));
              if (fieldErrors.valid_from) {
                setFieldErrors((prev) => ({ ...prev, valid_from: undefined }));
              }
            }}
          />
        </Field>

        <Field
          id="order-valid-until"
          label="Hiệu lực đến ngày"
          error={fieldErrors.valid_until}
          required
        >
          <Input
            id="order-valid-until"
            type="date"
            value={toDateInputValue(validUntil)}
            invalid={Boolean(fieldErrors.valid_until)}
            onChange={(e) => {
              setValidUntil(fromDateInputValue(e.target.value, true));
              if (fieldErrors.valid_until) {
                setFieldErrors((prev) => ({ ...prev, valid_until: undefined }));
              }
            }}
          />
        </Field>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
            Danh mục hàng hóa xuất kho
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<PlusIcon size={14} />}
            onClick={addCargoRow}
          >
            Thêm mặt hàng
          </Button>
        </div>

        <div className="space-y-2">
          {cargoItems.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6">
                <Input
                  aria-label={`Tên hàng hóa ${idx + 1}`}
                  value={row.name}
                  onChange={(e) => updateCargoRow(idx, 'name', e.target.value)}
                  placeholder="Tên mặt hàng (VD: Pin Lithium)..."
                />
              </div>
              <div className="col-span-3">
                <Input
                  aria-label={`Số lượng ${idx + 1}`}
                  value={row.quantity}
                  onChange={(e) => updateCargoRow(idx, 'quantity', e.target.value)}
                  placeholder="Số lượng"
                />
              </div>
              <div className="col-span-2">
                <Input
                  aria-label={`Đơn vị ${idx + 1}`}
                  value={row.unit}
                  onChange={(e) => updateCargoRow(idx, 'unit', e.target.value)}
                  placeholder="ĐVT"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {cargoItems.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Xóa mặt hàng ${idx + 1}`}
                    onClick={() => removeCargoRow(idx)}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
