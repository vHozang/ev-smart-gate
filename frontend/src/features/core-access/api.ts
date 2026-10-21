import { z } from 'zod';
import { ApiError, http, parsePayload } from '@/shared/api';

export const factorViewSchema = z
  .object({
    factor: z.enum(['card', 'face', 'plate', 'authorization', 'employee', 'grant', 'capture']),
    status: z.enum(['PASSED', 'FAILED', 'NOT_RUN', 'ERROR']),
    reason_code: z.string().nullable(),
    score: z.number().nullable(),
  })
  .strict();

export type FactorView = z.infer<typeof factorViewSchema>;

export const verificationRequestSchema = z
  .object({
    event_id: z
      .string()
      .trim()
      .min(8, 'Mã sự kiện (event_id) phải có tối thiểu 8 ký tự.')
      .max(128, 'Mã sự kiện tối đa 128 ký tự.'),
    gate_id: z.string().trim().min(1, 'Vui lòng chọn cổng/điểm kiểm soát (gate_id).').max(128),
    capture_bundle_id: z.uuid('Mã gói thu nhận (capture_bundle_id) phải là UUID hợp lệ.'),
  })
  .strict();

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;

const verificationFields = {
  operation_id: z.uuid(),
  event_id: z.string().min(1).max(128),
  gate_id: z.string().min(1).max(128),
  access_mode: z.enum(['pedestrian', 'motorcycle', 'car', 'truck']),
  direction: z.enum(['ENTRY', 'EXIT']),
  status: z.enum(['PROCESSING', 'COMPLETED', 'OUTCOME_UNKNOWN']),
  verification_status: z.enum(['PASSED', 'FAILED']).nullable(),
  permit_granted: z.boolean(),
  barrier_status: z.enum(['NOT_REQUESTED', 'PENDING', 'OPENED', 'FAILED', 'UNKNOWN']),
  command_id: z.string().nullable(),
  factors: z.array(factorViewSchema),
  reason_codes: z.array(z.string()),
  received_at: z.string(),
  verification_completed_at: z.string().nullable(),
  command_sent_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
};

export const verificationViewSchema = z.object(verificationFields).strict();
export type VerificationView = z.infer<typeof verificationViewSchema>;

export const captureIngestRequestSchema = z
  .object({
    gate_id: z.string().trim().min(1).max(128),
    direction: z.enum(['ENTRY', 'EXIT']),
    event_id: z.string().trim().min(8).max(128),
    card_uid: z.string().max(128).nullable().optional(),
    face_image_ref: z.string().max(512).nullable().optional(),
    plate_image_ref: z.string().max(512).nullable().optional(),
    observed_plate: z.string().max(32).nullable().optional(),
    vehicle_type: z.enum(['motorcycle', 'car', 'truck', 'unknown']).nullable().optional(),
    evidence_complete: z.boolean().default(true),
    model_versions: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type CaptureIngestRequest = z.infer<typeof captureIngestRequestSchema>;

export const captureViewSchema = z
  .object({
    bundle_id: z.uuid(),
    gate_id: z.string().min(1),
    direction: z.enum(['ENTRY', 'EXIT']),
    event_id: z.string().min(8).max(128),
    received_at: z.string(),
    expires_at: z.string(),
    evidence_complete: z.boolean(),
    status: z.enum(['READY', 'INCOMPLETE', 'EXPIRED', 'CONSUMED']),
    factors: z.array(factorViewSchema),
  })
  .strict();

export type CaptureView = z.infer<typeof captureViewSchema>;

export const personLogViewSchema = z
  .object({
    ...verificationFields,
    id: z.uuid(),
    person_id: z.uuid().nullable(),
    employee_id: z.uuid().nullable(),
    snapshot_count: z.number().int().min(0),
  })
  .strict();

export type PersonLogView = z.infer<typeof personLogViewSchema>;

function cursorPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      next_cursor: z.string().nullable(),
      has_more: z.boolean(),
      coverage: z.enum(['complete', 'partial']),
      total: z.number().int().min(0).nullable(),
    })
    .strict();
}

export const personLogCursorPageSchema = cursorPageSchema(personLogViewSchema);
export type PersonLogCursorPage = z.infer<typeof personLogCursorPageSchema>;

