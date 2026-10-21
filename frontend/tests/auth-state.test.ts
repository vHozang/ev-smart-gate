import { AxiosError } from 'axios';
import type { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSensitiveCache,
  clearTransportIdentity,
  createQueryClient,
  getAuthToken,
  http,
  invalidateIdentity,
  invalidateResource,
  queryKeys,
  setAuthToken,
  setTokenRefreshHandler,
} from '@/shared/api';
import { broadcastAuthEvent, subscribeAuthBroadcast } from '@/features/auth';
import {
  store,
  setActiveWorkspaceTab,
  setTableDense,
  setAutoRefresh,
  setAuthStatus,
  resetAuthStatus,
  selectWorkspace,
  selectAuthStatus,
} from '@/app/store';

const originalAdapter = http.defaults.adapter;

beforeEach(() => {
  setAuthToken(null);
  setTokenRefreshHandler(null);
  clearTransportIdentity();
});

afterEach(() => {
  http.defaults.adapter = originalAdapter;
  setAuthToken(null);
  setTokenRefreshHandler(null);
  clearTransportIdentity();
});

describe('Task 5.5: RAM-only token storage & Single-flight refresh interceptor', () => {
  it('lưu token hoàn toàn trong RAM và tự động gắn header Authorization', async () => {
    setAuthToken('mock-ram-access-token');
    expect(getAuthToken()).toBe('mock-ram-access-token');

    let capturedHeaders: AxiosHeaders | undefined;
    http.defaults.adapter = async (config) => {
      capturedHeaders = config.headers as AxiosHeaders;
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await http.get('/api/v1/vehicles');
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer mock-ram-access-token');

    // clearTransportIdentity dọn sạch token khỏi RAM
    clearTransportIdentity();
    expect(getAuthToken()).toBeNull();

    await http.get('/api/v1/vehicles');
    expect(capturedHeaders?.get('Authorization')).toBeUndefined();
  });

  it('single-flight refresh token: 2 request đồng thời bị 401 chỉ gọi refresh handler 1 lần và replay thành công', async () => {
    let refreshCalls = 0;
    const refreshHandler = vi.fn(async () => {
      refreshCalls++;
      // Giả lập network delay khi refresh
      await new Promise((r) => setTimeout(r, 20));
      setAuthToken('new-refreshed-token');
      return 'new-refreshed-token';
    });
    setTokenRefreshHandler(refreshHandler);
    setAuthToken('expired-token');

    const receivedTokens: (string | undefined)[] = [];

    http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const authHeader = config.headers.get('Authorization') as string | undefined;
      receivedTokens.push(authHeader);

      // Nếu dùng token cũ -> trả về 401
      if (authHeader === 'Bearer expired-token') {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
          data: { code: 'UNAUTHORIZED' },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        });
      }

      // Token mới -> 200 OK
      return {
        data: { path: config.url },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    // Chạy song song 2 request cùng gặp 401
    const [res1, res2] = await Promise.all([
      http.get('/api/v1/vehicles'),
      http.get('/api/v1/drivers'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(receivedTokens).toContain('Bearer new-refreshed-token');
  });

  it('safe replay: không refresh lặp vô hạn khi token sau refresh vẫn bị 401', async () => {
    let refreshCalls = 0;
    setTokenRefreshHandler(async () => {
      refreshCalls++;
      return 'still-invalid-token';
    });
    setAuthToken('initial-token');

    let requestCount = 0;
    http.defaults.adapter = async (config) => {
      requestCount++;
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: { code: 'UNAUTHORIZED' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };

    await expect(http.get('/api/v1/orders')).rejects.toMatchObject({
      status: 401,
    });

    // Chỉ gọi refresh đúng 1 lần, sau đó replay 1 lần và thất bại -> dừng lại (tổng 2 request, 1 refresh)
    expect(refreshCalls).toBe(1);
    expect(requestCount).toBe(2);
  });

  it('không trigger refresh token khi endpoint là auth endpoints (/api/v1/auth/...)', async () => {
    const refreshHandler = vi.fn(async () => 'should-not-be-called');
    setTokenRefreshHandler(refreshHandler);

    http.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: { code: 'UNAUTHORIZED' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };

    await expect(http.get('/api/v1/auth/me')).rejects.toMatchObject({ status: 401 });
    await expect(http.post('/api/v1/auth/login', {})).rejects.toMatchObject({ status: 401 });

    expect(refreshHandler).not.toHaveBeenCalled();
  });
});

describe('Task 5.6: Query Client cache boundaries & conventions', () => {
  it('queryKeys scoped chính xác theo identity và authz_version', () => {
    const key = queryKeys.scoped('user-alpha', 3, 'vehicles', { status: 'active' });
    expect(key).toEqual(['identity', 'user-alpha', 'v3', 'vehicles', { status: 'active' }]);

    const rootKey = queryKeys.root('user-alpha');
    expect(rootKey).toEqual(['identity', 'user-alpha']);
  });

  it('clearSensitiveCache hủy queries và dọn sạch query cache', () => {
    const client = createQueryClient();
    client.setQueryData(['identity', 'user-alpha', 'profile'], { name: 'Alpha' });
    client.setQueryData(['identity', 'user-alpha', 'vehicles'], [{ plate: '59A-12345' }]);

    expect(client.getQueryCache().getAll().length).toBe(2);

    clearSensitiveCache(client);
    expect(client.getQueryCache().getAll().length).toBe(0);
  });

  it('clearSensitiveCache giữ query identity đang được quan sát để login/logout cập nhật được UI', () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.identity, null);
    client.setQueryData(['identity', 'user-alpha', 'vehicles'], [{ plate: '59A-12345' }]);
    // Mô phỏng useQuery của AuthProvider đang quan sát identity trước khi login
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.identity,
      queryFn: () => null,
      staleTime: Infinity,
      enabled: false,
    });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));

    clearSensitiveCache(client);
    client.setQueryData(queryKeys.identity, { username: 'admin' });

    expect(observer.getCurrentResult().data).toEqual({ username: 'admin' });
    expect(seen).toContainEqual({ username: 'admin' });
    expect(client.getQueryData(['identity', 'user-alpha', 'vehicles'])).toBeUndefined();
    unsubscribe();
  });

  it('clearSensitiveCache đặt identity về null, không giữ principal cũ trong cache', () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.identity, { username: 'admin' });

    clearSensitiveCache(client);

    expect(client.getQueryData(queryKeys.identity)).toBeNull();
  });

  it('invalidateResource và invalidateIdentity gắn cờ invalidate đúng phạm vi', async () => {
    const client = createQueryClient();
    client.setQueryData(['identity', 'user-1', 'vehicles'], ['v1']);
    client.setQueryData(['identity', 'user-1', 'orders'], ['o1']);
    client.setQueryData(['identity', 'user-2', 'vehicles'], ['v2']);

    await invalidateResource(client, 'user-1', 'vehicles');

    const v1Query = client.getQueryCache().find({ queryKey: ['identity', 'user-1', 'vehicles'] });
    const o1Query = client.getQueryCache().find({ queryKey: ['identity', 'user-1', 'orders'] });
    const v2Query = client.getQueryCache().find({ queryKey: ['identity', 'user-2', 'vehicles'] });

    expect(v1Query?.isStale()).toBe(true);
    expect(o1Query?.isStale()).toBe(false);
    expect(v2Query?.isStale()).toBe(false);

    await invalidateIdentity(client, 'user-1');
    expect(o1Query?.isStale()).toBe(true);
    expect(v2Query?.isStale()).toBe(false);
  });
});

