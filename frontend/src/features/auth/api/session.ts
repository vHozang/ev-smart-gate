import { z } from 'zod';
import {
  ApiError,
  clearTransportIdentity,
  configureCredentials,
  http,
  parsePayload,
} from '@/shared/api';
import { legacyPermissions } from '../model/legacy-permissions';
import type { LoginInput, SessionPrincipal } from '../model/types';
import type { components } from '@/shared/api';
const userSchema: z.ZodType<components['schemas']['UserResponse']> = z
  .object({
    id: z.uuid(),
    username: z.string(),
    role: z.enum(['ADMIN', 'WAREHOUSE', 'SECURITY']),
    csrf_token: z.string().nullable().optional(),
  })
  .strict();
const loginSchema: z.ZodType<components['schemas']['LoginResponse']> = z
  .object({
    user_id: z.uuid(),
    username: z.string(),
    role: z.enum(['ADMIN', 'WAREHOUSE', 'SECURITY']),
    csrf_token: z.string(),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();
let csrf: string | null = null;
let epoch = 0;
export function installSessionCredentials() {
  configureCredentials((): Record<string, string> => (csrf ? { 'X-CSRF-Token': csrf } : {}));
}
function principal(id: string, username: string, role: SessionPrincipal['role']): SessionPrincipal {
  return {
    id,
    username,
    role,
    permissions: legacyPermissions[role],
    source: 'legacy-session',
  };
}
export function clearSession() {
  csrf = null;
  epoch += 1;
  clearTransportIdentity();
}
export async function getSession(signal?: AbortSignal): Promise<SessionPrincipal | null> {
  const expected = epoch;
  try {
    const response = await http.get<unknown>('/api/v1/auth/me', { signal });
    const user = parsePayload(userSchema, response.data, response.headers['x-request-id']);
    if (expected !== epoch) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
    csrf = user.csrf_token ?? null;
    return principal(user.id, user.username, user.role);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function loginSession(input: LoginInput): Promise<SessionPrincipal> {
  clearSession();
  const expected = epoch;
  const response = await http.post<unknown>('/api/v1/auth/login', input);
  const user = parsePayload(loginSchema, response.data, response.headers['x-request-id']);
  if (epoch !== expected) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
  csrf = user.csrf_token;
  return principal(user.user_id, user.username, user.role);
}
export async function logoutSession() {
  try {
    await http.post('/api/v1/auth/logout');
  } finally {
    clearSession();
  }
}
