import { QueryClient } from '@tanstack/react-query';
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
  identity: ['identity'] as const,
  resource: (
    identity: string,
    name: string,
    filters: Record<string, string | number | null> = {},
  ) => ['identity', identity, name, filters] as const,
};
