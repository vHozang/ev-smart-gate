import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';

/**
 * 5 nhóm cấu hình thiết bị thực tế trên máy chủ (M12 / FE-G08).
 */
export const deviceConfigGroupSchema = z.enum([
  'cameras',
  'models',
  'barriers',
  'readers',
  'bindings',
]);
export type DeviceConfigGroup = z.infer<typeof deviceConfigGroupSchema>;

export const deviceApplyStatusSchema = z.enum([
  'SAVED',
  'DRIFTED',
  'APPLIED',
  'APPLYING',
  'FAILED',
  'OUTCOME_UNKNOWN',
]);
export type DeviceConfigApplyStatus = z.infer<typeof deviceApplyStatusSchema>;

const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|private_key|api_key|credential|passphrase|client_secret)/i;

/**
 * Kiểm tra xem tên trường có phải thông tin bí mật không được phép lộ trên UI.
 */
export function isSecretSettingKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key.trim());
}

/**
 * Làm sạch bản ghi settings hoặc redacted_changes để đảm bảo không lộ secrets ở runtime.
 */
export function sanitizeDeviceSettingsRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSecretSettingKey(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDeviceSettingsRecord(value as Record<string, unknown>);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

const rawDeviceConfigViewSchema = z
  .object({
    id: z.uuid(),
    group: deviceConfigGroupSchema,
    name: z.string().min(1).max(160),
    access_point_ref: z.string().nullable().optional(),
    lane_ref: z.string().nullable().optional(),
    direction: z.enum(['ENTRY', 'EXIT']).nullable().optional(),
    saved_version: z.number().int().min(1).optional(),
    desired_version: z.number().int().min(1).optional(),
    applied_version: z.number().int().min(1).nullable(),
    status: deviceApplyStatusSchema.optional(),
    apply_status: deviceApplyStatusSchema.optional(),
    restart_required: z.boolean(),
    settings: z.record(z.string(), z.unknown()).default({}),
    updated_at: z.string(),
  })
  .strict()
  .refine(
    (val) => typeof val.saved_version === 'number' || typeof val.desired_version === 'number',
    {
      message: 'Bản ghi cấu hình thiết bị phải có saved_version hoặc desired_version hợp lệ.',
    },
  );

export const deviceConfigViewSchema = rawDeviceConfigViewSchema.transform((raw) => {
  const version = raw.desired_version ?? raw.saved_version ?? 1;
  const applyStatus = raw.apply_status ?? raw.status ?? 'SAVED';
  return {
    id: raw.id,
    group: raw.group,
    name: raw.name,
    access_point_ref: raw.access_point_ref ?? null,
    lane_ref: raw.lane_ref ?? null,
    direction: raw.direction ?? null,
    saved_version: raw.saved_version ?? version,
    desired_version: version,
    applied_version: raw.applied_version,
    status: applyStatus,
    apply_status: applyStatus,
    restart_required: raw.restart_required,
    settings: sanitizeDeviceSettingsRecord(raw.settings),
    updated_at: raw.updated_at,
  };
});

export type DeviceConfigView = z.infer<typeof deviceConfigViewSchema>;

export const deviceConfigCursorPageSchema = z
  .object({
    items: z.array(deviceConfigViewSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
    limit: z.number().int().min(0),
    coverage: z.enum(['complete', 'partial']).optional(),
    total: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export type DeviceConfigCursorPage = z.infer<typeof deviceConfigCursorPageSchema>;

export const deviceConfigCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên cấu hình thiết bị không được để trống.').max(160),
    access_point_ref: z.string().trim().max(128).nullable().optional(),
    lane_ref: z.string().trim().max(128).nullable().optional(),
    direction: z.enum(['ENTRY', 'EXIT']).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type DeviceConfigCreateInput = z.infer<typeof deviceConfigCreateSchema>;

export const deviceConfigPatchSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do cập nhật cấu hình phải có ít nhất 3 ký tự.').max(500),
    name: z.string().trim().min(1).max(160).optional(),
    settings: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type DeviceConfigPatchInput = z.infer<typeof deviceConfigPatchSchema>;

export const deviceValidationResultSchema = z
  .object({
    config_id: z.uuid(),
    group: deviceConfigGroupSchema,
    valid: z.boolean(),
    saved_version: z.number().int().min(1),
    warnings: z.array(z.string()),
    checked_at: z.string(),
  })
  .strict()
  .transform((val) => ({
    ...val,
    desired_version: val.saved_version,
  }));

export type DeviceValidationResult = z.infer<typeof deviceValidationResultSchema>;

export const deviceOperationStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'OUTCOME_UNKNOWN',
]);
export type DeviceOperationStatus = z.infer<typeof deviceOperationStatusSchema>;

export const deviceOperationViewSchema = z
  .object({
    operation_id: z.uuid(),
    config_id: z.uuid(),
    group: deviceConfigGroupSchema,
    kind: z.enum(['CONNECTIVITY_TEST', 'APPLY_CONFIG']),
    status: deviceOperationStatusSchema,
    saved_version: z.number().int().min(1),
    applied_version: z.number().int().min(1).nullable(),
    restart_required: z.boolean(),
    message: z.string(),
    created_at: z.string(),
    completed_at: z.string().nullable(),
  })
  .strict()
  .transform((op) => ({
    ...op,
    desired_version: op.saved_version,
  }));

export type DeviceOperationView = z.infer<typeof deviceOperationViewSchema>;

export const deviceApplyRequestSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z
      .string()
      .trim()
      .min(3, 'Lý do áp dụng cấu hình xuống thiết bị phải có ít nhất 3 ký tự.')
      .max(500),
  })
  .strict();