export const employeeViewSchema = z
  .object({
    employee_id: z.uuid(),
    person_id: z.uuid(),
    employee_code: z.string().min(1).max(128),
    is_active: z.boolean(),
    version: z.number().int().min(1),
    created_at: z.string(),
  })
  .strict();

export type EmployeeView = z.infer<typeof employeeViewSchema>;
export type EmployeeRegistryItem = EmployeeView;
export const employeeCursorPageSchema = cursorPageSchema(employeeViewSchema);

export const employeeCreateSchema = z
  .object({
    person_id: z.uuid('Vui lòng chọn hồ sơ nhận diện (person_id) hợp lệ.'),
    employee_code: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập mã nhân viên (employee_code).')
      .max(128, 'Mã nhân viên tối đa 128 ký tự.'),
  })
  .strict();

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeePatchSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do cập nhật phải từ 3 ký tự trở lên.').max(500),
    employee_code: z.string().trim().min(1).max(128).nullable().optional(),
    is_active: z.boolean().nullable().optional(),
  })
  .strict();

export type EmployeePatchInput = z.infer<typeof employeePatchSchema>;
export type EmployeeUpdateInput = EmployeePatchInput;

export const accessPointViewSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    supported_modes: z.array(z.enum(['pedestrian', 'motorcycle', 'car', 'truck'])),
    directions: z.array(z.enum(['ENTRY', 'EXIT'])),
    calibration_version: z.string().nullable(),
    strict_capture_ready: z.boolean(),
  })
  .strict();

export type AccessPointView = z.infer<typeof accessPointViewSchema>;
export const accessPointCursorPageSchema = cursorPageSchema(accessPointViewSchema);

export const grantViewSchema = z
  .object({
    id: z.uuid(),
    employee_id: z.uuid(),
    access_point_ids: z.array(z.string().min(1).max(128)).min(1).max(100),
    directions: z
      .array(z.enum(['ENTRY', 'EXIT']))
      .min(1)
      .max(2),
    valid_from: z.string(),
    valid_until: z.string(),
    reason: z.string().min(3).max(500),
    status: z.enum(['ACTIVE', 'REVOKED']),
    version: z.number().int().min(1),
  })
  .strict();

export type GrantView = z.infer<typeof grantViewSchema>;
export const grantCursorPageSchema = cursorPageSchema(grantViewSchema);

export const grantCreateSchema = z
  .object({
    employee_id: z.uuid('Vui lòng chọn nhân viên được cấp quyền.'),
    access_point_ids: z
      .array(z.string().min(1).max(128))
      .min(1, 'Chọn ít nhất 1 điểm kiểm soát (access_point_id).')
      .max(100),
    directions: z
      .array(z.enum(['ENTRY', 'EXIT']))
      .min(1, 'Chọn ít nhất 1 chiều di chuyển (ENTRY/EXIT).')
      .max(2),
    valid_from: z.string().min(1, 'Vui lòng nhập thời điểm bắt đầu hiệu lực.'),
    valid_until: z.string().min(1, 'Vui lòng nhập thời điểm kết thúc hiệu lực.'),
    reason: z.string().trim().min(3, 'Lý do cấp quyền phải từ 3 ký tự trở lên.').max(500),
  })
  .strict()
  .refine((d) => Date.parse(d.valid_until) > Date.parse(d.valid_from), {
    message: 'Thời điểm kết thúc hiệu lực phải sau thời điểm bắt đầu.',
    path: ['valid_until'],
  });

export type GrantCreateInput = z.infer<typeof grantCreateSchema>;

export const vehicleTypeViewSchema = z
  .object({
    code: z.enum(['motorcycle', 'car', 'truck', 'unknown']),
    label: z.string().min(1).max(128),
    legacy_values: z.array(z.string()),
    eligible_for_verification: z.boolean(),
  })
  .strict();

export type VehicleTypeView = z.infer<typeof vehicleTypeViewSchema>;
export const vehicleTypeCursorPageSchema = cursorPageSchema(vehicleTypeViewSchema);

const messageSchema = z.object({ message: z.string() }).strict();

/**
 * Invariant DOD-FE-AI-01 & INT-04:
 * Chỉ hiển thị trạng thái "Đã mở barrier (OPENED)" khi cả 3 điều kiện đều thỏa mãn:
 * 1. verification_status === 'PASSED'
 * 2. permit_granted === true
 * 3. barrier_status === 'OPENED'
 */
