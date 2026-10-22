import { z } from 'zod';
import { ApiError, http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type GateLog = components['schemas']['GateLogOutput'];
export type Direction = components['schemas']['Direction'];
export type VerificationStatus = components['schemas']['VerificationStatus'];
export type BarrierStatus = components['schemas']['BarrierStatus'];
export type PlateMatchType = components['schemas']['PlateMatchType'];

export const gateLogSchema: z.ZodType<GateLog> = z
  .object({
    id: z.uuid(),
    event_id: z.string(),
    direction: z.enum(['ENTRY', 'EXIT']),
    verification_status: z.enum(['PASSED', 'FAILED']),
    observed_plate: z.string(),
    plate_score: z.number(),
    plate_match_type: z.enum(['EXACT', 'FUZZY', 'NONE']),
    face_similarity: z.number(),
    verification_score: z.number(),
    reason_codes: z.array(z.string()),
    driver_id: z.string().nullable(),
    vehicle_id: z.string().nullable(),
    order_id: z.string().nullable(),
    snapshot_count: z.number().int().nonnegative(),
    barrier_status: z.enum(['NOT_REQUESTED', 'PENDING', 'OPENED', 'FAILED']),
    model_versions: z.record(z.string(), z.string()),
    threshold_version: z.string(),
    occurred_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    card_id: z.string().nullable().optional(),
    card_status: z.enum(['ACTIVE', 'BLOCKED', 'LOST', 'REPLACED']).nullable().optional(),
    card_verified: z.boolean().default(false),
    face_verified: z.boolean().default(false),
    plate_verified: z.boolean().default(false),
    authorization_verified: z.boolean().default(false),
    vehicle_type: z.string().nullable().optional(),
  })
  .strict();

export interface GateLogsFilterParams {
  limit?: number;
  direction?: Direction | null;
  verification_status?: VerificationStatus | null;
}

export async function listGateLogs(
  params?: GateLogsFilterParams,
  signal?: AbortSignal,
): Promise<GateLog[]> {
  const queryParams: Record<string, string | number> = {
    limit: params?.limit ?? 100,
  };
  if (params?.direction) {
    queryParams.direction = params.direction;
  }
  if (params?.verification_status) {
    queryParams.verification_status = params.verification_status;
  }

  const response = await http.get<unknown>('/api/v1/gate-logs', {
    params: queryParams,
    signal,
  });
  return parsePayload(z.array(gateLogSchema), response.data, response.headers['x-request-id']);
}

export async function fetchGateSnapshotBlob(
  gateLogId: string,
  snapshotIndex: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!Number.isInteger(snapshotIndex) || snapshotIndex < 0) {
    throw new ApiError('VALIDATION_ERROR', 'Chỉ số ảnh chụp cổng không hợp lệ.', 400);
  }

  const response = await http.get<Blob>(
    `/api/v1/gate-logs/${encodeURIComponent(gateLogId)}/snapshots/${snapshotIndex}`,
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
      'Dữ liệu bằng chứng trả về không phải tệp hình ảnh hợp lệ.',
      502,
      response.headers['x-request-id'],
    );
  }

  return blob;
}
