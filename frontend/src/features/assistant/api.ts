import { z } from 'zod';
import { ApiError, http, parsePayload } from '@/shared/api';
import { analyticsFiltersSchema, periodSchema } from '@/features/analytics';
import { inspectPromptPrivacy } from './privacyGuard';

export const metricReferenceSchema = z
  .object({
    metric_id: z.string().min(1).max(128),
    source_ref: z.string(),
    snapshot_id: z.uuid(),
  })
  .strict();

export type MetricReference = z.infer<typeof metricReferenceSchema>;

export const reportResultSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    findings: z.array(z.string()),
    metric_refs: z.array(metricReferenceSchema),
    limitations: z.array(z.string()),
    suggested_checks: z.array(z.string()),
    snapshot_id: z.uuid(),
    data_as_of: z.string(),
    model_id: z.string(),
    model_version: z.string(),
    output_kind: z.enum(['model_report', 'data_summary']),
  })
  .strict();

export type ReportResult = z.infer<typeof reportResultSchema>;

export const reportStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'VALIDATING',
  'COMPLETED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELED',
]);

export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const reportViewSchema = z
  .object({
    report_id: z.uuid(),
    owner_id: z.uuid(),
    status: reportStatusSchema,
    created_at: z.string(),
    expires_at: z.string(),
    last_sequence: z.number().int().min(0),
    result: reportResultSchema.nullable(),
    error_code: z.string().nullable(),
    artifact_available: z.boolean(),
  })
  .strict();

export type ReportView = z.infer<typeof reportViewSchema>;

export const reportCursorPageSchema = z
  .object({
    items: z.array(reportViewSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
    coverage: z.enum(['complete', 'partial']),
    total: z.number().int().min(0).nullable(),
  })
  .strict();

export type ReportCursorPage = z.infer<typeof reportCursorPageSchema>;

export const reportTemplateSchema = z.enum([
  'access-summary',
  'alerts-summary',
  'period-comparison',
]);

export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export const reportCreateSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập yêu cầu phân tích báo cáo.')
      .max(4000, 'Nội dung yêu cầu tối đa 4000 ký tự.'),
    period: periodSchema,
    filters: analyticsFiltersSchema,
    template: reportTemplateSchema.nullable().optional().default(null),
  })
  .strict();

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

export async function createAssistantReport(
  input: ReportCreateInput,
  idempotencyKey: string,
): Promise<ReportView> {
  const privacy = inspectPromptPrivacy(input.prompt);
  if (!privacy.allowed) {
    throw new ApiError(
      'PROMPT_PRIVACY_BLOCKED',
      privacy.message || 'Nội dung yêu cầu chứa dữ liệu nhạy cảm bị chặn.',
      422,
    );
  }
  const validated = reportCreateSchema.parse(input);
  const response = await http.post<unknown>('/api/v1/assistant/reports', validated, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return parsePayload(reportViewSchema, response.data, response.headers['x-request-id']);
}

export async function listAssistantReports(
  filters: { cursor?: string | null; limit?: number; status?: ReportStatus | '' } = {},
  signal?: AbortSignal,
): Promise<ReportCursorPage> {
  const params: Record<string, string | number> = {};
  if (filters.cursor) params.cursor = filters.cursor;
  if (filters.limit) params.limit = filters.limit;
  if (filters.status) params.status = filters.status;

  const response = await http.get<unknown>('/api/v1/assistant/reports', {
    params,
    signal,
  });
  return parsePayload(reportCursorPageSchema, response.data, response.headers['x-request-id']);
}

export async function getAssistantReport(
  reportId: string,
  signal?: AbortSignal,
): Promise<ReportView> {
  const response = await http.get<unknown>(
    `/api/v1/assistant/reports/${encodeURIComponent(reportId)}`,
    { signal },
  );
  return parsePayload(reportViewSchema, response.data, response.headers['x-request-id']);
}

export async function cancelAssistantReport(reportId: string): Promise<ReportView> {
  const response = await http.post<unknown>(
    `/api/v1/assistant/reports/${encodeURIComponent(reportId)}/cancel`,
  );
  return parsePayload(reportViewSchema, response.data, response.headers['x-request-id']);
}

export async function downloadAssistantReportArtifact(
  reportId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await http.get<Blob>(
    `/api/v1/assistant/reports/${encodeURIComponent(reportId)}/download`,
    {
      responseType: 'blob',
      signal,
    },
  );
  return response.data;
}