export function isBarrierConfirmedOpen(
  verification: Pick<VerificationView, 'verification_status' | 'permit_granted' | 'barrier_status'>,
): boolean {
  return (
    verification.verification_status === 'PASSED' &&
    verification.permit_granted === true &&
    verification.barrier_status === 'OPENED'
  );
}

/**
 * Giải quyết mã loại xe (kể cả giá trị legacy như sedan -> car hoặc unknown)
 * dựa trên danh mục VehicleTypeView chuẩn.
 */
export function resolveVehicleTypeCatalogItem(
  rawType: string,
  catalog: readonly VehicleTypeView[],
): {
  code: VehicleTypeView['code'];
  label: string;
  eligible_for_verification: boolean;
  isLegacyAlias: boolean;
} {
  const normalized = rawType.trim().toLowerCase();
  const direct = catalog.find((item) => item.code === normalized);
  if (direct) {
    return {
      code: direct.code,
      label: direct.label,
      eligible_for_verification: direct.eligible_for_verification,
      isLegacyAlias: false,
    };
  }
  const legacyMatch = catalog.find((item) =>
    item.legacy_values.some((alias) => alias.toLowerCase() === normalized),
  );
  if (legacyMatch) {
    return {
      code: legacyMatch.code,
      label: `${legacyMatch.label} (ánh xạ từ "${rawType}")`,
      eligible_for_verification: legacyMatch.eligible_for_verification,
      isLegacyAlias: true,
    };
  }
  return {
    code: 'unknown',
    label: `Chưa xác định (${rawType || 'unknown'})`,
    eligible_for_verification: false,
    isLegacyAlias: false,
  };
}

