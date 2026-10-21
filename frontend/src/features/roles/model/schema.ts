import { z } from 'zod';

export const permissionViewSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z-]*:[a-z][a-z-]*$/, 'Mã quyền không đúng định dạng.'),
    group: z.string().min(1),
    description: z.string(),
    dependencies: z.array(z.string()),
    protected: z.boolean(),
  })
  .strict();

export type PermissionView = z.infer<typeof permissionViewSchema>;

export const roleViewSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/, 'Mã vai trò phải viết hoa, từ 3-64 ký tự.'),
    name: z.string().min(1).max(128),
    description: z.string().nullable().optional(),
    is_system: z.boolean(),
    is_active: z.boolean(),
    permission_codes: z.array(z.string()),
    assigned_user_count: z.number().int().min(0),
    version: z.number().int().min(1),
  })
  .strict();

export type RoleView = z.infer<typeof roleViewSchema>;

export const roleCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(
        /^[A-Z][A-Z0-9_]{2,63}$/,
        'Mã vai trò phải viết hoa, bắt đầu bằng chữ cái, từ 3-64 ký tự (VD: DISPATCHER).',
      ),
    name: z.string().trim().min(1, 'Tên vai trò không được để trống.').max(128),
    description: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .strict();

export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const rolePatchSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do phải có ít nhất 3 ký tự.').max(500),
    name: z.string().trim().min(1).max(128).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type RolePatchInput = z.infer<typeof rolePatchSchema>;

export const permissionReplaceSchema = z
  .object({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3, 'Lý do phải có ít nhất 3 ký tự.').max(500),
    permission_codes: z.array(z.string()).max(200),
  })
  .strict();

export type PermissionReplaceInput = z.infer<typeof permissionReplaceSchema>;
