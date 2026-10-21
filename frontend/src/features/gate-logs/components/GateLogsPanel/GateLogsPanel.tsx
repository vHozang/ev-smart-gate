import { useState, useMemo, useEffect } from 'react';
import { ArrowClockwiseIcon, EyeIcon, CameraIcon } from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { DataTable, DataTableFilter, DataTablePagination } from '@/shared/ui/DataTable';
import type { TableColumn } from '@/shared/ui/DataTable';
import { Select } from '@/shared/ui/Select';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';
import { StatePanel, EmptyState } from '@/shared/ui/StatePanel';
import { AsyncBoundary } from '@/shared/ui/AsyncBoundary';
import { useGateLogsScreen } from '../../useGateLogsScreen';
import type { GateLogsScreen } from '../../useGateLogsScreen';
import type { GateLog } from '../../api';

export interface GateLogsPanelProps {
  screen?: GateLogsScreen;
  hideHeaderActions?: boolean;
}

export function GateLogsPanel({ screen, hideHeaderActions = false }: GateLogsPanelProps = {}) {
  const internalScreen = useGateLogsScreen({ enabled: !screen });
  const { data, state, actions } = screen ?? internalScreen;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [state.search, state.directionFilter, state.statusFilter, state.limit]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(data.rows.length / pageSize)));

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.rows.slice(start, start + pageSize);
  }, [data.rows, safePage, pageSize]);

  const hasActiveFilters = Boolean(
    state.search || state.directionFilter !== 'ALL' || state.statusFilter !== 'ALL',
  );

  const columns: TableColumn<GateLog>[] = [
    {
      id: 'event',
      header: 'Sự kiện / Thời gian',
      render: (row) => (
        <>
          <span className="table-main mono">{row.event_id}</span>
          <span className="table-secondary">
            {row.occurred_at ? new Date(row.occurred_at).toLocaleString('vi-VN') : 'Chưa ghi nhận'}
          </span>
        </>
      ),
    },
    {
      id: 'direction',
      header: 'Hướng cổng',
      render: (row) => (
        <Badge tone={row.direction === 'ENTRY' ? 'success' : 'neutral'}>
          {row.direction === 'ENTRY' ? 'Cổng vào (ENTRY)' : 'Cổng ra (EXIT)'}
        </Badge>
      ),
    },
    {
      id: 'observation',
      header: 'Quan sát AI (Biển số / Mặt)',
      render: (row) => (
        <>
          <span className="table-main mono">{row.observed_plate || '—'}</span>
          <span className="table-secondary">
            Biển số: {(row.plate_score * 100).toFixed(0)}% · Mặt 1:1:{' '}
            {(row.face_similarity * 100).toFixed(0)}%
          </span>
        </>
      ),
    },
    {
      id: 'decision',
      header: 'Quyết định xác minh',
      render: (row) => (
        <>
          <Badge
            tone={
              row.verification_status === 'PASSED'
                ? 'success'
                : row.verification_status === 'FAILED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {row.verification_status}
          </Badge>
          {row.reason_codes.length > 0 && (
            <span className="table-secondary mono">{row.reason_codes.slice(0, 2).join(', ')}</span>
          )}
        </>
      ),
    },
    {
      id: 'barrier',
      header: 'Trạng thái Barrier',
      render: (row) => (
        <Badge
          tone={
            row.barrier_status === 'OPENED'
              ? 'success'
              : row.barrier_status === 'FAILED'
                ? 'danger'
                : row.barrier_status === 'PENDING'
                  ? 'warning'
                  : 'neutral'
          }
        >
          {row.barrier_status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Bằng chứng & Chi tiết',
      render: (row) => (
        <div className="table-actions">
          <Button
            size="sm"
            variant="ghost"
            icon={row.snapshot_count > 0 ? <CameraIcon size={16} /> : <EyeIcon size={16} />}
            onClick={() => actions.inspectLog(row)}
          >
            {row.snapshot_count > 0 ? `Chi tiết (${row.snapshot_count} ảnh)` : 'Chi tiết'}
          </Button>
        </div>
      ),
    },
  ];

  const error = state.error ? normalizeError(state.error) : null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
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
          searchPlaceholder="Tìm mã sự kiện, biển số quan sát, mã lý do…"
          hasActiveFilters={hasActiveFilters}
          onReset={actions.resetFilters}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Select
              aria-label="Lọc theo hướng cổng"
              value={state.directionFilter}
              onChange={(e) =>
                actions.setDirectionFilter(e.target.value as typeof state.directionFilter)
              }
            >
              <option value="ALL">Mọi hướng cổng</option>
              <option value="ENTRY">Cổng vào (ENTRY)</option>
              <option value="EXIT">Cổng ra (EXIT)</option>
            </Select>
            <Select
              aria-label="Lọc theo quyết định xác minh"
              value={state.statusFilter}
              onChange={(e) => actions.setStatusFilter(e.target.value as typeof state.statusFilter)}
            >
              <option value="ALL">Mọi trạng thái xác minh</option>
              <option value="PASSED">Đạt (PASSED)</option>
              <option value="FAILED">Từ chối (FAILED)</option>
            </Select>
            <Select
              aria-label="Giới hạn tải nhật ký"
              value={String(state.limit)}
              onChange={(e) => actions.setLimit(Number(e.target.value))}
            >
              <option value="50">Tải 50 sự kiện gần nhất</option>
              <option value="100">Tải 100 sự kiện gần nhất</option>
              <option value="200">Tải 200 sự kiện gần nhất</option>
            </Select>
          </div>
        </DataTableFilter>
        {!hideHeaderActions && (
          <Button
            icon={<ArrowClockwiseIcon size={17} />}
            onClick={() => void actions.refresh()}
            pending={state.fetching}
          >
            Làm mới nhật ký
          </Button>
        )}
      </div>

      <AsyncBoundary onReset={() => void actions.refresh()}>
        <SpotlightCard padded={false}>
          {state.loading ? (
            <Skeleton />
          ) : error ? (
            <StatePanel
              kind={error.status === 403 ? 'forbidden' : 'error'}
              title="Chưa tải được nhật ký cổng"
              requestId={error.requestId}
              action={<Button onClick={() => void actions.refresh()}>Thử lại</Button>}
            >
              {error.message}
            </StatePanel>
          ) : pagedRows.length ? (
            <DataTable
              label="Nhật ký xác minh ra/vào cổng"
              rows={pagedRows}
              columns={columns}
              rowKey={(row) => row.id}
              maxHeight="520px"
            />
          ) : (
            <EmptyState
              title={hasActiveFilters ? 'Không có nhật ký phù hợp' : 'Chưa có nhật ký cổng'}
              action={
                hasActiveFilters ? (
                  <Button onClick={actions.resetFilters}>Xóa bộ lọc</Button>
                ) : undefined
              }
            >
              {hasActiveFilters
                ? 'Thử thay đổi bộ lọc hướng cổng hoặc trạng thái xác minh.'
                : 'Các sự kiện xác minh phương tiện tại cổng vào/ra sẽ hiển thị tại đây.'}
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
