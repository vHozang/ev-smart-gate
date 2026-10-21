import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import type { components } from '@/shared/api';

export type Driver = components['schemas']['DriverResponse'];
export type MessageResponse = components['schemas']['MessageResponse'];

export const MAX_FACE_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB theo hợp đồng M0
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const driverResponseSchema: z.ZodType<Driver> = z
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

const messageSchema: z.ZodType<MessageResponse> = z
  .object({
    message: z.string(),
  })
  .strict();

export const faceImageFileSchema = z
  .custom<File>((val) => typeof File !== 'undefined' && val instanceof File, {
    message: 'Vui lòng chọn ảnh khuôn mặt đăng ký nhận diện.',
  })
  .refine((file) => file.size > 0 && file.size <= MAX_FACE_IMAGE_BYTES, {
    message: 'Kích thước ảnh khuôn mặt phải nhỏ hơn hoặc bằng 10 MiB.',
  })
  .refine((file) => ALLOWED_IMAGE_TYPES.includes(file.type), {
    message: 'Định dạng ảnh chỉ hỗ trợ JPEG, PNG hoặc WebP.',
  });

const optionalEmployeeCodeSchema = z
  .string()
  .trim()
  .max(64, 'Mã định danh tối đa 64 ký tự.')
  .refine((val) => val.length === 0 || val.length >= 2, {
    message: 'Mã định danh phải có tối thiểu 2 ký tự.',
  });

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32, 'Số điện thoại tối đa 32 ký tự.')
  .refine((val) => val.length === 0 || /^[0-9+\-\s()]{8,20}$/.test(val), {
    message: 'Số điện thoại phải từ 8 đến 20 ký tự số hợp lệ.',
  });

export const driverCreateSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Nhập họ và tên từ 2 ký tự.').max(120, 'Tối đa 120 ký tự.'),
    employee_code: optionalEmployeeCodeSchema,
    phone: optionalPhoneSchema,
    face_image: faceImageFileSchema,
  })
  .strict();

export const driverUpdateSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Nhập họ và tên từ 2 ký tự.').max(120, 'Tối đa 120 ký tự.'),
    employee_code: optionalEmployeeCodeSchema,
    phone: optionalPhoneSchema,
    face_image: faceImageFileSchema.nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export type DriverCreateValues = z.infer<typeof driverCreateSchema>;
export type DriverUpdateValues = z.infer<typeof driverUpdateSchema>;

export async function listDrivers(signal?: AbortSignal): Promise<Driver[]> {
  const response = await http.get<unknown>('/api/v1/drivers', { signal });
  return parsePayload(
    z.array(driverResponseSchema),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function getDriver(driverId: string, signal?: AbortSignal): Promise<Driver> {
  const response = await http.get<unknown>(`/api/v1/drivers/${encodeURIComponent(driverId)}`, {
    signal,
  });
  return parsePayload(driverResponseSchema, response.data, response.headers['x-request-id']);
}

export async function createDriver(input: DriverCreateValues): Promise<Driver> {
  const form = new FormData();
  form.append('full_name', input.full_name.trim());
  if (input.employee_code.trim()) form.append('employee_code', input.employee_code.trim());
  if (input.phone.trim()) form.append('phone', input.phone.trim());
  form.append('face_image', input.face_image);
  const response = await http.post<unknown>('/api/v1/drivers', form);
  return parsePayload(driverResponseSchema, response.data, response.headers['x-request-id']);
}

export async function updateDriver(driverId: string, input: DriverUpdateValues): Promise<Driver> {
  const form = new FormData();
  form.append('full_name', input.full_name.trim());
  form.append('employee_code', input.employee_code.trim());
  form.append('phone', input.phone.trim());
  if (input.face_image) form.append('face_image', input.face_image);
  const response = await http.patch<unknown>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}`,
    form,
  );
  const updated = parsePayload(
    driverResponseSchema,
    response.data,
    response.headers['x-request-id'],
  );
  if (input.status && input.status !== updated.status) {
    const statusRes = await http.post<unknown>(
      `/api/v1/drivers/${encodeURIComponent(driverId)}/status`,
      { status: input.status },
    );
    return parsePayload(driverResponseSchema, statusRes.data, statusRes.headers['x-request-id']);
  }
  return updated;
}

export async function deactivateDriver(driverId: string): Promise<Driver | MessageResponse> {
  const response = await http.delete<unknown>(`/api/v1/drivers/${encodeURIComponent(driverId)}`);
  return parsePayload(
    driverResponseSchema.or(messageSchema),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function deleteDriverPermanent(driverId: string): Promise<MessageResponse> {
  const response = await http.delete<unknown>(
    `/api/v1/drivers/${encodeURIComponent(driverId)}/permanent`,
  );
  return parsePayload(messageSchema, response.data, response.headers['x-request-id']);
}
