import type { ListScreen } from '@/shared/api';
import type { WarehouseOrder } from './api';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import { listOrders } from './api';
export function useOrdersScreen(): ListScreen<WarehouseOrder> {
  const { principal, can } = useAuth();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.resource(principal?.id || 'anonymous', 'orders'),
    queryFn: ({ signal }) => listOrders(signal),
    enabled: !!principal && can('orders:read'),
  });
  const rows = useMemo(
    () =>
      (query.data || []).filter((row) =>
        row.order_id.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
      ),
    [query.data, search],
  );
  return {
    data: { rows, loaded: query.data?.length ?? null },
    state: { loading: query.isPending, fetching: query.isFetching, error: query.error, search },
    actions: { refresh: query.refetch, setSearch },
  };
}
