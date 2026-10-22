import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/api';
import { useFeedback, openDetailModal } from '@/shared/feedback';
import type { AuditView, AuditOutcome } from '../model/schema';
import { listAuditLogs } from '../api/audit';
import { AuditDetail } from '../components/AuditDetail';

export interface AuditScreenData {
  rows: AuditView[];
  total: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  hasPrevCursor: boolean;
}

export interface AuditScreenState {
  search: string;
  targetTypeFilter: string;
  outcomeFilter: string;
  unavailable: boolean;
  loading: boolean;
  fetching: boolean;
  error: unknown;
}

export interface AuditScreenActions {
  setSearch: (v: string) => void;
  setTargetTypeFilter: (v: string) => void;
  setOutcomeFilter: (v: string) => void;
  nextCursorPage: () => void;
  prevCursorPage: () => void;
  refresh: () => Promise<unknown>;
  openDetail: (audit: AuditView) => void;
}

export interface AuditScreen {
  data: AuditScreenData;
  state: AuditScreenState;
  actions: AuditScreenActions;
}

export function useAuditScreen(): AuditScreen {
  const { principal } = useAuth();
  const feedback = useFeedback();

  const [search, setSearch] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);

  const auditQueryKey = queryKeys.resource(principal?.id || 'anonymous', 'admin:audit', {
    cursor: cursor ?? null,
    target_type: targetTypeFilter || null,
    outcome: outcomeFilter || null,
  });

  const query = useQuery({
    queryKey: auditQueryKey,
    queryFn: ({ signal }) =>
      listAuditLogs(
        {
          cursor,
          limit: 50,
          target_type: targetTypeFilter || undefined,
          outcome: (outcomeFilter as AuditOutcome) || undefined,
        },
        signal,
      ),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const filteredLogs = useMemo(() => {
    const rawItems = query.data?.items || [];
    return rawItems.filter((log) => {
      const matchSearch =
        !search.trim() ||
        log.action.toLowerCase().includes(search.trim().toLowerCase()) ||
        log.target_id.toLowerCase().includes(search.trim().toLowerCase()) ||
        log.request_id.toLowerCase().includes(search.trim().toLowerCase());

      const matchType =
        !targetTypeFilter ||
        log.target_type.toLowerCase() === targetTypeFilter.trim().toLowerCase();
      const matchOutcome = !outcomeFilter || log.outcome === (outcomeFilter as AuditOutcome);

      return matchSearch && matchType && matchOutcome;
    });
  }, [query.data?.items, search, targetTypeFilter, outcomeFilter]);

  const openDetail = (audit: AuditView) => {
    openDetailModal(feedback, {
      id: `audit-detail-${audit.id}`,
      title: `Nhật ký kiểm toán: ${audit.action}`,
      description: `Bản ghi vết nghiệp vụ ngày ${new Date(audit.occurred_at).toLocaleDateString('vi-VN')}.`,
      renderContent: () => <AuditDetail audit={audit} />,
    });
  };

  return {
    data: {
      rows: filteredLogs,
      total: query.data?.total ?? filteredLogs.length,
      hasMore: query.data?.has_more ?? false,
      nextCursor: query.data?.next_cursor ?? null,
      hasPrevCursor: cursorHistory.length > 0,
    },
    state: {
      search,
      targetTypeFilter,
      outcomeFilter,
      unavailable: !principal,
      loading: Boolean(principal) && query.isPending,
      fetching: query.isFetching,
      error: query.error,
    },
    actions: {
      setSearch,
      setTargetTypeFilter: (v) => {
        setTargetTypeFilter(v);
        setCursor(undefined);
        setCursorHistory([]);
      },
      setOutcomeFilter: (v) => {
        setOutcomeFilter(v);
        setCursor(undefined);
        setCursorHistory([]);
      },
      nextCursorPage: () => {
        if (query.data?.next_cursor) {
          setCursorHistory((prev) => [...prev, cursor]);
          setCursor(query.data.next_cursor);
        }
      },
      prevCursorPage: () => {
        setCursorHistory((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const prevCur = next.pop();
          setCursor(prevCur);
          return next;
        });
      },
      refresh: query.refetch,
      openDetail,
    },
  };
}