export async function listVehicleTypes(signal?: AbortSignal) {
  const response = await http.get<unknown>('/api/v1/vehicle-types', { signal });
  return parsePayload(vehicleTypeCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function listAccessPoints(signal?: AbortSignal) {
  const response = await http.get<unknown>('/api/v1/access-points', { signal });
  return parsePayload(accessPointCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function listEmployees(
  filters: { cursor?: string | null; limit?: number; search?: string; is_active?: boolean } = {},
  signal?: AbortSignal,
) {
  const params: Record<string, string | number | boolean> = {};
  if (filters.cursor) params.cursor = filters.cursor;
  if (filters.limit) params.limit = filters.limit;
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (typeof filters.is_active === 'boolean') params.is_active = filters.is_active;

  const response = await http.get<unknown>('/api/v1/employees', { params, signal });
  return parsePayload(employeeCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function createEmployee(
  input: EmployeeCreateInput,
  idempotencyKey: string,
): Promise<EmployeeView> {
  const validated = employeeCreateSchema.parse(input);
  const response = await http.post<unknown>('/api/v1/employees', validated, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return parsePayload(employeeViewSchema, response.data, response.headers['x-request-id']);
}

export async function updateEmployee(
  employeeId: string,
  input: EmployeePatchInput,
): Promise<EmployeeView> {
  const validated = employeePatchSchema.parse(input);
  const response = await http.patch<unknown>(
    `/api/v1/employees/${encodeURIComponent(employeeId)}`,
    validated,
  );
  return parsePayload(employeeViewSchema, response.data, response.headers['x-request-id']);
}

export async function listPedestrianGrants(
  filters: {
    cursor?: string | null;
    limit?: number;
    status?: 'ACTIVE' | 'REVOKED' | '';
    employee_id?: string;
    access_point_id?: string;
    direction?: 'ENTRY' | 'EXIT' | '';
  } = {},
  signal?: AbortSignal,
) {
  const params: Record<string, string | number> = {};
  if (filters.cursor) params.cursor = filters.cursor;
  if (filters.limit) params.limit = filters.limit;
  if (filters.status) params.status = filters.status;
  if (filters.employee_id?.trim()) params.employee_id = filters.employee_id.trim();
  if (filters.access_point_id?.trim()) params.access_point_id = filters.access_point_id.trim();
  if (filters.direction) params.direction = filters.direction;

  const response = await http.get<unknown>('/api/v1/pedestrian-access-grants', {
    params,
    signal,
  });
  return parsePayload(grantCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function createPedestrianGrant(input: GrantCreateInput): Promise<GrantView> {
  const validated = grantCreateSchema.parse(input);
  const response = await http.post<unknown>('/api/v1/pedestrian-access-grants', validated);
  return parsePayload(grantViewSchema, response.data, response.headers['x-request-id']);
}

export const serverCaptureMetadataSchema = z
  .object({
    schema_version: z.literal('1.0').default('1.0'),
    encounter_id: z.string().trim().min(1).max(128),
    access_point_id: z.string().trim().min(1).max(128),
    lane_id: z.string().trim().min(1).max(128),
    access_mode: z.enum(['pedestrian', 'motorcycle', 'car', 'truck']),
    calibration_version: z.string().trim().min(1).max(128).default('cal-2026.1'),
    face_captured_at: z.string(),
    plate_captured_at: z.string().nullable().optional(),
    rfid_captured_at: z.string(),
    card_uid: z.string().trim().min(4).max(128),
  })
  .strict();

export type ServerCaptureMetadataInput = z.infer<typeof serverCaptureMetadataSchema>;

export const serverCaptureViewSchema = z
  .object({
    capture_bundle_id: z.uuid(),
    schema_version: z.literal('1.0'),
    encounter_id: z.string(),
    access_point_id: z.string(),
    lane_id: z.string(),
    access_mode: z.enum(['pedestrian', 'motorcycle', 'car', 'truck']),
    received_at: z.string(),
    expires_at: z.string(),
    calibration_version: z.string(),
    face_sha256: z.string(),
    plate_sha256: z.string().nullable(),
  })
  .strict();

export type ServerCaptureView = z.infer<typeof serverCaptureViewSchema>;

export async function createSampleCaptureBundle(input: {
  access_point_id: string;
  access_mode: 'pedestrian' | 'motorcycle' | 'car' | 'truck';
  card_uid?: string;
  faceImageFile?: File | null;
  plateImageFile?: File | null;
}): Promise<ServerCaptureView> {
  const nowIso = new Date().toISOString();
  const payload: ServerCaptureMetadataInput = {
    schema_version: '1.0',
    encounter_id: `ENC-UI-${input.access_mode.toUpperCase()}-${Date.now()}`,
    access_point_id: input.access_point_id.trim() || 'GATE-01',
    lane_id: input.access_mode === 'pedestrian' ? 'LANE-PED-01' : 'LANE-VEH-01',
    access_mode: input.access_mode,
    calibration_version: 'cal-2026.1',
    face_captured_at: nowIso,
    plate_captured_at: input.access_mode === 'pedestrian' ? null : nowIso,
    rfid_captured_at: nowIso,
    card_uid: input.card_uid?.trim() || 'RFID-DEMO-2026',
  };

  if (input.faceImageFile || input.plateImageFile) {
    const formData = new FormData();
    formData.append('metadata', JSON.stringify(payload));
    if (input.faceImageFile) {
      formData.append('face_image', input.faceImageFile);
    }
    if (input.plateImageFile && input.access_mode !== 'pedestrian') {
      formData.append('plate_image', input.plateImageFile);
    }
    const response = await http.post<unknown>('/api/v2/capture-bundles', formData);
    return parsePayload(serverCaptureViewSchema, response.data, response.headers['x-request-id']);
  }

  const response = await http.post<unknown>('/api/v2/capture-bundles', payload);
  return parsePayload(serverCaptureViewSchema, response.data, response.headers['x-request-id']);
}

export async function deleteEmployee(employeeId: string): Promise<string> {
  const response = await http.delete<unknown>(
    `/api/v1/employees/${encodeURIComponent(employeeId)}`,
  );
  const parsed = parsePayload(messageSchema, response.data, response.headers['x-request-id']);
  return parsed.message;
}

export interface GrantPatchInput {
  expected_version: number;
  reason: string;
  access_point_ids?: string[];
  directions?: ('ENTRY' | 'EXIT')[];
  valid_from?: string;
  valid_until?: string;
  status?: 'ACTIVE' | 'REVOKED';
}

export async function updatePedestrianGrant(
  grantId: string,
  input: GrantPatchInput,
): Promise<GrantView> {
  const response = await http.patch<unknown>(
    `/api/v1/pedestrian-access-grants/${encodeURIComponent(grantId)}`,
    input,
  );
  return parsePayload(grantViewSchema, response.data, response.headers['x-request-id']);
}

export async function deletePedestrianGrant(grantId: string): Promise<string> {
  const response = await http.delete<unknown>(
    `/api/v1/pedestrian-access-grants/${encodeURIComponent(grantId)}/permanent`,
  );
  const parsed = parsePayload(messageSchema, response.data, response.headers['x-request-id']);
  return parsed.message;
}

export async function revokePedestrianGrant(
  grantId: string,
  input: { expected_version: number; reason: string },
): Promise<string> {
  const response = await http.delete<unknown>(
    `/api/v1/pedestrian-access-grants/${encodeURIComponent(grantId)}`,
    { data: input },
  );
  const parsed = parsePayload(messageSchema, response.data, response.headers['x-request-id']);
  return parsed.message;
}

export async function ingestCaptureBundle(
  input: CaptureIngestRequest,
  idempotencyKey?: string,
): Promise<CaptureView> {
  const validated = captureIngestRequestSchema.parse(input);
  const headers: Record<string, string> = {};
  if (idempotencyKey?.trim()) {
    headers['Idempotency-Key'] = idempotencyKey.trim();
  }
  const response = await http.post<unknown>('/api/v2/capture-bundles', validated, { headers });
  return parsePayload(captureViewSchema, response.data, response.headers['x-request-id']);
}

export async function verifyVehicleGate(
  direction: 'ENTRY' | 'EXIT',
  input: VerificationRequest,
): Promise<VerificationView> {
  const validated = verificationRequestSchema.parse(input);
  const endpoint =
    direction === 'ENTRY'
      ? '/api/v2/gates/entry/verifications'
      : '/api/v2/gates/exit/verifications';
  const response = await http.post<unknown>(endpoint, validated);
  return parsePayload(verificationViewSchema, response.data, response.headers['x-request-id']);
}

export async function verifyPedestrianGate(
  direction: 'ENTRY' | 'EXIT',
  input: VerificationRequest,
): Promise<VerificationView> {
  const validated = verificationRequestSchema.parse(input);
  const endpoint =
    direction === 'ENTRY'
      ? '/api/v1/pedestrian-gates/entry/verifications'
      : '/api/v1/pedestrian-gates/exit/verifications';
  const response = await http.post<unknown>(endpoint, validated);
  return parsePayload(verificationViewSchema, response.data, response.headers['x-request-id']);
}

export async function reconcileAccessEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<VerificationView> {
  const response = await http.get<unknown>(
    `/api/v2/access-events/${encodeURIComponent(eventId.trim())}`,
    { signal },
  );
  return parsePayload(verificationViewSchema, response.data, response.headers['x-request-id']);
}

export async function listPersonAccessLogs(
  filters: {
    cursor?: string | null;
    limit?: number;
    from?: string;
    to?: string;
    employee_id?: string;
    access_point_id?: string;
    direction?: 'ENTRY' | 'EXIT' | '';
  } = {},
  signal?: AbortSignal,
): Promise<PersonLogCursorPage> {
  const params: Record<string, string | number> = {};
  if (filters.cursor) params.cursor = filters.cursor;
  if (filters.limit) params.limit = filters.limit;
  if (filters.from?.trim()) params.from = filters.from.trim();
  if (filters.to?.trim()) params.to = filters.to.trim();
  if (filters.employee_id?.trim()) params.employee_id = filters.employee_id.trim();
  if (filters.access_point_id?.trim()) params.access_point_id = filters.access_point_id.trim();
  if (filters.direction) params.direction = filters.direction;

  const response = await http.get<unknown>('/api/v1/person-access-logs', {
    params,
    signal,
  });
  return parsePayload(personLogCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function fetchPersonSnapshotBlob(
  accessLogId: string,
  snapshotIndex: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await http.get<Blob>(
    `/api/v1/person-access-logs/${encodeURIComponent(accessLogId)}/snapshots/${snapshotIndex}`,
    {
      responseType: 'blob',
      signal,
      headers: { Accept: 'image/*' },
    },
  );
  const contentType = String(
    response.headers['content-type'] || response.data?.type || '',
  ).toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new ApiError(
      'INVALID_CONTENT_TYPE',
      'Dữ liệu ảnh bằng chứng nhân viên đi bộ không hợp lệ (Content-Type không phải image/*).',
      response.status,
      response.headers['x-request-id'],
    );
  }
  return response.data;
}
