import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import {
  roleViewSchema,
  permissionViewSchema,
  type RoleView,
  type RoleCreateInput,
  type RolePatchInput,
  type PermissionReplaceInput,
  type PermissionView,
} from '../model/schema';

const cursorPageRolesSchema = z.object({
  items: z.array(roleViewSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  coverage: z.enum(['complete', 'partial']),
  total: z.number().nullable(),
});

const cursorPagePermissionsSchema = z.object({
  items: z.array(permissionViewSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  coverage: z.enum(['complete', 'partial']),
  total: z.number().nullable(),
});

export async function listRoles(signal?: AbortSignal): Promise<RoleView[]> {
  const response = await http.get<unknown>('/api/v1/admin/roles', { signal });
  if (Array.isArray(response.data)) {
    return parsePayload(z.array(roleViewSchema), response.data, response.headers['x-request-id']);
  }
  const page = parsePayload(cursorPageRolesSchema, response.data, response.headers['x-request-id']);
  return page.items;
}

export async function getRole(id: string, signal?: AbortSignal): Promise<RoleView> {
  const response = await http.get<unknown>(`/api/v1/admin/roles/${encodeURIComponent(id)}`, {
    signal,
  });
  return parsePayload(roleViewSchema, response.data, response.headers['x-request-id']);
}

export async function createRole(payload: RoleCreateInput): Promise<RoleView> {
  const response = await http.post<unknown>('/api/v1/admin/roles', payload);
  return parsePayload(roleViewSchema, response.data, response.headers['x-request-id']);
}

export async function updateRole(id: string, payload: RolePatchInput): Promise<RoleView> {
  const response = await http.patch<unknown>(
    `/api/v1/admin/roles/${encodeURIComponent(id)}`,
    payload,
  );
  return parsePayload(roleViewSchema, response.data, response.headers['x-request-id']);
}

export async function archiveRole(
  id: string,
  payload: { expected_version: number; reason: string },
): Promise<{ message: string }> {
  const response = await http.delete<unknown>(`/api/v1/admin/roles/${encodeURIComponent(id)}`, {
    data: payload,
  });
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}

export async function replaceRolePermissions(
  id: string,
  payload: PermissionReplaceInput,
): Promise<RoleView> {
  const response = await http.put<unknown>(
    `/api/v1/admin/roles/${encodeURIComponent(id)}/permissions`,
    payload,
  );
  return parsePayload(roleViewSchema, response.data, response.headers['x-request-id']);
}

export async function listPermissionCatalog(signal?: AbortSignal): Promise<PermissionView[]> {
  const response = await http.get<unknown>('/api/v1/admin/permissions', { signal });
  if (Array.isArray(response.data)) {
    return parsePayload(
      z.array(permissionViewSchema),
      response.data,
      response.headers['x-request-id'],
    );
  }
  const page = parsePayload(
    cursorPagePermissionsSchema,
    response.data,
    response.headers['x-request-id'],
  );
  return page.items;
}
