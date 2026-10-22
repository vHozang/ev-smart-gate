import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import { auditViewSchema, type AuditView, type ListAuditParams } from '../model/schema';
import type { CursorPage } from '@/shared/api';

const cursorPageAuditSchema = z.object({
  items: z.array(auditViewSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  coverage: z.enum(['complete', 'partial']),
  total: z.number().nullable(),
});

export async function listAuditLogs(
  params?: ListAuditParams,
  signal?: AbortSignal,
): Promise<CursorPage<AuditView>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.actor_id) query.set('actor_id', params.actor_id);
  if (params?.target_type) query.set('target_type', params.target_type);
  if (params?.action) query.set('action', params.action);
  if (params?.outcome) query.set('outcome', params.outcome);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const endpoint = `/api/v1/admin/audit-logs${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await http.get<unknown>(endpoint, { signal });
  return parsePayload(cursorPageAuditSchema, response.data, response.headers['x-request-id']);
}
