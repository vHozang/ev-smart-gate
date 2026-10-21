import { z } from 'zod';

export const adminUserSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().min(3).max(64),
    display_name: z.string().nullable().optional(),
    role_id: z.string().uuid(),
    role_code: z.string().min(1),
    is_active: z.boolean(),
    must_change_password: z.boolean(),
    version: z.number().int().min(1),
    created_at: z.string().datetime(),
  })
  .strict();

export type AdminUser = z.infer<typeof adminUserSchema>;

export const userCreateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(
        /^[a-zA-Z0-9._-]{3,64}$/,
        'Tên đăng nhập từ 3-64 ký tự, chỉ gồm chữ cái, số, dấu chấm, gạch dưới, gạch ngang.',
      ),
    password: z
      .string()
      .min(12, 'Mật khẩu khởi tạo phải từ 12 ký tự trở lên.')
      .max(128, 'Mật khẩu tối đa 128 ký tự.'),
    role_id: z.string().uuid('Vui lòng chọn vai trò hợp lệ.'),
    display_name: z.string().trim().max(128).optional().or(z.literal('')),
  })
  .strict();

export type UserCreateInput = z.infer<typeof userCreateSchema>;

// Cập nhật profile: Chỉ cho phép username / display_name và BẮT BUỘC có expected_version
export const userProfilePatchSchema = z
  .object({
    expected_version: z.number().int().min(1),
    username: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._-]{3,64}$/, 'Tên đăng nhập không đúng định dạng.')
      .optional(),
    display_name: z.string().trim().max(128).optional().nullable(),
  })
  .strict();

export type UserProfilePatchInput = z.infer<typeof userProfilePatchSchema>;

// Đổi trạng thái kích hoạt: Cần expected_version và lý do
export const userStatusChangeSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do phải có ít nhất 3 ký tự.').max(500),
    is_active: z.boolean(),
  })
  .strict();

export type UserStatusChangeInput = z.infer<typeof userStatusChangeSchema>;

// Gán vai trò mới: Cần expected_version và lý do
export const userRoleChangeSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do phải có ít nhất 3 ký tự.').max(500),
    role_id: z.string().uuid('Vui lòng chọn vai trò hợp lệ.'),
  })
  .strict();

export type UserRoleChangeInput = z.infer<typeof userRoleChangeSchema>;

// Đặt lại mật khẩu: Cần expected_version, lý do và mật khẩu tạm thời
export const passwordResetSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do phải có ít nhất 3 ký tự.').max(500),
    temporary_password: z.string().min(12, 'Mật khẩu tạm thời phải từ 12 ký tự trở lên.').max(128),
  })
  .strict();

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// Thông tin phiên truy cập
export const sessionViewSchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    revoked_at: z.string().datetime().nullable(),
  })
  .strict();

export type SessionView = z.infer<typeof sessionViewSchema>;

export type { CursorPage } from '@/shared/api';
