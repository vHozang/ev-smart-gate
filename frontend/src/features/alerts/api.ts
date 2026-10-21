import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type AlertItem = components['schemas']['AlertResponse'];
export type AlertSeverity = components['schemas']['AlertSeverity'];
export type AlertStatus = components['schemas']['AlertStatus'];
export type AlertStatusRequest = components['schemas']['AlertStatusRequest'];

export const alertResponseSchema: z.ZodType<AlertItem> = z
  .object({
    id: z.uuid(),
    event_id: z.string(),
    sequence: z.number().int().nonnegative(),
    alert_type: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE']),
    message: z.string(),
    data: z.record(z.string(), z.unknown()),
    occurred_at: z.string().nullable(),
    resolved_at: z.string().nullable(),
  })
  .strict();

export const alertPageObjectSchema = z
  .object({
    items: z.array(alertResponseSchema),
    next_after_sequence: z.number().int().nonnegative(),
    has_more: z.boolean(),
    oldest_available_sequence: z.number().int().nonnegative(),
  })
  .strict();

export interface NormalizedAlertPage {
  items: AlertItem[];
  next_after_sequence: number;
  has_more: boolean;
  oldest_available_sequence: number;
}

const wsTicketResponseSchema = z
  .object({
    ticket: z.string().min(1),
    expires_at: z.string(),
    websocket_path: z.string().optional(),
  })
  .strict();

export async function listAlertsPage(
  params?: { after_sequence?: number; limit?: number },
  signal?: AbortSignal,
): Promise<NormalizedAlertPage> {
  const limit = params?.limit ?? 100;
  const afterSequence = params?.after_sequence ?? 0;

  const response = await http.get<unknown>('/api/v1/security/alerts', {
    params: {
      after_sequence: afterSequence,
      limit,
    },
    signal,
  });

  const raw = response.data;
  const requestId = response.headers['x-request-id'];

  if (Array.isArray(raw)) {
    const items = parsePayload(z.array(alertResponseSchema), raw, requestId);
    const maxSeq = items.reduce((acc, item) => Math.max(acc, item.sequence), afterSequence);
    const minSeq = items.length > 0 ? Math.min(...items.map((item) => item.sequence)) : 0;
    return {
      items,
      next_after_sequence: maxSeq,
      has_more: items.length >= limit,
      oldest_available_sequence: minSeq,
    };
  }

  return parsePayload(alertPageObjectSchema, raw, requestId);
}

export async function updateAlertStatus(alertId: string, status: AlertStatus): Promise<AlertItem> {
  const payload: AlertStatusRequest = { status };
  const response = await http.patch<unknown>(
    `/api/v1/security/alerts/${encodeURIComponent(alertId)}`,
    payload,
  );
  return parsePayload(alertResponseSchema, response.data, response.headers['x-request-id']);
}

export async function issueAlertWsTicket(
  signal?: AbortSignal,
): Promise<{ ticket: string; expires_at: string; websocket_path?: string }> {
  const response = await http.post<unknown>(
    '/api/v2/auth/ws-tickets',
    { channel: 'security.alerts' },
    { signal },
  );
  return parsePayload(wsTicketResponseSchema, response.data, response.headers['x-request-id']);
}
