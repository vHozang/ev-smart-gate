import axios from 'axios';
import { z } from 'zod';
const envelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const parsed = envelope.safeParse(error.response?.data);
    const id: unknown = error.response?.headers['x-request-id'];
    const requestId =
      typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(id) ? id : undefined;
    const status = error.response?.status;
    return new ApiError(
      parsed.success ? parsed.data.error.code : status ? 'HTTP_ERROR' : 'NETWORK_ERROR',
      parsed.success
        ? parsed.data.error.message
        : status === 403
          ? 'Bạn không có quyền thực hiện thao tác này.'
          : status === 401
            ? 'Phiên đăng nhập không còn hiệu lực.'
            : 'Không thể kết nối dịch vụ. Hãy thử lại.',
      status,
      requestId,
      parsed.success ? parsed.data.error.details : undefined,
    );
  }
  if (error instanceof z.ZodError)
    return new ApiError(
      'CONTRACT_INVALID',
      'Dữ liệu dịch vụ chưa đúng hợp đồng. Vui lòng liên hệ quản trị.',
    );
  return new ApiError('UNEXPECTED_ERROR', 'Không thể hoàn tất thao tác. Hãy thử lại.');
}
export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown, requestId?: string): T {
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new ApiError(
      'CONTRACT_INVALID',
      'Dữ liệu dịch vụ chưa đúng hợp đồng.',
      undefined,
      requestId,
    );
  return result.data;
}
