import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';
export type WarehouseOrder = components['schemas']['OrderOutput'];
const schema: z.ZodType<WarehouseOrder> = z
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
    valid_from: z.iso.datetime({ offset: true }),
    valid_until: z.iso.datetime({ offset: true }),
    dock_session_id: z.uuid().nullable(),
    slip_version: z.number().int(),
    slip_refs: z.record(z.string(), z.string()),
  })
  .strict();
export async function listOrders(signal?: AbortSignal) {
  const response = await http.get<unknown>('/api/v1/warehouse/orders', { signal });
  return parsePayload(z.array(schema), response.data, response.headers['x-request-id']);
}
