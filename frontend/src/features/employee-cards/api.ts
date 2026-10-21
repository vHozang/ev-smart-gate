import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type EmployeeCard = components['schemas']['EmployeeCardResponse'];
export type CardStatus = components['schemas']['CardStatus'];
export type EmployeeCardIssueRequest = components['schemas']['EmployeeCardIssueRequest'];
export type EmployeeCardStatusRequest = components['schemas']['EmployeeCardStatusRequest'];
export type EmployeeCardReplaceRequest = components['schemas']['EmployeeCardReplaceRequest'];

export const employeeCardResponseSchema: z.ZodType<EmployeeCard> = z
  .object({
    id: z.uuid(),
    card_uid_masked: z.string(),
    driver_id: z.uuid(),
    status: z.enum(['ACTIVE', 'BLOCKED', 'LOST', 'REPLACED']),
    status_reason: z.string().nullable().optional(),
    replaces_card_id: z.string().nullable().optional(),
    replaced_by_card_id: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    issued_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .strict();

export const employeeCardIssueSchema = z
  .object({
    driver_id: z.uuid('Vui lòng chọn tài xế hợp lệ.'),
    card_uid: z
      .string()
      .trim()
      .min(4, 'UID thẻ phải có tối thiểu 4 ký tự.')
      .max(64, 'UID thẻ không quá 64 ký tự.'),
    status_reason: z.string().trim().max(255, 'Ghi chú không quá 255 ký tự.').optional(),
  })
  .strict();

export const employeeCardStatusSchema = z
  .object({
    status_reason: z
      .string()
      .trim()
      .min(3, 'Vui lòng nhập lý do tối thiểu 3 ký tự.')
      .max(255, 'Lý do không quá 255 ký tự.'),
  })
  .strict();

export const employeeCardReplaceSchema = z
  .object({
    card_uid: z
      .string()
      .trim()
      .min(4, 'UID thẻ thay thế phải có tối thiểu 4 ký tự.')
      .max(64, 'UID thẻ thay thế không quá 64 ký tự.'),
    status_reason: z
      .string()
      .trim()
      .min(3, 'Vui lòng nhập lý do thay thế tối thiểu 3 ký tự.')
      .max(255, 'Lý do không quá 255 ký tự.'),
  })
  .strict();

export type EmployeeCardIssueValues = z.infer<typeof employeeCardIssueSchema>;
export type EmployeeCardStatusValues = z.infer<typeof employeeCardStatusSchema>;
export type EmployeeCardReplaceValues = z.infer<typeof employeeCardReplaceSchema>;

export async function listEmployeeCards(
  params?: { driver_id?: string | null },
  signal?: AbortSignal,
): Promise<EmployeeCard[]> {
  const response = await http.get<unknown>('/api/v1/employee-cards', {
    params: params?.driver_id ? { driver_id: params.driver_id } : undefined,
    signal,
  });
  return parsePayload(
    z.array(employeeCardResponseSchema),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function getEmployeeCard(cardId: string, signal?: AbortSignal): Promise<EmployeeCard> {
  const response = await http.get<unknown>(`/api/v1/employee-cards/${encodeURIComponent(cardId)}`, {
    signal,
  });
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function issueEmployeeCard(input: EmployeeCardIssueValues): Promise<EmployeeCard> {
  const payload: EmployeeCardIssueRequest = {
    driver_id: input.driver_id,
    card_uid: input.card_uid.trim(),
    status_reason: input.status_reason?.trim() || null,
  };
  const response = await http.post<unknown>('/api/v1/employee-cards', payload);
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function blockEmployeeCard(
  cardId: string,
  input: EmployeeCardStatusValues,
): Promise<EmployeeCard> {
  const payload: EmployeeCardStatusRequest = {
    status_reason: input.status_reason.trim(),
  };
  const response = await http.post<unknown>(
    `/api/v1/employee-cards/${encodeURIComponent(cardId)}/block`,
    payload,
  );
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function reportLostEmployeeCard(
  cardId: string,
  input: EmployeeCardStatusValues,
): Promise<EmployeeCard> {
  const payload: EmployeeCardStatusRequest = {
    status_reason: input.status_reason.trim(),
  };
  const response = await http.post<unknown>(
    `/api/v1/employee-cards/${encodeURIComponent(cardId)}/report-lost`,
    payload,
  );
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function replaceEmployeeCard(
  cardId: string,
  input: EmployeeCardReplaceValues,
): Promise<EmployeeCard> {
  const payload: EmployeeCardReplaceRequest = {
    card_uid: input.card_uid.trim(),
    status_reason: input.status_reason.trim(),
  };
  const response = await http.post<unknown>(
    `/api/v1/employee-cards/${encodeURIComponent(cardId)}/replace`,
    payload,
  );
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function updateEmployeeCard(
  cardId: string,
  input: { status?: CardStatus; status_reason?: string | null },
): Promise<EmployeeCard> {
  const response = await http.patch<unknown>(
    `/api/v1/employee-cards/${encodeURIComponent(cardId)}`,
    input,
  );
  return parsePayload(employeeCardResponseSchema, response.data, response.headers['x-request-id']);
}

export async function deleteEmployeeCard(cardId: string): Promise<{ message: string }> {
  const response = await http.delete<unknown>(
    `/api/v1/employee-cards/${encodeURIComponent(cardId)}`,
  );
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}
