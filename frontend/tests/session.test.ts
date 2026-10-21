import { AxiosError } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { getAuthToken, http } from '@/shared/api';
import {
  bootstrapSession,
  changePasswordSession,
  clearSession,
  getSession,
  installSessionCredentials,
  loginSession,
  logoutSession,
  logoutSessionV2,
  refreshSessionV2,
} from '../src/features/auth/api/session';
const adapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = adapter;
  clearSession();
});
describe('Adapter session hiện tại, không giả lập JWT trong runtime', () => {
  it('principal chỉ chứa baseline, CSRF nằm ngoài cache/principal', async () => {
    installSessionCredentials();
    let csrfHeader: unknown;
    http.defaults.adapter = async (config) => {
      csrfHeader = config.headers.get('X-CSRF-Token');
      return {
        data: config.url?.endsWith('/login')
          ? {
              user_id: '00000000-0000-4000-8000-000000000001',
              username: 'unit-security',
              role: 'SECURITY',
              csrf_token: 'unit-csrf-private',
              expires_at: '2026-10-21T04:00:00Z',
            }
          : {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    const principal = await loginSession({
      username: 'unit-security',
      password: 'isolated-test-password',
    });
    expect(principal.source).toBe('legacy-session');
    expect(principal.permissions).toContain('vehicles:read');
    expect(principal.permissions).not.toContain('vehicles:create');
    expect(principal.permissions).not.toContain('users:manage-admin');
    expect(JSON.stringify(principal)).not.toContain('unit-csrf-private');
    await http.post('/api/v1/test-only');
    expect(csrfHeader).toBe('unit-csrf-private');
  });
  it('me 401 là anonymous, không gọi refresh v2 hoặc fallback', async () => {
    const requests: string[] = [];
    http.defaults.adapter = async (config) => {
      requests.push(config.url || '');
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };
    expect(await getSession()).toBeNull();
    expect(requests).toEqual(['/api/v1/auth/me']);
  });
  it('không phục hồi session từ response me đến muộn sau cleanup', async () => {
    let finish: (() => void) | undefined;
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    http.defaults.adapter = async (config) => {
      markReady?.();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        data: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'old-user',
          role: 'ADMIN',
          csrf_token: 'old-csrf',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    const promise = getSession();
    await ready;
    clearSession();
    finish?.();
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });
  it('logout lỗi mạng vẫn xóa credential phía browser', async () => {
    installSessionCredentials();
    let value: unknown;
    http.defaults.adapter = async (config) => {
      value = config.headers.get('X-CSRF-Token');
      if (config.url?.endsWith('/logout')) throw new AxiosError('offline', 'ERR_NETWORK', config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await expect(logoutSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await http.get('/health/live');
    expect(value).toBeUndefined();
  });

  it('đọc fallback cookie evsg_auth_csrf và hỗ trợ refreshSessionV2, changePasswordSession (AccessTokenResponse) & logoutSessionV2', async () => {
    installSessionCredentials();
    document.cookie = 'evsg_auth_csrf=cookie-csrf-v2; path=/';

    const calls: Array<{ method?: string; url?: string; csrf?: unknown }> = [];
    http.defaults.adapter = async (config) => {
      calls.push({
        method: config.method?.toUpperCase(),
        url: config.url,
        csrf: config.headers.get('X-CSRF-Token'),
      });
      if (config.url === '/api/v2/auth/refresh' || config.url === '/api/v2/auth/change-password') {
        return {
          data: {
            access_token:
              config.url === '/api/v2/auth/change-password'
                ? 'rotated-jwt-after-pwd'
                : 'refreshed-jwt-token',
            token_type: 'Bearer',
            expires_in: 900,
            principal: {
              id: '00000000-0000-4000-8000-000000000009',
              username: 'admin.v2',
              role_id: '00000000-0000-4000-8000-000000000010',
              role_code: 'ADMIN',
              permissions: ['users:read', 'users:manage-admin'],
              authz_version: 2,
              must_change_password: false,
            },
          },
          status: 200,
          statusText: 'OK',
          headers: { 'x-csrf-token': 'rotated-csrf-v2' },
          config,
        };
      }
      return {
        data: { message: 'Logged out' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const bootstrapped = await bootstrapSession();
    expect(bootstrapped?.source).toBe('jwt');
    expect(bootstrapped?.username).toBe('admin.v2');
    expect(getAuthToken()).toBe('refreshed-jwt-token');
    expect(calls[0]).toEqual({
      method: 'POST',
      url: '/api/v2/auth/refresh',
      csrf: 'cookie-csrf-v2',
    });

    const msg = await changePasswordSession({
      current_password: 'OldTempPassword#123',
      new_password: 'NewStrongPassword#456',
    });
    expect(msg).toContain('thành công');
    expect(getAuthToken()).toBe(
      'rotated-jwt-token'.replace('rotated-jwt-token', 'rotated-jwt-after-pwd'),
    );

    await logoutSessionV2();
    expect(getAuthToken()).toBeNull();
    expect(calls.some((c) => c.url === '/api/v2/auth/logout' && c.method === 'POST')).toBe(true);

    // Kiểm tra refreshSessionV2 trả về null khi 401
    http.defaults.adapter = async (config) => {
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };
    expect(await refreshSessionV2()).toBeNull();
  });
});
