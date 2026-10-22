import { useQuery } from '@tanstack/react-query';
import { getLiveness, getReadiness } from './api';
export function useSystemHealth() {
  const live = useQuery({
    queryKey: ['public', 'health', 'live'],
    queryFn: ({ signal }) => getLiveness(signal),
    staleTime: 10_000,
  });
  const ready = useQuery({
    queryKey: ['public', 'health', 'ready'],
    queryFn: ({ signal }) => getReadiness(signal),
    staleTime: 10_000,
  });
  return {
    data: {
      live: live.data,
      ready: ready.data,
      updatedAt: Math.max(live.dataUpdatedAt, ready.dataUpdatedAt),
    },
    state: {
      loading: live.isPending || ready.isPending,
      fetching: live.isFetching || ready.isFetching,
      liveError: live.error,
      readyError: ready.error,
    },
    actions: { refresh: () => Promise.all([live.refetch(), ready.refetch()]) },
  };
}
