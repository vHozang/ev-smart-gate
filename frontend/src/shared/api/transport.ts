import axios from 'axios';
import { normalizeError } from './errors';

export const http = axios.create({
  baseURL: '/',
  timeout: 20_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

let generation = 0;
let credentialHeaders: () => Record<string, string> = () => ({});
let inMemoryAccessToken: string | null = null;
let tokenRefreshHandler: (() => Promise<string | null>) | null = null;
let activeRefreshPromise: Promise<string | null> | null = null;

const pending = new Set<AbortController>();

export function configureCredentials(provider: () => Record<string, string>) {
  credentialHeaders = provider;
}

export function setAuthToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryAccessToken;
}

export function setTokenRefreshHandler(handler: (() => Promise<string | null>) | null) {
  tokenRefreshHandler = handler;
}

export function clearTransportIdentity() {
  generation += 1;
  inMemoryAccessToken = null;
  activeRefreshPromise = null;
  for (const controller of pending) controller.abort();
  pending.clear();
}

http.interceptors.request.use((config) => {
  const epoch = generation;
  const controller = new AbortController();
  pending.add(controller);
  const originalSignal = config.signal;
  const abort = () => controller.abort();
  if (originalSignal?.aborted) controller.abort();
  originalSignal?.addEventListener?.('abort', abort, { once: true });
  config.signal = controller.signal;

  // Gắn token RAM nếu có và chưa tự cấu hình
  if (inMemoryAccessToken && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  // Gắn các headers credentials bổ sung (ví dụ X-CSRF-Token)
  for (const [name, value] of Object.entries(credentialHeaders())) {
    config.headers.set(name, value);
  }

  // Tài nguyên ngoài Redux; giải phóng listener cả khi request thất bại.
  Object.assign(config, {
    identityEpoch: epoch,
    finishRequest: () => {
      pending.delete(controller);
      originalSignal?.removeEventListener?.('abort', abort);
    },
  });
  return config;
});

function finish(config: unknown) {
  if (typeof config !== 'object' || config === null) return;
  if ('finishRequest' in config && typeof config.finishRequest === 'function') {
    config.finishRequest();
  }
}

http.interceptors.response.use(
  (response) => {
    finish(response.config);
    if ('identityEpoch' in response.config && response.config.identityEpoch !== generation) {
      throw new axios.CanceledError('Identity changed');
    }
    return response;
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      finish(error.config);
      const config = error.config as typeof error.config & {
        _retry?: boolean;
        identityEpoch?: number;
      };
      const status = error.response?.status;
      const url = config?.url || '';

      // Không refresh khi 403 Forbidden
      // Không refresh khi chính URL là auth endpoint để tránh infinite loop
      // Tối đa 1 safe replay (_retry flag)
      const isAuthEndpoint = /\/api\/v\d+\/auth\/(?:login|logout|refresh|me)/i.test(url);

      if (status === 401 && config && !config._retry && !isAuthEndpoint && tokenRefreshHandler) {
        config._retry = true;
        try {
          // Single-flight refresh token
          if (!activeRefreshPromise) {
            activeRefreshPromise = tokenRefreshHandler().finally(() => {
              activeRefreshPromise = null;
            });
          }
          const newToken = await activeRefreshPromise;
          if (newToken && config.identityEpoch === generation) {
            config.headers.set('Authorization', `Bearer ${newToken}`);
            return http(config);
          }
        } catch {
          // Bỏ qua lỗi refresh và reject theo normalizeError bên dưới
        }
      }
    }
    return Promise.reject(axios.isCancel(error) ? error : normalizeError(error));
  },
);

export function captureIdentityGuard(): () => boolean {
  const expected = generation;
  return () => expected === generation;
}
