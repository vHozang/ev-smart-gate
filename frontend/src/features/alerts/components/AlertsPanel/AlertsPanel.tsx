import { useState, useMemo, useEffect } from 'react';
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  ProhibitIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { useAlertsScreen } from '../../useAlertsScreen';
import type { AlertsScreen } from '../../useAlertsScreen';
import type { AlertItem, AlertSeverity, AlertStatus } from '../../api';
import type { AlertSyncStatus } from '../../wsClient';

const severityToneMap: Record<AlertSeverity, 'danger' | 'warning' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

const statusToneMap: Record<AlertStatus, 'danger' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'danger',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
  FALSE_POSITIVE: 'neutral',
};

const statusLabelMap: Record<AlertStatus, string> = {
  OPEN: 'Đang mở (OPEN)',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  RESOLVED: 'Đã xử lý',
  FALSE_POSITIVE: 'Báo động giả',
};

export interface AlertSyncBadgeProps {
  syncStatus: AlertSyncStatus;
  hasHistoryGap: boolean;
}

export function AlertSyncBadge({ syncStatus, hasHistoryGap }: AlertSyncBadgeProps) {
  if (hasHistoryGap || syncStatus === 'gap_detected') {
    return <Badge tone="warning">Thiếu khoảng lịch sử (History Gap)</Badge>;
  }
  switch (syncStatus) {
    case 'synced':
      return <Badge tone="success">Đã đồng bộ realtime</Badge>;
    case 'connecting':
    case 'syncing':
      return <Badge tone="neutral">Đang đồng bộ…</Badge>;
    case 'reconnecting':
      return <Badge tone="warning">Đang kết nối lại…</Badge>;
    case 'degraded':
      return <Badge tone="danger">Mất kết nối realtime</Badge>;
    default:
      return <Badge tone="neutral">Chờ kết nối</Badge>;
  }
}

export interface AlertsPanelProps {
  screen?: AlertsScreen;
  hideHeaderActions?: boolean;
}

