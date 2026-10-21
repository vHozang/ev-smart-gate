import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import { useFeedback, openDetailModal } from '@/shared/feedback';
import { listGateLogs } from './api';
import type { GateLog, Direction, VerificationStatus } from './api';
import { GateLogDetail } from './components/GateLogDetail';

export interface GateLogsScreen {
  data: {
    rows: GateLog[];
    loaded: number | null;
  };
  state: {
    search: string;
    directionFilter: 'ALL' | Direction;
    statusFilter: 'ALL' | VerificationStatus;
    limit: number;
    loading: boolean;
    fetching: boolean;
    error: Error | null;
    canViewEvidence: boolean;
  };
  actions: {
    setSearch: (value: string) => void;
    setDirectionFilter: (value: 'ALL' | Direction) => void;
    setStatusFilter: (value: 'ALL' | VerificationStatus) => void;
    setLimit: (value: number) => void;
    resetFilters: () => void;
    refresh: () => Promise<unknown>;
    inspectLog: (log: GateLog) => void;
  };
}

export interface UseGateLogsScreenOptions {
  enabled?: boolean;
}

export function useGateLogsScreen(options?: UseGateLogsScreenOptions): GateLogsScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | Direction>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VerificationStatus>('ALL');
  const [limit, setLimit] = useState(100);
  const pid = principal?.id || 'anonymous';
  const canViewEvidence = can('gate-evidence:read');
  const isEnabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: [
      ...queryKeys.resource(pid, 'gate-logs'),
      {
        limit,
        direction: directionFilter === 'ALL' ? null : directionFilter,
        verification_status: statusFilter === 'ALL' ? null : statusFilter,
      },
    ],
    queryFn: ({ signal }) =>
      listGateLogs(
        {
          limit,
          direction: directionFilter === 'ALL' ? null : directionFilter,
          verification_status: statusFilter === 'ALL' ? null : statusFilter,
        },
        signal,
      ),
    enabled: isEnabled && !!principal && can('gate-logs:read'),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    const all = query.data || [];
    if (!term) return all;
    return all.filter((item) =>
      [
        item.event_id,
        item.observed_plate,
        item.verification_status,
        item.barrier_status,
        ...item.reason_codes,
      ].some((val) => val?.toLocaleLowerCase('vi').includes(term)),
    );
  }, [query.data, search]);

  function inspectLog(log: GateLog) {
    openDetailModal(feedback, {
      id: `gate-log-detail-${log.id}`,
      title: `Nhật ký cổng: ${log.observed_plate || log.event_id}`,
      description:
        'Tách biệt quan sát AI, quyết định xác minh nghiệp vụ, kết quả barrier và bằng chứng ảnh.',
      renderContent: () => <GateLogDetail log={log} canViewEvidence={canViewEvidence} />,
    });
  }

  return {
    data: {
      rows,
      loaded: query.data?.length ?? null,
    },
    state: {
      search,
      directionFilter,
      statusFilter,
      limit,
      loading: query.isPending,
      fetching: query.isFetching,
      error: query.error,
      canViewEvidence,
    },
    actions: {
      setSearch,
      setDirectionFilter,
      setStatusFilter,
      setLimit,
      resetFilters: () => {
        setSearch('');
        setDirectionFilter('ALL');
        setStatusFilter('ALL');
        setLimit(100);
      },
      refresh: query.refetch,
      inspectLog,
    },
  };
}