export type DeviceApplyRequestInput = z.infer<typeof deviceApplyRequestSchema>;

export const deviceAuditLogViewSchema = z
  .object({
    id: z.uuid(),
    actor_id: z.uuid().nullable(),
    action: z.string().min(1),
    target_type: z.string().min(1),
    target_id: z.string().nullable(),
    occurred_at: z.string(),
    request_id: z.string().nullable().optional(),
    outcome: z.enum(['SUCCEEDED', 'FAILED']),
    redacted_changes: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .transform((item) => ({
    ...item,
    request_id: item.request_id ?? null,
    redacted_changes: sanitizeDeviceSettingsRecord(item.redacted_changes),
  }));

export type DeviceAuditLogView = z.infer<typeof deviceAuditLogViewSchema>;

export const deviceAuditLogCursorPageSchema = z
  .object({
    items: z.array(deviceAuditLogViewSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
    limit: z.number().int().min(0),
  })
  .strict();

export type DeviceAuditLogCursorPage = z.infer<typeof deviceAuditLogCursorPageSchema>;

export interface DeviceAuditLogFilterParams {
  cursor?: string | null;
  limit?: number;
  target_type?: DeviceConfigGroup | '';
  outcome?: 'SUCCEEDED' | 'FAILED' | '';
  action?: string;
}

export const deviceSettingsQueryKeys = {
  all: ['device-settings'] as const,
  group: (group: DeviceConfigGroup) => ['device-settings', 'group', group] as const,
  operation: (operationId: string) => ['device-settings', 'operation', operationId] as const,
  auditLogs: (filters?: DeviceAuditLogFilterParams) =>
    ['device-settings', 'audit-logs', filters ?? {}] as const,
};

function buildIdempotencyHeaders(idempotencyKey?: string): Record<string, string> {
  const key =
    idempotencyKey?.trim() ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `devcfg-${Date.now()}`);
  return { 'Idempotency-Key': key };
}

/**
 * Task 12.5: Đọc danh sách cấu hình thiết bị thực tế theo nhóm (`GET /api/v1/admin/device-settings/{group}`).
 */
export async function listDeviceConfigs(
  group: DeviceConfigGroup,
  signal?: AbortSignal,
): Promise<DeviceConfigCursorPage> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const response = await http.get<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}`,
    { signal },
  );
  return parsePayload(
    deviceConfigCursorPageSchema,
    response.data,
    response.headers['x-request-id'],
  );
}

/**
 * Task 12.6: Tạo mới bản ghi cấu hình thiết bị (`POST /api/v1/admin/device-settings/{group}`).
 */
export async function createDeviceConfig(
  group: DeviceConfigGroup,
  input: DeviceConfigCreateInput,
  idempotencyKey?: string,
): Promise<DeviceConfigView> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const validated = deviceConfigCreateSchema.parse(input);
  const sanitizedSettings = sanitizeDeviceSettingsRecord(validated.settings);
  const payload: Record<string, unknown> = {
    ...sanitizedSettings,
    name: validated.name,
  };
  if (validated.access_point_ref !== undefined) {
    payload.access_point_ref = validated.access_point_ref;
  }
  if (validated.lane_ref !== undefined) {
    payload.lane_ref = validated.lane_ref;
  }
  if (validated.direction !== undefined) {
    payload.direction = validated.direction;
  }

  const response = await http.post<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}`,
    payload,
    { headers: buildIdempotencyHeaders(idempotencyKey) },
  );
  return parsePayload(deviceConfigViewSchema, response.data, response.headers['x-request-id']);
}

