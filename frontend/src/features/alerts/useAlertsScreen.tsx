import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { normalizeError } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import { updateAlertStatus } from './api';
import type { AlertItem, AlertSeverity, AlertStatus } from './api';
import { AlertsStreamController } from './wsClient';
import type { AlertsStreamState } from './wsClient';

export interface AlertsScreen {
  data: {
    rows: AlertItem[];
    totalCount: number;
    openCount: number;
  };
  state: {
    search: string;
    statusFilter: 'ALL' | AlertStatus;
    severityFilter: 'ALL' | AlertSeverity;
    syncStatus: AlertsStreamState['syncStatus'];
    hasHistoryGap: boolean;
    gapWarning: string | null;
    invalidEventCount: number;
    lastSyncedAt: string | null;
    error: ApiError | null;
    updatingId: string | null;
    canRead: boolean;
    canUpdate: boolean;
  };
  actions: {
    setSearch: (value: string) => void;
    setStatusFilter: (value: 'ALL' | AlertStatus) => void;
    setSeverityFilter: (value: 'ALL' | AlertSeverity) => void;
    resetFilters: () => void;
    resync: () => Promise<void>;
    transitionAlert: (alert: AlertItem, targetStatus: AlertStatus) => Promise<void>;
  };
}

const initialStreamState: AlertsStreamState = {
  items: [],
  syncStatus: 'idle',
  highestSequence: 0,
  hasHistoryGap: false,
  gapWarning: null,
  invalidEventCount: 0,
  lastSyncedAt: null,
  error: null,
};

export interface UseAlertsScreenOptions {
  enabled?: boolean;
}

export function useAlertsScreen(options?: UseAlertsScreenOptions): AlertsScreen {
  const { principal, can } = useAuth();
  const feedback = useFeedback();
  const canRead = Boolean(principal && can('alerts:read'));
  const canUpdate = Boolean(principal && can('alerts:update'));
  const isEnabled = options?.enabled ?? true;

  const [streamState, setStreamState] = useState<AlertsStreamState>(initialStreamState);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const controllerRef = useRef<AlertsStreamController | null>(null);

  useEffect(() => {
    if (!isEnabled || !canRead || !principal) {
      setStreamState(initialStreamState);
      return;
    }

    const controller = new AlertsStreamController({
      authSource: principal.source,
      onStateChange: (next) => {
        setStreamState(next);
      },
    });
    controllerRef.current = controller;
    void controller.start();

    return () => {
      controller.stop();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [isEnabled, canRead, principal]);

  const resync = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.resyncFromRest(0);
  }, []);

  const transitionAlert = useCallback(
    async (alert: AlertItem, targetStatus: AlertStatus) => {
      if (!canUpdate || updatingId) return;
      setUpdatingId(alert.id);
      try {
        const updated = await updateAlertStatus(alert.id, targetStatus);
        controllerRef.current?.applyLocalUpdate(updated);
        const labelMap: Record<AlertStatus, string> = {
          OPEN: 'Mở lại',
          ACKNOWLEDGED: 'Đã tiếp nhận',
          RESOLVED: 'Đã xử lý xong',
          FALSE_POSITIVE: 'Đánh dấu báo động giả',
        };
        feedback.notify({
          id: `alert-status-${updated.id}-${updated.status}`,
          tone: 'success',
          title: `${labelMap[targetStatus]} cảnh báo #${updated.sequence}`,
          description: updated.message,
        });
      } catch (cause) {
        const safe = normalizeError(cause);
        feedback.notify({
          id: `alert-error-${alert.id}`,
          tone: 'error',
          title: 'Không thể cập nhật trạng thái cảnh báo',
          description: safe.message,
        });
      } finally {
        setUpdatingId(null);
      }
    },
    [canUpdate, feedback, updatingId],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    return streamState.items.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
      if (!term) return true;
      return [item.alert_type, item.message, item.event_id, String(item.sequence)].some((val) =>
        val?.toLocaleLowerCase('vi').includes(term),
      );
    });
  }, [streamState.items, statusFilter, severityFilter, search]);

  const openCount = useMemo(
    () => streamState.items.filter((a) => a.status === 'OPEN').length,
    [streamState.items],
  );

  return {
    data: {
      rows,
      totalCount: streamState.items.length,
      openCount,
    },
    state: {
      search,
      statusFilter,
      severityFilter,
      syncStatus: streamState.syncStatus,
      hasHistoryGap: streamState.hasHistoryGap,
      gapWarning: streamState.gapWarning,
      invalidEventCount: streamState.invalidEventCount,
      lastSyncedAt: streamState.lastSyncedAt,
      error: streamState.error,
      updatingId,
      canRead,
      canUpdate,
    },
    actions: {
      setSearch,
      setStatusFilter,
      setSeverityFilter,
      resetFilters: () => {
        setSearch('');
        setStatusFilter('ALL');
        setSeverityFilter('ALL');
      },
      resync,
      transitionAlert,
    },
  };
}
