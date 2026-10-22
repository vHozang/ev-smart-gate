import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
const healthSchema = z.object({ status: z.string() }).catchall(z.string());
export async function getReadiness(signal?: AbortSignal) {
  const response = await http.get<unknown>('/health/ready', { signal });
  return parsePayload(healthSchema, response.data, response.headers['x-request-id']);
}
export async function getLiveness(signal?: AbortSignal) {
  const response = await http.get<unknown>('/health/live', { signal });
  return parsePayload(healthSchema, response.data, response.headers['x-request-id']);
}