/**
 * Task 12.6: Cập nhật bản ghi cấu hình thiết bị có kiểm soát phiên bản (`PATCH /api/v1/admin/device-settings/{group}/{config_id}`).
 */
export async function updateDeviceConfig(
  group: DeviceConfigGroup,
  configId: string,
  input: DeviceConfigPatchInput,
  idempotencyKey?: string,
): Promise<DeviceConfigView> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const validated = deviceConfigPatchSchema.parse(input);
  const payload = {
    expected_version: validated.expected_version,
    reason: validated.reason,
    ...(validated.name ? { name: validated.name } : {}),
    settings: sanitizeDeviceSettingsRecord(validated.settings),
  };

  const response = await http.patch<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}/${encodeURIComponent(configId.trim())}`,
    payload,
    { headers: buildIdempotencyHeaders(idempotencyKey) },
  );
  return parsePayload(deviceConfigViewSchema, response.data, response.headers['x-request-id']);
}

/**
 * Xóa bản ghi cấu hình thiết bị (`DELETE /api/v1/admin/device-settings/{group}/{config_id}`).
 */
export async function deleteDeviceConfig(
  group: DeviceConfigGroup,
  configId: string,
): Promise<{ message: string }> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const response = await http.delete<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}/${encodeURIComponent(configId.trim())}`,
  );
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}

/**
 * Task 12.6: Xác thực cấu hình đã lưu trên máy chủ (`POST /api/v1/admin/device-settings/{group}/{config_id}/validate`).
 */
export async function validateDeviceConfig(
  group: DeviceConfigGroup,
  configId: string,
): Promise<DeviceValidationResult> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const response = await http.post<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}/${encodeURIComponent(configId.trim())}/validate`,
  );
  return parsePayload(
    deviceValidationResultSchema,
    response.data,
    response.headers['x-request-id'],
  );
}

/**
 * Task 12.6: Kiểm tra kết nối thiết bị chỉ đọc (`POST /api/v1/admin/device-settings/{group}/{config_id}/connectivity-test`).
 */
export async function testDeviceConnectivity(
  group: DeviceConfigGroup,
  configId: string,
): Promise<DeviceOperationView> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const response = await http.post<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}/${encodeURIComponent(configId.trim())}/connectivity-test`,
  );
  return parsePayload(deviceOperationViewSchema, response.data, response.headers['x-request-id']);
}

/**
 * Task 12.6: Áp dụng cấu hình đã lưu xuống thiết bị (`POST /api/v1/admin/device-settings/{group}/{config_id}/apply`).
 */
export async function applyDeviceConfig(
  group: DeviceConfigGroup,
  configId: string,
  input: DeviceApplyRequestInput,
  idempotencyKey?: string,
): Promise<DeviceOperationView> {
  const validatedGroup = deviceConfigGroupSchema.parse(group);
  const validated = deviceApplyRequestSchema.parse(input);
  const response = await http.post<unknown>(
    `/api/v1/admin/device-settings/${encodeURIComponent(validatedGroup)}/${encodeURIComponent(configId.trim())}/apply`,
    validated,
    { headers: buildIdempotencyHeaders(idempotencyKey) },
  );
  return parsePayload(deviceOperationViewSchema, response.data, response.headers['x-request-id']);
}

/**
 * Task 12.6: Đối soát trạng thái tác vụ thiết bị khi timeout hoặc OUTCOME_UNKNOWN (`GET /api/v1/admin/device-settings/operations/{operation_id}`).
 */
