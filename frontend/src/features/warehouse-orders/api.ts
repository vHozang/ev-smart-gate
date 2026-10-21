import { z } from 'zod';
import { ApiError, http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type WarehouseOrder = components['schemas']['OrderOutput'];
export type OrderStatus = components['schemas']['OrderStatus'];
export type CreateOrderInput = components['schemas']['CreateOrderRequest'];
export type UpdateOrderInput = components['schemas']['UpdateOrderRequest'];
export type CargoState = components['schemas']['CargoState'];
export type DockStatus = components['schemas']['DockStatus'];
export type DockSession = components['schemas']['DockOutput'];
export type DockSessionDetail = components['schemas']['DockDetailOutput'];
export type DockCaptureItem = components['schemas']['DockCaptureOutput'];
export type FinalizeDockInput = components['schemas']['FinalizeDockRequest'];
export type ExitSlipOutput = components['schemas']['SlipOutput'];

export const cargoStateValues = ['EMPTY', 'LOADING', 'LOADED', 'ANOMALY', 'UNKNOWN'] as const;
export const dockStatusValues = ['ACTIVE', 'REVIEW_REQUIRED', 'APPROVED', 'CANCELLED'] as const;

export const orderOutputSchema: z.ZodType<WarehouseOrder> = z
  .object({
    id: z.uuid(),
    order_id: z.string(),
    assigned_driver_id: z.uuid(),
    assigned_vehicle_id: z.uuid(),
    cargo_metadata: z.array(z.record(z.string(), z.unknown())),
    status: z.enum([
      'PENDING',
      'LOADING',
      'READY_FOR_EXIT',
      'SLIP_ISSUED',
      'COMPLETED',
      'CANCELLED',
    ]),
    valid_from: z.string(),
    valid_until: z.string(),
    dock_session_id: z.string().nullable(),
    slip_version: z.number().int(),
    slip_refs: z.record(z.string(), z.string()),
  })
  .strict();

export const orderCreateSchema = z
  .object({
    order_id: z
      .string()
      .trim()
      .min(3, 'Mã đơn hàng phải có tối thiểu 3 ký tự.')
      .max(64, 'Mã đơn hàng tối đa 64 ký tự.'),
    assigned_driver_id: z.uuid('Vui lòng chọn hoặc nhập UUID tài xế phụ trách hợp lệ.'),
    assigned_vehicle_id: z.uuid('Vui lòng chọn hoặc nhập UUID phương tiện hợp lệ.'),
    cargo_metadata: z.array(z.record(z.string(), z.unknown())).optional(),
    valid_from: z.string().min(1, 'Vui lòng chọn thời điểm bắt đầu hiệu lực.'),
    valid_until: z.string().min(1, 'Vui lòng chọn thời điểm kết thúc hiệu lực.'),
  })
  .strict()
  .refine((data) => Date.parse(data.valid_until) > Date.parse(data.valid_from), {
    message: 'Thời điểm kết thúc hiệu lực phải sau thời điểm bắt đầu.',
    path: ['valid_until'],
  });

export const orderUpdateSchema = z
  .object({
    assigned_driver_id: z.uuid('UUID tài xế không hợp lệ.').nullable().optional(),
    assigned_vehicle_id: z.uuid('UUID phương tiện không hợp lệ.').nullable().optional(),
    cargo_metadata: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    valid_from: z.string().min(1).nullable().optional(),
    valid_until: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.valid_from && data.valid_until) {
        return Date.parse(data.valid_until) > Date.parse(data.valid_from);
      }
      return true;
    },
    {
      message: 'Thời điểm kết thúc hiệu lực phải sau thời điểm bắt đầu.',
      path: ['valid_until'],
    },
  );

const cargoDetectionSchema = z
  .object({
    class_name: z.string(),
    confidence: z.number(),
    bounding_box: z.record(z.string(), z.number()),
    model_version: z.string(),
  })
  .strict();

const dockCaptureSchema: z.ZodType<DockCaptureItem> = z
  .object({
    index: z.number().int().nonnegative(),
    captured_at: z.string(),
    cargo_state: z.enum(cargoStateValues),
    detections: z.array(cargoDetectionSchema),
  })
  .strict();

export const dockOutputSchema: z.ZodType<DockSession> = z
  .object({
    id: z.uuid(),
    order_id: z.string(),
    entry_gate_log_id: z.string(),
    status: z.enum(dockStatusValues),
    current_cargo_state: z.enum(cargoStateValues),
    capture_count: z.number().int().nonnegative(),
    operator_note: z.string().nullable(),
    completed_at: z.string().nullable(),
  })
  .strict();

export const dockDetailOutputSchema: z.ZodType<DockSessionDetail> = z
  .object({
    id: z.uuid(),
    order_id: z.string(),
    entry_gate_log_id: z.string(),
    status: z.enum(dockStatusValues),
    current_cargo_state: z.enum(cargoStateValues),
    capture_count: z.number().int().nonnegative(),
    operator_note: z.string().nullable(),
    completed_at: z.string().nullable(),
    captures: z.array(dockCaptureSchema),
  })
  .strict();

export const finalizeDockSchema = z
  .object({
    operator_note: z
      .string()
      .trim()
      .min(3, 'Vui lòng nhập ghi chú xác nhận kiểm hàng tối thiểu 3 ký tự.')
      .max(500, 'Ghi chú tối đa 500 ký tự.'),
    final_cargo_state: z.enum(cargoStateValues),
  })
  .strict();