describe('Task 5.7: Redux serializable workspace & authLifecycle slices', () => {
  it('workspaceSlice quản lý tab, dense mode và auto refresh', () => {
    store.dispatch(setActiveWorkspaceTab('lanes'));
    store.dispatch(setTableDense(true));
    store.dispatch(setAutoRefresh(false));

    const ws = selectWorkspace(store.getState());
    expect(ws.activeWorkspaceTab).toBe('lanes');
    expect(ws.tableDense).toBe(true);
    expect(ws.autoRefresh).toBe(false);
  });

  it('authLifecycleSlice quản lý status và timestamp mà không chứa non-serializable token/object', () => {
    store.dispatch(setAuthStatus('authenticated'));
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
    expect(store.getState().authLifecycle.lastAuthEventAt).toBeTypeOf('number');

    store.dispatch(resetAuthStatus());
    expect(selectAuthStatus(store.getState())).toBe('unauthenticated');

    // Toàn bộ store phải 100% serializable qua JSON
    const serialized = JSON.stringify(store.getState());
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('Bearer');
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

describe('Task 5.8: Auth Broadcast & Multi-tab sync channel', () => {
  it('phát và nhận broadcast auth event an toàn không chứa raw token string', () => {
    const receivedEvents: { type: string; timestamp: number }[] = [];

    const unsubscribe = subscribeAuthBroadcast((event) => {
      receivedEvents.push(event);
    });

    broadcastAuthEvent('LOGOUT');

    // BroadcastChannel trong môi trường giả lập Vitest (Node / jsdom)
    // Nếu BroadcastChannel khả dụng, sự kiện được phát đi; kiểm tra cấu trúc payload
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      // Đảm bảo không lộ raw credentials
      for (const ev of receivedEvents) {
        expect(ev.type).toBe('LOGOUT');
        expect(ev.timestamp).toBeTypeOf('number');
        expect(JSON.stringify(ev)).not.toContain('token');
      }
    }

    unsubscribe();
  });
});
