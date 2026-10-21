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
const pending = new Set<AbortController>();
export function configureCredentials(provider: () => Record<string, string>) {
  credentialHeaders = provider;
}
export function clearTransportIdentity() {
  generation += 1;
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
  for (const [name, value] of Object.entries(credentialHeaders())) config.headers.set(name, value);
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
  if ('finishRequest' in config && typeof config.finishRequest === 'function')
    config.finishRequest();
}
http.interceptors.response.use(
  (response) => {
    finish(response.config);
    if ('identityEpoch' in response.config && response.config.identityEpoch !== generation)
      throw new axios.CanceledError('Identity changed');
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) finish(error.config);
    return Promise.reject(axios.isCancel(error) ? error : normalizeError(error));
  },
);

export function captureIdentityGuard(): () => boolean {
  const expected = generation;
  return () => expected === generation;
}