export function AlertsPanel({ screen, hideHeaderActions = false }: AlertsPanelProps = {}) {
  const internalScreen = useAlertsScreen({ enabled: !screen });
  const { data, state, actions } = screen ?? internalScreen;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [state.search, state.statusFilter, state.severityFilter]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(data.rows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.rows.slice(start, start + pageSize);
  }, [data.rows, safePage, pageSize]);

  const hasActiveFilters = Boolean(
    state.search || state.statusFilter !== 'ALL' || state.severityFilter !== 'ALL',
  );

  const columns: TableColumn<AlertItem>[] = [
    {
      id: 'sequence',
      header: 'Seq / Loại cảnh báo',
      render: (row) => (
        <>
          <span className="table-main mono">
            #{row.sequence} · {row.alert_type}
          </span>
          <span className="table-secondary">
            {row.occurred_at ? new Date(row.occurred_at).toLocaleString('vi-VN') : row.event_id}
          </span>
        </>
      ),
    },
    {
      id: 'severity',
      header: 'Mức độ',
      render: (row) => <Badge tone={severityToneMap[row.severity]}>{row.severity}</Badge>,
    },
    {
      id: 'message',
      header: 'Nội dung cảnh báo (hiển thị an toàn)',
      render: (row) => (
        <>
          {/* Hiển thị text thuần đã escape của React, không bao giờ chèn HTML/script */}
          <span className="table-main">{row.message}</span>
          {Object.keys(row.data || {}).length > 0 && (
            <span className="table-secondary mono" style={{ wordBreak: 'break-all' }}>
              {JSON.stringify(row.data)}
            </span>
          )}
        </>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái xử lý',
      render: (row) => <Badge tone={statusToneMap[row.status]}>{statusLabelMap[row.status]}</Badge>,
    },
    {
      id: 'actions',
      header: 'Thao tác phản ứng',
      render: (row) => {
        const isPending = state.updatingId === row.id;
        if (!state.canUpdate) {
          return <span className="table-secondary">Chỉ xem</span>;
        }
        return (
          <div className="table-actions">
            {row.status === 'OPEN' && (
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckIcon size={15} />}
                pending={isPending}
                onClick={() => void actions.transitionAlert(row, 'ACKNOWLEDGED')}
              >
                Tiếp nhận
              </Button>
            )}
            {(row.status === 'OPEN' || row.status === 'ACKNOWLEDGED') && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<CheckCircleIcon size={15} />}
                  pending={isPending}
                  onClick={() => void actions.transitionAlert(row, 'RESOLVED')}
                >
                  Đã xử lý
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ProhibitIcon size={15} />}
                  pending={isPending}
                  onClick={() => void actions.transitionAlert(row, 'FALSE_POSITIVE')}
                >
                  Báo động giả
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const isInitialLoading =
    (state.syncStatus === 'connecting' || state.syncStatus === 'syncing') &&
    data.totalCount === 0 &&
    !state.error;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }} data-testid="alerts-panel">
      {/* Cảnh báo rõ ràng khi xảy ra mất khoảng sự kiện (410 ALERT_HISTORY_GAP / 4409) */}
      {state.hasHistoryGap && (
        <div
          role="alert"
          data-testid="alerts-history-gap-banner"
          className="inline-note"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <WarningIcon size={20} />
            <div>
              <strong>Phát hiện thiếu khoảng lịch sử cảnh báo (ALERT_HISTORY_GAP)</strong>
              <div style={{ fontSize: 'var(--text-xs)' }}>
                {state.gapWarning ||
                  'Một số sự kiện cũ không còn trong bộ đệm máy chủ; danh sách hiện tại không khẳng định đã đồng bộ đầy đủ 100%.'}
              </div>
            </div>
          </div>
          <Button size="sm" onClick={() => void actions.resync()}>
            Nạp lại snapshot
          </Button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <DataTableFilter
          search={state.search}
          onSearchChange={actions.setSearch}
          searchPlaceholder="Tìm nội dung cảnh báo, loại sự kiện, sequence…"
          hasActiveFilters={hasActiveFilters}
          onReset={actions.resetFilters}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Select
              aria-label="Lọc trạng thái cảnh báo"
              value={state.statusFilter}
              onChange={(e) => actions.setStatusFilter(e.target.value as typeof state.statusFilter)}
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="OPEN">Đang mở (OPEN)</option>
              <option value="ACKNOWLEDGED">Đã tiếp nhận (ACKNOWLEDGED)</option>
              <option value="RESOLVED">Đã xử lý (RESOLVED)</option>
              <option value="FALSE_POSITIVE">Báo động giả (FALSE_POSITIVE)</option>
            </Select>
            <Select
              aria-label="Lọc mức độ nghiêm trọng"
              value={state.severityFilter}
              onChange={(e) =>
                actions.setSeverityFilter(e.target.value as typeof state.severityFilter)
              }
            >
              <option value="ALL">Mọi mức độ</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </Select>
          </div>
        </DataTableFilter>

        {!hideHeaderActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertSyncBadge syncStatus={state.syncStatus} hasHistoryGap={state.hasHistoryGap} />
            {state.invalidEventCount > 0 && (
              <Badge tone="warning">Đã cô lập {state.invalidEventCount} gói tin lỗi</Badge>
            )}
            <Button
              icon={<ArrowClockwiseIcon size={17} />}
              onClick={() => void actions.resync()}
              pending={state.syncStatus === 'syncing'}
            >
              Đồng bộ lại
            </Button>
          </div>
        )}
      </div>

      <AsyncBoundary onReset={() => void actions.resync()}>
        <SpotlightCard padded={false}>
          {isInitialLoading ? (
            <Skeleton />
          ) : state.error && data.totalCount === 0 ? (
            <StatePanel
              kind={state.error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được danh sách cảnh báo an ninh"
              requestId={state.error.requestId}
              action={<Button onClick={() => void actions.resync()}>Thử lại</Button>}
            >
              {state.error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Danh sách cảnh báo an ninh thời gian thực"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={
                hasActiveFilters ? 'Không có cảnh báo phù hợp' : 'Không có cảnh báo an ninh mới'
              }
              action={
                hasActiveFilters ? (
                  <Button onClick={actions.resetFilters}>Xóa bộ lọc</Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Thử thay đổi bộ lọc trạng thái hoặc mức độ nghiêm trọng.'
                : 'Hệ thống đang lắng nghe sự kiện bất thường theo thời gian thực.'}
            </EmptyState>
          )}
        </SpotlightCard>
      </AsyncBoundary>

      {data.rows.length > 0 && (
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={data.rows.length}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
