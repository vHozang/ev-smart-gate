import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  clearTransportIdentity,
  configureCredentials,
  createQueryClient,
  http,
  normalizeError,
  parsePayload,
  queryKeys,
} from '@/shared/api';
import { safeInternalPath } from '@/shared/lib';
const adapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = adapter;
  configureCredentials(() => ({}));
  clearTransportIdentity();
});
describe('API boundary', () => {
  it('giữ error code/request ID, không render HTML hoặc raw exception', () => {
    const error = new AxiosError('private internals', 'ERR_BAD_RESPONSE', undefined, undefined, {
      data: '<html>secret</html>',
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'x-request-id': 'request-31' },
      config: { headers: new AxiosHeaders() },
    });
    const safe = normalizeError(error);
    expect(safe.status).toBe(502);
    expect(safe.requestId).toBe('request-31');
    expect(safe.message).not.toContain('secret');
    expect(safe.message).not.toContain('private');
  });
  it('từ chối payload thiếu required field tại boundary', () => {
    expect(() =>
      parsePayload(
        z.object({ id: z.uuid(), score: z.number().finite().nullable() }).strict(),
        { score: null },
        'request-42',
      ),
    ).toThrow(ApiError);
    expect(
      parsePayload(z.object({ score: z.number().finite().nullable() }), { score: null }),
    ).toEqual({ score: null });
  });
  it('không refresh hoặc retry mutation ở transport khi 403', async () => {
    let calls = 0;
    const fake: AxiosAdapter = async (config) => {
      calls++;
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, {
        data: { error: { code: 'FORBIDDEN', message: 'Thiếu quyền', details: {} } },
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
      });
    };
    http.defaults.adapter = fake;
    await expect(http.post('/api/v1/vehicles', {})).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(calls).toBe(1);
  });
  it('loại response đến muộn sau đổi identity', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    http.defaults.adapter = async (config) => {
      started?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { data: { id: 'old-user' }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const promise = http.get('/api/v1/vehicles');
    await ready;
    clearTransportIdentity();
    release?.();
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });
  it('chuyển AbortSignal và headers qua adapter, không serialize FormData', async () => {
    const controller = new AbortController();
    let seen: InternalAxiosRequestConfig | undefined;
    configureCredentials(() => ({ 'X-CSRF-Token': 'unit-only-csrf' }));
    http.defaults.adapter = async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    const form = new FormData();
    form.set('full_name', 'Hồ sơ test cô lập');
    await http.post('/api/v1/drivers', form, { signal: controller.signal });
    expect(seen?.data).toBe(form);
    expect(seen?.headers.get('X-CSRF-Token')).toBe('unit-only-csrf');
    expect(seen?.signal).toBeDefined();
  });
  it('cache phân biệt identity, mutation không tự retry', () => {
    expect(queryKeys.resource('operator-1', 'vehicles')).not.toEqual(
      queryKeys.resource('operator-2', 'vehicles'),
    );
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
describe('redirect nội bộ', () => {
  it.each([
    'https://attacker.invalid',
    '//attacker.invalid',
    '/%2fhost',
    '/\\host',
    '/login?next=bad',
    '/%zz',
  ])('từ chối %s', (value) => expect(safeInternalPath(value)).toBe('/'));
  it('giữ path/query hợp lệ', () =>
    expect(safeInternalPath('/vehicles?q=59T1')).toBe('/vehicles?q=59T1'));
});

it('transport giữ nguyên binary và Content-Type của response', async () => {
  const binary = new Blob([new Uint8Array([0, 137, 80, 78, 71])], { type: 'image/png' });
  http.defaults.adapter = async (config) => ({
    data: binary,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'image/png' },
    config,
  });
  const response = await http.get('/api/v1/test-only-evidence', { responseType: 'blob' });
  expect(response.data).toBe(binary);
  expect(response.headers['content-type']).toBe('image/png');
});
