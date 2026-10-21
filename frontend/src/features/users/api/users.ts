import { z } from 'zod';
import { http, parsePayload } from '@/shared/api';
import {
  adminUserSchema,
  sessionViewSchema,
  type AdminUser,
  type UserCreateInput,
  type UserProfilePatchInput,
  type UserStatusChangeInput,
  type UserRoleChangeInput,
  type PasswordResetInput,
  type SessionView,
  type CursorPage,
} from '../model/schema';

export interface ListUsersParams {
  cursor?: string;
  limit?: number;
  search?: string;
  role?: string;
  role_id?: string;
  is_active?: boolean;
}

const cursorPageUsersSchema = z.object({
  items: z.array(adminUserSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  coverage: z.enum(['complete', 'partial']),
  total: z.number().nullable(),
});

export async function listUsers(
  params?: ListUsersParams,
  signal?: AbortSignal,
): Promise<CursorPage<AdminUser>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  if (params?.role_id) query.set('role_id', params.role_id);
  if (params?.is_active !== undefined) query.set('is_active', String(params.is_active));

  const endpoint = `/api/v1/admin/users${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await http.get<unknown>(endpoint, { signal });
  return parsePayload(cursorPageUsersSchema, response.data, response.headers['x-request-id']);
}

export async function getUser(id: string, signal?: AbortSignal): Promise<AdminUser> {
  const response = await http.get<unknown>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    signal,
  });
  return parsePayload(adminUserSchema, response.data, response.headers['x-request-id']);
}

export async function createUser(payload: UserCreateInput): Promise<AdminUser> {
  const response = await http.post<unknown>('/api/v1/admin/users', payload);
  return parsePayload(adminUserSchema, response.data, response.headers['x-request-id']);
}

export async function updateUserProfile(
  id: string,
  payload: UserProfilePatchInput,
): Promise<AdminUser> {
  const response = await http.patch<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(id)}`,
    payload,
  );
  return parsePayload(adminUserSchema, response.data, response.headers['x-request-id']);
}

export async function changeUserStatus(
  id: string,
  payload: UserStatusChangeInput,
): Promise<AdminUser> {
  const response = await http.patch<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/status`,
    payload,
  );
  return parsePayload(adminUserSchema, response.data, response.headers['x-request-id']);
}

export async function changeUserRole(id: string, payload: UserRoleChangeInput): Promise<AdminUser> {
  const response = await http.put<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/role`,
    payload,
  );
  return parsePayload(adminUserSchema, response.data, response.headers['x-request-id']);
}

export async function resetPassword(
  id: string,
  payload: PasswordResetInput,
): Promise<AdminUser | { message: string }> {
  const response = await http.post<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/password-reset`,
    payload,
  );
  const parsedUser = adminUserSchema.safeParse(response.data);
  if (parsedUser.success) return parsedUser.data;
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}

const cursorPageSessionsSchema = z.object({
  items: z.array(sessionViewSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  coverage: z.enum(['complete', 'partial']),
  total: z.number().nullable(),
});

export async function listUserSessions(
  userId: string,
  signal?: AbortSignal,
): Promise<SessionView[]> {
  const response = await http.get<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions`,
    { signal },
  );
  if (Array.isArray(response.data)) {
    return parsePayload(
      z.array(sessionViewSchema),
      response.data,
      response.headers['x-request-id'],
    );
  }
  const page = parsePayload(
    cursorPageSessionsSchema,
    response.data,
    response.headers['x-request-id'],
  );
  return page.items;
}

export async function revokeAllUserSessions(
  userId: string,
  payload: { expected_version?: number; reason: string },
): Promise<{ message: string }> {
  const response = await http.post<unknown>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions/revoke`,
    payload,
  );
  return parsePayload(
    z.object({ message: z.string() }),
    response.data,
    response.headers['x-request-id'],
  );
}
