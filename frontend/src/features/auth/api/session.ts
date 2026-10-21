import { z } from 'zod';
import {
  ApiError,
  clearTransportIdentity,
  configureCredentials,
  getAuthToken,
  http,
  parsePayload,
  setAuthToken,
} from '@/shared/api';
import { legacyPermissions } from '../model/legacy-permissions';
import type { ChangePasswordInput, LoginInput, SessionPrincipal } from '../model/types';
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

export const effectivePrincipalSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1).max(128),
    role_id: z.uuid(),
    role_code: z.string().min(1).max(128),
    permissions: z.array(z.string().max(100)),
    authz_version: z.number().int().min(1),
    must_change_password: z.boolean(),
  })
  .strict();

export const accessTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().positive(),
    principal: effectivePrincipalSchema,
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    current_password: z
      .string()
      .min(1, 'Vui lòng nhập mật khẩu hiện tại.')
      .max(256, 'Mật khẩu hiện tại tối đa 256 ký tự.'),
    new_password: z
      .string()
      .min(12, 'Mật khẩu mới phải có tối thiểu 12 ký tự.')
      .max(128, 'Mật khẩu mới tối đa 128 ký tự.'),
  })
  .strict()
  .refine((data) => data.new_password !== data.current_password, {
    message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
    path: ['new_password'],
  });

const messageSchema = z
  .object({
    message: z.string(),
  })
  .strict();

const changePasswordResponseSchema = z.union([accessTokenResponseSchema, messageSchema]);

let csrf: string | null = null;
let epoch = 0;

export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const parts = document.cookie.split(';');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part.startsWith('evsg_auth_csrf=')) {
      const value = decodeURIComponent(part.slice('evsg_auth_csrf='.length)).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function readLegacyCsrfCookie(): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const parts = document.cookie.split(';');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part.startsWith('smart_gate_csrf=')) {
      const value = decodeURIComponent(part.slice('smart_gate_csrf='.length)).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function installSessionCredentials() {
  configureCredentials((): Record<string, string> => {
    const token = csrf ?? readCsrfCookie() ?? readLegacyCsrfCookie();
    return token ? { 'X-CSRF-Token': token } : {};
  });
}

function principal(id: string, username: string, role: SessionPrincipal['role']): SessionPrincipal {
  return {
    id,
    username,
    role,
    permissions: legacyPermissions[role],
    must_change_password: false,
    source: 'legacy-session',
  };
}

function mapEffectivePrincipal(raw: z.infer<typeof effectivePrincipalSchema>): SessionPrincipal {
  const normalizedRole: SessionPrincipal['role'] =
    raw.role_code === 'ADMIN' || raw.role_code === 'WAREHOUSE' || raw.role_code === 'SECURITY'
      ? raw.role_code
      : 'SECURITY';
  return {
    id: raw.id,
    username: raw.username,
    role: normalizedRole,
    role_id: raw.role_id,
    role_code: raw.role_code,
    permissions: raw.permissions,
    authz_version: raw.authz_version,
    must_change_password: raw.must_change_password,
    source: 'jwt',
  };
}

export function clearSession() {
  csrf = null;
  if (typeof document !== 'undefined') {
    document.cookie = 'evsg_auth_csrf=; Max-Age=0; path=/';
  }
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

export async function getPrincipalV2(signal?: AbortSignal): Promise<SessionPrincipal | null> {
  const expected = epoch;
  try {
    const response = await http.get<unknown>('/api/v2/auth/me', { signal });
    const parsed = parsePayload(
      effectivePrincipalSchema,
      response.data,
      response.headers['x-request-id'],
    );
    if (expected !== epoch) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
    return mapEffectivePrincipal(parsed);
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

export async function loginSessionV2(input: LoginInput): Promise<SessionPrincipal> {
  clearSession();
  const expected = epoch;
  const response = await http.post<unknown>('/api/v2/auth/login', input);
  const tokenRes = parsePayload(
    accessTokenResponseSchema,
    response.data,
    response.headers['x-request-id'],
  );
  if (epoch !== expected) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
  const csrfHeader = response.headers['x-csrf-token'];
  if (typeof csrfHeader === 'string' && csrfHeader.length > 0) {
    csrf = csrfHeader;
  }
  const mapped = mapEffectivePrincipal(tokenRes.principal);
  setAuthToken(tokenRes.access_token);
  return mapped;
}

export async function refreshSessionV2(signal?: AbortSignal): Promise<SessionPrincipal | null> {
  const expected = epoch;
  try {
    const response = await http.post<unknown>('/api/v2/auth/refresh', undefined, { signal });
    const tokenRes = parsePayload(
      accessTokenResponseSchema,
      response.data,
      response.headers['x-request-id'],
    );
    if (epoch !== expected) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
    const csrfHeader = response.headers['x-csrf-token'];
    if (typeof csrfHeader === 'string' && csrfHeader.length > 0) {
      csrf = csrfHeader;
    }
    const mapped = mapEffectivePrincipal(tokenRes.principal);
    setAuthToken(tokenRes.access_token);
    return mapped;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function bootstrapSession(signal?: AbortSignal): Promise<SessionPrincipal | null> {
  if (getAuthToken()) {
    const v2 = await getPrincipalV2(signal);
    if (v2) return v2;
  }
  if (csrf || readCsrfCookie()) {
    const refreshed = await refreshSessionV2(signal);
    if (refreshed) return refreshed;
  }
  return getSession(signal);
}

export async function changePasswordSession(input: ChangePasswordInput): Promise<string> {
  const validated = changePasswordRequestSchema.parse(input);
  const expected = epoch;
  const response = await http.post<unknown>('/api/v2/auth/change-password', validated);
  const parsed = parsePayload(
    changePasswordResponseSchema,
    response.data,
    response.headers['x-request-id'],
  );
  if (epoch !== expected) throw new ApiError('IDENTITY_CHANGED', 'Phiên đã thay đổi.');
  const csrfHeader = response.headers['x-csrf-token'];
  if (typeof csrfHeader === 'string' && csrfHeader.length > 0) {
    csrf = csrfHeader;
  }
  if ('access_token' in parsed) {
    setAuthToken(parsed.access_token);
    return 'Đã cập nhật mật khẩu thành công.';
  }
  return parsed.message;
}

export async function logoutSessionV2() {
  try {
    await http.post('/api/v2/auth/logout');
  } finally {
    clearSession();
  }
}

export async function logoutSession(source?: SessionPrincipal['source']) {
  const useV2 = source === 'jwt' || Boolean(getAuthToken());
  try {
    await http.post(useV2 ? '/api/v2/auth/logout' : '/api/v1/auth/logout');
  } finally {
    clearSession();
  }
}
