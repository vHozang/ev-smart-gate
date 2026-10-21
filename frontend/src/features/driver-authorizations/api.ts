import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type DriverVehicleAuthorization = components['schemas']['AuthorizationResponse'];
export type AuthorizationRequest = components['schemas']['AuthorizationRequest'];
export type MessageResponse = components['schemas']['MessageResponse'];

export const authorizationResponseSchema: z.ZodType<DriverVehicleAuthorization> = z
  .object({
    id: z.uuid(),
    driver_id: z.uuid(),
    vehicle_id: z.uuid(),
    valid_from: z.iso.datetime({ offset: true }),
    valid_until: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .strict();

const messageSchema: z.ZodType<MessageResponse> = z
  .object({
    message: z.string(),
  })
  .strict();

export const authorizationCreateSchema = z
  .object({
    driver_id: z.uuid('Vui lòng chọn hồ sơ tài xế hợp lệ.'),
    vehicle_id: z.uuid('Vui lòng chọn phương tiện hợp lệ.'),
    valid_from: z.string().trim().min(1, 'Vui lòng nhập thời điểm bắt đầu hiệu lực.'),
    valid_until: z.string().trim().optional().or(z.literal('')),
  })
  .strict()
  .superRefine((val, ctx) => {
    const fromTime = Date.parse(val.valid_from);
    if (Number.isNaN(fromTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valid_from'],
        message: 'Thời điểm bắt đầu không hợp lệ (ISO 8601).',
      });
      return;
    }
    if (val.valid_until && val.valid_until.trim()) {
      const untilTime = Date.parse(val.valid_until);
      if (Number.isNaN(untilTime)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valid_until'],
          message: 'Thời điểm kết thúc không hợp lệ (ISO 8601).',
        });
      } else if (untilTime <= fromTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valid_until'],
          message: 'Thời điểm kết thúc phải lớn hơn thời điểm bắt đầu.',
        });
      }
    }
  });

export type AuthorizationCreateValues = z.infer<typeof authorizationCreateSchema>;

export async function listAuthorizations(
  signal?: AbortSignal,
): Promise<DriverVehicleAuthorization[]> {
  const response = await http.get<unknown>('/api/v1/driver-vehicle-authorizations', { signal });
  return parsePayload(
    z.array(authorizationResponseSchema),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function createAuthorization(
  input: AuthorizationCreateValues,
): Promise<DriverVehicleAuthorization> {
  const payload: AuthorizationRequest = {
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id,
    valid_from: new Date(input.valid_from).toISOString(),
    valid_until:
      input.valid_until && input.valid_until.trim()
        ? new Date(input.valid_until).toISOString()
        : null,
  };
  const response = await http.post<unknown>('/api/v1/driver-vehicle-authorizations', payload);
  return parsePayload(authorizationResponseSchema, response.data, response.headers['x-request-id']);
}

export async function revokeAuthorization(
  driverId: string,
  vehicleId: string,
): Promise<MessageResponse> {
  const response = await http.delete<unknown>(
    `/api/v1/driver-vehicle-authorizations/${encodeURIComponent(driverId)}/${encodeURIComponent(vehicleId)}`,
  );
  return parsePayload(messageSchema, response.data, response.headers['x-request-id']);
}

export async function updateAuthorization(
  authorizationId: string,
  input: {
    valid_from?: string | null;
    valid_until?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
  },
): Promise<DriverVehicleAuthorization> {
  const response = await http.patch<unknown>(
    `/api/v1/driver-vehicle-authorizations/${encodeURIComponent(authorizationId)}`,
    input,
  );
  return parsePayload(authorizationResponseSchema, response.data, response.headers['x-request-id']);
}

export async function deleteAuthorizationPermanent(
  authorizationId: string,
): Promise<MessageResponse> {
  const response = await http.delete<unknown>(
    `/api/v1/driver-vehicle-authorizations/${encodeURIComponent(authorizationId)}/permanent`,
  );
  return parsePayload(messageSchema, response.data, response.headers['x-request-id']);
}
