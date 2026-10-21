import type { ListScreen } from '@/shared/api';
import type { Driver } from './api';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import { listDrivers } from './api';
export function useDriversScreen(): ListScreen<Driver> {
  const { principal, can } = useAuth();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.resource(principal?.id || 'anonymous', 'drivers'),
    queryFn: ({ signal }) => listDrivers(signal),
    enabled: !!principal && can('drivers:read'),
  });
  const rows = useMemo(
    () =>
      (query.data || []).filter((row) =>
        [row.full_name, row.employee_code].some((value) =>
          value?.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')),
        ),
      ),
    [query.data, search],
  );
  return {
    data: { rows, loaded: query.data?.length ?? null },
    state: { loading: query.isPending, fetching: query.isFetching, error: query.error, search },
    actions: { refresh: query.refetch, setSearch },
  };
}
