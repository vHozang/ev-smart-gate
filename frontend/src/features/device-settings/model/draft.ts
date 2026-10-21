import { z } from 'zod';
import type { DraftKind, DraftReviewRow, SettingsFormValues } from './types';
const name = z
  .string()
  .trim()
  .min(3, 'Nhập tên có ít nhất 3 ký tự.')
  .max(100, 'Tên tối đa 100 ký tự.');
const reference = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/,
    'Nhập mã tham chiếu 2–128 ký tự; không nhập URL hoặc mật khẩu.',
  );
const optionalReference = z.union([reference, z.literal('')]);
const direction = z.enum(['ENTRY', 'EXIT'], { error: 'Chọn hướng vào hoặc ra.' });
const notes = z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.');
function milliseconds(min: number, max: number) {
  return z
    .string()
    .refine(
      (value) =>
        value === '' || (/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max),
      `Nhập số nguyên từ ${min} đến ${max} ms, hoặc để trống.`,
    );
}
const camera = z.object({
  kind: z.literal('cameras'),
  name,
  accessPointRef: reference,
  laneRef: reference,
  direction,
  purpose: z.enum(['FACE', 'PLATE', 'OVERVIEW'], { error: 'Chọn vai trò camera.' }),
  connectionProfileRef: reference,
  notes,
});
const model = z.object({
  kind: z.literal('models'),
  name,
  modelRef: reference,
  modelVersion: z.string().trim().min(1, 'Nhập phiên bản cần xem xét.').max(64),
  task: z.enum(['FACE_VERIFICATION', 'FACE_DETECTION', 'PLATE_OCR', 'LIVENESS'], {
    error: 'Chọn tác vụ nhận diện.',
  }),
  notes,
});
const barrier = z.object({
  kind: z.literal('barriers'),
  name,
  accessPointRef: reference,
  laneRef: reference,
  connectionProfileRef: reference,
  timeoutMs: milliseconds(100, 30000),
  notes,
});
const reader = z.object({
  kind: z.literal('readers'),
  name,
  accessPointRef: reference,
  laneRef: reference,
  direction,
  connectionProfileRef: reference,
  debounceMs: milliseconds(0, 60000),
  notes,
});
const binding = z
  .object({
    kind: z.literal('bindings'),
    name,
    accessPointRef: reference,
    laneRef: reference,
    direction,
    accessMode: z.enum(['PEDESTRIAN', 'MOTORCYCLE', 'CAR', 'TRUCK'], {
      error: 'Chọn chế độ kiểm soát.',
    }),
    faceCameraRef: reference,
    plateCameraRef: optionalReference,
    readerRef: reference,
    barrierRef: optionalReference,
    notes,
  })
  .superRefine((draft, context) => {
    if (draft.accessMode !== 'PEDESTRIAN' && !draft.plateCameraRef)
      context.addIssue({
        code: 'custom',
        path: ['plateCameraRef'],
        message: 'Phương tiện cần tham chiếu camera biển số.',
      });
    if (draft.accessMode === 'PEDESTRIAN' && draft.plateCameraRef)
      context.addIssue({
        code: 'custom',
        path: ['plateCameraRef'],
        message: 'Luồng đi bộ không có camera biển số.',
      });
  });
// Types bản nháp nội bộ; không phải request DTO khi chưa có runtime OpenAPI.
export const settingsDraftSchema = z.discriminatedUnion('kind', [
  camera,
  model,
  barrier,
  reader,
  binding,
]);
export type SettingsDraft = z.infer<typeof settingsDraftSchema>;
export const settingsFormSchema: z.ZodType<SettingsFormValues, SettingsFormValues> = z
  .object({
    kind: z.enum(['cameras', 'models', 'barriers', 'readers', 'bindings']),
    name: z.string(),
    accessPointRef: z.string(),
    laneRef: z.string(),
    direction: z.string(),
    purpose: z.string(),
    connectionProfileRef: z.string(),
    modelRef: z.string(),
    modelVersion: z.string(),
    task: z.string(),
    timeoutMs: z.string(),
    debounceMs: z.string(),
    accessMode: z.string(),
    faceCameraRef: z.string(),
    plateCameraRef: z.string(),
    readerRef: z.string(),
    barrierRef: z.string(),
    notes: z.string(),
  })
  .superRefine((values, context) => {
    const parsed = settingsDraftSchema.safeParse(values);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  });
export function emptySettingsForm(kind: DraftKind): SettingsFormValues {
  return {
    kind,
    name: '',
    accessPointRef: '',
    laneRef: '',
    direction: '',
    purpose: '',
    connectionProfileRef: '',
    modelRef: '',
    modelVersion: '',
    task: '',
    timeoutMs: '',
    debounceMs: '',
    accessMode: '',
    faceCameraRef: '',
    plateCameraRef: '',
    readerRef: '',
    barrierRef: '',
    notes: '',
  };
}
const labels: Readonly<Record<string, string>> = {
  name: 'Tên cấu hình',
  accessPointRef: 'Mã điểm ra vào',
  laneRef: 'Mã làn',
  direction: 'Hướng',
  purpose: 'Vai trò camera',
  connectionProfileRef: 'Profile kết nối',
  modelRef: 'Mã mô hình',
  modelVersion: 'Phiên bản mô hình',
  task: 'Tác vụ',
  timeoutMs: 'Thời gian chờ ACK (ms)',
  debounceMs: 'Chống quét lặp (ms)',
  accessMode: 'Chế độ kiểm soát',
  faceCameraRef: 'Camera khuôn mặt',
  plateCameraRef: 'Camera biển số',
  readerRef: 'Đầu đọc thẻ',
  barrierRef: 'Bộ chấp hành',
  notes: 'Ghi chú',
};
const valueLabels: Record<string, string> = {
  ENTRY: 'Chiều vào',
  EXIT: 'Chiều ra',
  FACE: 'Khuôn mặt',
  PLATE: 'Biển số',
  OVERVIEW: 'Giám sát',
  FACE_VERIFICATION: 'Xác minh mặt 1:1',
  FACE_DETECTION: 'Phát hiện khuôn mặt',
  PLATE_OCR: 'Đọc biển số',
  LIVENESS: 'Kiểm tra liveness',
  PEDESTRIAN: 'Nhân viên đi bộ',
  MOTORCYCLE: 'Xe máy',
  CAR: 'Ô tô',
  TRUCK: 'Xe tải',
};
export function draftReviewRows(draft: SettingsDraft): DraftReviewRow[] {
  return Object.entries(draft)
    .filter(([key, value]) => key !== 'kind' && value !== '')
    .map(([key, value]) => ({
      label: labels[key] ?? key,
      value: ['direction', 'purpose', 'task', 'accessMode'].includes(key)
        ? (valueLabels[value] ?? value)
        : value,
    }));
}