export const slipOutputSchema: z.ZodType<ExitSlipOutput> = z
  .object({
    order_id: z.string(),
    slip_version: z.number().int(),
    expires_at: z.string(),
    refs: z.record(z.string(), z.string()),
  })
  .strict();

export async function listOrders(signal?: AbortSignal): Promise<WarehouseOrder[]> {
  const response = await http.get<unknown>('/api/v1/warehouse/orders', { signal });
  return parsePayload(z.array(orderOutputSchema), response.data, response.headers['x-request-id']);
}

export async function getOrder(orderId: string, signal?: AbortSignal): Promise<WarehouseOrder> {
  const response = await http.get<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}`,
    { signal },
  );
  return parsePayload(orderOutputSchema, response.data, response.headers['x-request-id']);
}

export async function createOrder(input: CreateOrderInput): Promise<WarehouseOrder> {
  const validated = orderCreateSchema.parse(input);
  const response = await http.post<unknown>('/api/v1/warehouse/orders', validated);
  return parsePayload(orderOutputSchema, response.data, response.headers['x-request-id']);
}

export async function updateOrder(
  orderId: string,
  input: UpdateOrderInput,
): Promise<WarehouseOrder> {
  const validated = orderUpdateSchema.parse(input);
  const response = await http.patch<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}`,
    validated,
  );
  return parsePayload(orderOutputSchema, response.data, response.headers['x-request-id']);
}

export async function cancelOrder(orderId: string): Promise<WarehouseOrder> {
  const response = await http.delete<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}`,
  );
  return parsePayload(orderOutputSchema, response.data, response.headers['x-request-id']);
}

export async function deleteOrderPermanent(orderId: string): Promise<{ message: string }> {
  const response = await http.delete<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/permanent`,
  );
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function startDockSession(orderId: string): Promise<DockSession> {
  const response = await http.post<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/dock-sessions`,
  );
  return parsePayload(dockOutputSchema, response.data, response.headers['x-request-id']);
}

export async function listDockSessions(
  limit = 50,
  signal?: AbortSignal,
): Promise<DockSessionDetail[]> {
  const response = await http.get<unknown>('/api/v1/warehouse/dock-sessions', {
    params: { limit },
    signal,
  });
  return parsePayload(
    z.array(dockDetailOutputSchema),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function getDockSession(
  inspectionId: string,
  signal?: AbortSignal,
): Promise<DockSessionDetail> {
  const response = await http.get<unknown>(
    `/api/v1/warehouse/dock-sessions/${encodeURIComponent(inspectionId)}`,
    { signal },
  );
  return parsePayload(dockDetailOutputSchema, response.data, response.headers['x-request-id']);
}

export async function captureDockSession(
  inspectionId: string,
  input: { image: File; cargo_state?: CargoState | null },
): Promise<DockSession> {
  const form = new FormData();
  form.append('image', input.image);
  if (input.cargo_state) {
    form.append('cargo_state', input.cargo_state);
  }
  const response = await http.post<unknown>(
    `/api/v1/warehouse/dock-sessions/${encodeURIComponent(inspectionId)}/captures`,
    form,
  );
  return parsePayload(dockOutputSchema, response.data, response.headers['x-request-id']);
}

export async function fetchDockCaptureBlob(
  inspectionId: string,
  captureIndex: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!Number.isInteger(captureIndex) || captureIndex < 0) {
    throw new ApiError('VALIDATION_ERROR', 'Chỉ số ảnh chụp kiểm hàng không hợp lệ.', 400);
  }
  const response = await http.get<Blob>(
    `/api/v1/warehouse/dock-sessions/${encodeURIComponent(inspectionId)}/captures/${captureIndex}/image`,
    {
      responseType: 'blob',
      signal,
    },
  );
  const blob = response.data;
  const contentType = String(response.headers['content-type'] || blob?.type || '').toLowerCase();
  if (!(blob instanceof Blob) || (contentType && !contentType.startsWith('image/'))) {
    throw new ApiError(
      'CONTRACT_INVALID',
      'Dữ liệu ảnh kiểm hàng trả về không phải tệp hình ảnh hợp lệ.',
      502,
      response.headers['x-request-id'],
    );
  }
  return blob;
}

export async function finalizeDockSession(
  inspectionId: string,
  input: FinalizeDockInput,
): Promise<DockSession> {
  const validated = finalizeDockSchema.parse(input);
  const response = await http.post<unknown>(
    `/api/v1/warehouse/dock-sessions/${encodeURIComponent(inspectionId)}/finalize`,
    validated,
  );
  return parsePayload(dockOutputSchema, response.data, response.headers['x-request-id']);
}

export async function issueExitSlip(orderId: string): Promise<ExitSlipOutput> {
  const response = await http.post<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip`,
  );
  return parsePayload(slipOutputSchema, response.data, response.headers['x-request-id']);
}

export async function reissueExitSlip(orderId: string): Promise<ExitSlipOutput> {
  const response = await http.post<unknown>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip/reissue`,
  );
  return parsePayload(slipOutputSchema, response.data, response.headers['x-request-id']);
}

export async function downloadExitSlipBlob(
  orderId: string,
  artifactType: 'qr' | 'html' | 'pdf',
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await http.get<Blob>(
    `/api/v1/warehouse/orders/${encodeURIComponent(orderId)}/exit-slip/${artifactType}`,
    {
      responseType: 'blob',
      signal,
    },
  );
  if (!(response.data instanceof Blob)) {
    throw new ApiError(
      'CONTRACT_INVALID',
      'Dữ liệu tệp phiếu xuất kho không hợp lệ.',
      502,
      response.headers['x-request-id'],
    );
  }
  return response.data;
}
