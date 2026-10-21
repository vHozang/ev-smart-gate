import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';
export type Driver = components['schemas']['DriverResponse'];
const schema: z.ZodType<Driver> = z
  .object({
    id: z.uuid(),
    full_name: z.string(),
    employee_code: z.string().nullable(),
    phone: z.string().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    face_model: z.string(),
    embedding_version: z.string(),
    enrolled_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export async function listDrivers(signal?: AbortSignal) {
  const response = await http.get<unknown>('/api/v1/drivers', { signal });
  return parsePayload(z.array(schema), response.data, response.headers['x-request-id']);
}