export async function reconcileDeviceOperation(
  operationId: string,
  signal?: AbortSignal,
): Promise<DeviceOperationView> {
  const response = await http.get<unknown>(
    `/api/v1/admin/device-settings/operations/${encodeURIComponent(operationId.trim())}`,
    { signal },
  );
  return parsePayload(deviceOperationViewSchema, response.data, response.headers['x-request-id']);
}

/**
 * Task 12.7: Đọc nhật ký kiểm toán cấu hình thiết bị (`GET /api/v1/admin/device-settings/audit-logs`).
 */
export async function listDeviceAuditLogs(
  filters: DeviceAuditLogFilterParams = {},
  signal?: AbortSignal,
): Promise<DeviceAuditLogCursorPage> {
  const params: Record<string, string | number> = {
    limit: filters.limit ?? 50,
  };
  if (filters.cursor) {
    params.cursor = filters.cursor;
  }

  const response = await http.get<unknown>('/api/v1/admin/device-settings/audit-logs', {
    params,
    signal,
  });
  const page = parsePayload(
    deviceAuditLogCursorPageSchema,
    response.data,
    response.headers['x-request-id'],
  );

  const filteredItems = page.items.filter((item) => {
    if (filters.target_type && item.target_type !== filters.target_type) {
      return false;
    }
    if (filters.outcome && item.outcome !== filters.outcome) {
      return false;
    }
    if (
      filters.action?.trim() &&
      !item.action.toLowerCase().includes(filters.action.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return {
    ...page,
    items: filteredItems,
  };
}

/**
 * TanStack Query Hooks cho cấu hình thiết bị (Tasks 12.5–12.7).
 */
export function useDeviceConfigsQuery(group: DeviceConfigGroup, enabled = true) {
  return useQuery({
    queryKey: deviceSettingsQueryKeys.group(group),
    queryFn: ({ signal }) => listDeviceConfigs(group, signal),
    enabled,
  });
}

export function useDeviceAuditLogsQuery(filters: DeviceAuditLogFilterParams = {}, enabled = true) {
  return useQuery({
    queryKey: deviceSettingsQueryKeys.auditLogs(filters),
    queryFn: ({ signal }) => listDeviceAuditLogs(filters, signal),
    enabled,
  });
}

export function useDeviceOperationQuery(operationId: string | null, enabled = false) {
  return useQuery({
    queryKey: deviceSettingsQueryKeys.operation(operationId ?? ''),
    queryFn: ({ signal }) => reconcileDeviceOperation(operationId ?? '', signal),
    enabled: Boolean(operationId && enabled),
  });
}

export function useCreateDeviceConfigMutation(group: DeviceConfigGroup) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { input: DeviceConfigCreateInput; idempotencyKey?: string }) =>
      createDeviceConfig(group, args.input, args.idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deviceSettingsQueryKeys.group(group) });
      await queryClient.invalidateQueries({ queryKey: ['device-settings', 'audit-logs'] });
    },
  });
}

export function useUpdateDeviceConfigMutation(group: DeviceConfigGroup) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      configId: string;
      input: DeviceConfigPatchInput;
      idempotencyKey?: string;
    }) => updateDeviceConfig(group, args.configId, args.input, args.idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deviceSettingsQueryKeys.group(group) });
      await queryClient.invalidateQueries({ queryKey: ['device-settings', 'audit-logs'] });
    },
  });
}

export function useValidateDeviceConfigMutation(group: DeviceConfigGroup) {
  return useMutation({
    mutationFn: (configId: string) => validateDeviceConfig(group, configId),
  });
}

export function useConnectivityTestMutation(group: DeviceConfigGroup) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configId: string) => testDeviceConnectivity(group, configId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-settings', 'audit-logs'] });
    },
  });
}

export function useApplyDeviceConfigMutation(group: DeviceConfigGroup) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      configId: string;
      input: DeviceApplyRequestInput;
      idempotencyKey?: string;
    }) => applyDeviceConfig(group, args.configId, args.input, args.idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deviceSettingsQueryKeys.group(group) });
      await queryClient.invalidateQueries({ queryKey: ['device-settings', 'audit-logs'] });
    },
  });
}
