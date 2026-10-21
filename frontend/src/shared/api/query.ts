import { QueryClient, hashKey } from '@tanstack/react-query';
import { ApiError } from './errors';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          count < 1 && error instanceof ApiError && error.code === 'NETWORK_ERROR',
      },
      mutations: { retry: false },
    },
  });
}

export const queryKeys = {
  identity: ['identity', 'current'] as const,
  root: (identity: string) => ['identity', identity] as const,
  resource: (
    identity: string,
    name: string,
    filters: Record<string, string | number | boolean | null | undefined> = {},
  ) => ['identity', identity, name, filters] as const,
  scoped: (
    identity: string,
    authzVersion: number | string,
    name: string,
    filters: Record<string, string | number | boolean | null | undefined> = {},
  ) => ['identity', identity, `v${authzVersion}`, name, filters] as const,
  analytics: (
    identity: string,
    metric: string,
    period: string,
    filters: Record<string, string | number | boolean | null | undefined> = {},
  ) => ['identity', identity, 'analytics', metric, period, filters] as const,
};

/**
 * Vô hiệu hóa cache cho một tài nguyên cụ thể của identity hiện tại.
 */
export async function invalidateResource(
  client: QueryClient,
  identity: string,
  resource: string,
): Promise<void> {
  await client.invalidateQueries({
    queryKey: ['identity', identity, resource],
  });
}

/**
 * Vô hiệu hóa toàn bộ cache dữ liệu thuộc về một identity (khi đổi vai trò, đổi quyền).
 */
export async function invalidateIdentity(client: QueryClient, identity: string): Promise<void> {
  await client.invalidateQueries({
    queryKey: queryKeys.root(identity),
  });
}

/**
 * Dọn sạch toàn bộ cache khi login, logout hoặc thu hồi phiên.
 *
 * Query identity hiện tại được giữ lại nhưng đặt về null thay vì bị xóa: useQuery của AuthProvider
 * đang gắn với đúng instance query này. Nếu `client.clear()` hủy nó, `setQueryData` ngay sau đó tạo
 * query mới mà observer không nhận được, UI vẫn coi là chưa đăng nhập và Guard đẩy về trang login.
 */
export function clearSensitiveCache(client: QueryClient): void {
  void client.cancelQueries();
  const identityHash = hashKey(queryKeys.identity);
  client.removeQueries({ predicate: (query) => query.queryHash !== identityHash });
  if (client.getQueryCache().get(identityHash)) {
    client.setQueryData(queryKeys.identity, null);
  }
}
