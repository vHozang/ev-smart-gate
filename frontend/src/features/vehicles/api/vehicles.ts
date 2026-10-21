import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';
import { vehicleSchema } from '../model/schema';
export async function listVehicles(signal?: AbortSignal) {
  const response = await http.get<unknown>('/api/v1/vehicles', { signal });
  return parsePayload(z.array(vehicleSchema), response.data, response.headers['x-request-id']);
}
export async function createVehicle(payload: components['schemas']['VehicleRequest']) {
  const response = await http.post<unknown>('/api/v1/vehicles', payload);
  return parsePayload(vehicleSchema, response.data, response.headers['x-request-id']);
}
export async function updateVehicle(
  id: string,
  payload: components['schemas']['VehicleUpdateRequest'],
) {
  const response = await http.patch<unknown>(`/api/v1/vehicles/${encodeURIComponent(id)}`, payload);
  return parsePayload(vehicleSchema, response.data, response.headers['x-request-id']);
}
export async function deactivateVehicle(id: string) {
  const response = await http.delete<unknown>(`/api/v1/vehicles/${encodeURIComponent(id)}`);
  return parsePayload(vehicleSchema, response.data, response.headers['x-request-id']);
}
